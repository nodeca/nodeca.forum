// Get post src html, update post
'use strict';


const $       = require('nodeca.core/lib/parser/cheequery');
const Promise = require('bluebird');

// If same user edits the same post within 5 minutes, all changes
// made within that period will be squashed into one diff.
const HISTORY_GRACE_PERIOD = 5 * 60 * 1000;


module.exports = function (N, apiPath) {

  N.validate(apiPath,         {
    post_id:                  { format: 'mongo', required: true },
    txt:                      { type: 'string', required: true },
    attach:                   {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo', required: true }
    },
    option_no_mlinks:         { type: 'boolean', required: true },
    option_no_emojis:         { type: 'boolean', required: true },
    option_no_quote_collapse: { type: 'boolean', required: true },
    as_moderator:             { type: 'boolean', required: true }
  });


  // Fetch post data and check permissions
  //
  N.wire.before(apiPath, function fetch_post_data(env) {
    return N.wire.emit('server:forum.topic.post.edit.index', env);
  });


  // Check attachments owner
  //
  N.wire.before(apiPath, async function attachments_check_owner(env) {
    await N.wire.emit('internal:users.attachments_check_owner', env);
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

    env.data.parse_options = settings;
  });


  // Parse user input to HTML
  //
  N.wire.on(apiPath, async function parse_text(env) {
    env.data.parse_result = await N.parser.md2html({
      text: env.params.txt,
      attachments: env.params.attach,
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
    let tail        = env.data.parse_result.tail.length;

    if (images + attachments + tail > max_images) {
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

    post.tail         = env.data.parse_result.tail;
    post.attach       = env.params.attach;
    post.html         = env.data.parse_result.html;
    post.md           = env.params.txt;
    post.params       = env.data.parse_options;
    post.imports      = env.data.parse_result.imports;
    post.import_users = env.data.parse_result.import_users;

    env.data.post_new = await post.save();
  });


  // Save old version in post history
  //
  // NOTE: code is the same as in forum.topic.title_update (changes marked)
  //
  N.wire.after(apiPath, async function save_post_history(env) {
    // post fetch differs in forum.topic.title_update
    let orig_post = env.data.post;
    let new_post  = env.data.post_new;

    let last_entry = await N.models.forum.PostHistory.findOne({
      post: orig_post._id
    }).sort('-_id').lean(true);

    let last_update_time = last_entry ? last_entry.ts   : orig_post.ts;
    let last_update_user = last_entry ? last_entry.user : orig_post.user;
    let now = new Date();

    // if the same user edits the same post within grace period, history won't be changed
    if (!(last_update_time > now - HISTORY_GRACE_PERIOD &&
          last_update_time < now &&
          String(last_update_user) === String(env.user_info.user_id))) {

      /* eslint-disable no-undefined */
      last_entry = await new N.models.forum.PostHistory({
        post:       orig_post._id,
        user:       env.user_info.user_id,
        md:         orig_post.md,
        tail:       orig_post.tail,
        title:      orig_post.hid <= 1 ? env.data.topic.title : undefined,
        params_ref: orig_post.params_ref
      }).save();
    }

    // if the next history entry would be the same as the last one
    // (e.g. user saves post without changes or reverts change within 5 min),
    // remove redundant history entry
    if (last_entry) {
      let last_post_str = JSON.stringify({
        post:       last_entry.post,
        user:       last_entry.user,
        md:         last_entry.md,
        tail:       last_entry.tail,
        title:      last_entry.title,
        params_ref: last_entry.params_ref
      });

      let next_post_str = JSON.stringify({
        post:       new_post._id,
        user:       env.user_info.user_id,
        md:         new_post.md,
        tail:       new_post.tail,
        // title is calculated differently in forum.topic.title_update
        title:      new_post.hid <= 1 ? env.data.topic.title : undefined,
        params_ref: new_post.params_ref
      });

      if (last_post_str === next_post_str) {
        await N.models.forum.PostHistory.remove({ _id: last_entry._id });
      }
    }

    await N.models.forum.Post.update(
      { _id: orig_post._id },
      { $set: {
        last_edit_ts: new Date(),
        edit_count: await N.models.forum.PostHistory.count({ post: orig_post._id })
      } }
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
