// Get post src html, update post
'use strict';


const $       = require('nodeca.core/lib/parser/cheequery');


module.exports = function (N, apiPath) {

  N.validate(apiPath,         {
    post_id:                  { format: 'mongo', required: true },
    txt:                      { type: 'string', required: true },
    option_no_mlinks:         { type: 'boolean', required: true },
    option_no_emojis:         { type: 'boolean', required: true },
    option_no_quote_collapse: { type: 'boolean', required: true },
    option_breaks:            { type: 'boolean', required: true },
    as_moderator:             { type: 'boolean', required: true }
  });


  // Fetch post data and check permissions
  //
  N.wire.before(apiPath, function fetch_post_data(env) {
    return N.wire.emit('server:forum.topic.post.edit.index', env);
  });


  // Prepare parse options
  //
  N.wire.before(apiPath, async function prepare_options(env) {
    let settings = await N.settings.getByCategory(
      'forum_posts_markup',
      { usergroup_ids: env.user_info.usergroups },
      { alias: true }
    );

    if (env.params.option_no_mlinks) {
      settings.link_to_title = false;
      settings.link_to_snippet = false;
    }

    if (env.params.option_no_emojis) {
      settings.emoji = false;
    }

    if (env.params.option_no_quote_collapse) {
      settings.quote_collapse = false;
    }

    if (env.params.option_breaks) {
      settings.breaks = true;
    }

    env.data.parse_options = settings;
  });


  // Parse user input to HTML
  //
  N.wire.on(apiPath, async function parse_text(env) {
    env.data.parse_result = await N.parser.md2html({
      text: env.params.txt,
      options: env.data.parse_options,
      user_info: env.user_info
    });
  });


  // Check post length
  //
  N.wire.after(apiPath, async function check_post_length(env) {
    let min_length = await env.extras.settings.fetch('forum_post_min_length');

    if (env.data.parse_result.text_length < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_text_too_short', min_length)
      };
    }
  });


  // Limit an amount of images in the post
  //
  N.wire.after(apiPath, async function check_images_count(env) {
    let max_images = await env.extras.settings.fetch('forum_post_max_images');

    if (max_images <= 0) return;

    let ast         = $.parse(env.data.parse_result.html);
    let images      = ast.find('.image').length;
    let attachments = ast.find('.attach').length;

    if (images + attachments > max_images) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_images', max_images)
      };
    }
  });


  // Limit an amount of emoticons in the post
  //
  N.wire.after(apiPath, async function check_emoji_count(env) {
    let max_emojis = await env.extras.settings.fetch('forum_post_max_emojis');

    if (max_emojis < 0) return;

    if ($.parse(env.data.parse_result.html).find('.emoji').length > max_emojis) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_emojis', max_emojis)
      };
    }
  });


  // Update post
  //
  N.wire.after(apiPath, async function post_update(env) {
    // save post using model to trigger 'post' hooks (e.g. param_ref update)
    let post = await N.models.forum.Post
        .findOne({ _id: env.data.post._id })
        .lean(false);

    if (!post) throw N.io.NOT_FOUND;

    post.html         = env.data.parse_result.html;
    post.md           = env.params.txt;
    post.params       = env.data.parse_options;
    post.imports      = env.data.parse_result.imports;
    post.import_users = env.data.parse_result.import_users;

    env.data.new_post = await post.save();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.forum.PostHistory.add(
      {
        old_post: env.data.post,
        new_post: env.data.new_post
      },
      {
        user: env.user_info.user_id,
        role: N.models.forum.PostHistory.roles[env.params.as_moderator ? 'MODERATOR' : 'USER'],
        ip:   env.req.ip
      }
    );
  });


  // Schedule image size fetch
  //
  N.wire.after(apiPath, async function fill_image_info(env) {
    await N.queue.forum_post_images_fetch(env.data.post._id).postpone();
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.forum_posts_search_update_by_ids([ env.data.post._id ]).postpone();
  });


  function buildPostIds(env) {
    env.data.posts_ids = [ env.data.post._id ];
    return Promise.resolve();
  }

  // Fetch post
  //
  N.wire.after(apiPath, async function fetch_post(env) {
    env.data.topic_hid = env.data.topic.hid;
    env.data.build_posts_ids = buildPostIds;

    await N.wire.emit('internal:forum.post_list', env);
  });
};
