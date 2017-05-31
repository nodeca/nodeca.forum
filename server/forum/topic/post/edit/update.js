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
  N.wire.before(apiPath, function* attachments_check_owner(env) {
    yield N.wire.emit('internal:users.attachments_check_owner', env);
  });


  // Prepare parse options
  //
  N.wire.before(apiPath, function* prepare_options(env) {
    let settings = yield N.settings.getByCategory(
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
  N.wire.on(apiPath, function* parse_text(env) {
    env.data.parse_result = yield N.parser.md2html({
      text: env.params.txt,
      attachments: env.params.attach,
      options: env.data.parse_options,
      user_info: env.user_info
    });
  });


  // Check post length
  //
  N.wire.after(apiPath, function* check_post_length(env) {
    let min_length = yield env.extras.settings.fetch('forum_post_min_length');

    if (env.data.parse_result.text_length < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_text_too_short', min_length)
      };
    }
  });


  // Limit an amount of images in the post
  //
  N.wire.after(apiPath, function* check_images_count(env) {
    let max_images = yield env.extras.settings.fetch('forum_post_max_images');

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
  N.wire.after(apiPath, function* check_emoji_count(env) {
    let max_emojis = yield env.extras.settings.fetch('forum_post_max_emojis');

    if (max_emojis < 0) return;

    if ($.parse(env.data.parse_result.html).find('.emoji').length > max_emojis) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_emojis', max_emojis)
      };
    }
  });


  // Save old version in post history
  //
  N.wire.after(apiPath, async function save_post_history(env) {
    let orig_post = env.data.post;

    let last_revision = await N.models.forum.PostHistory.findOne({
      post: orig_post._id
    }).sort('-revision').lean(true);

    let last_update_time = last_revision ? last_revision.ts   : orig_post.ts;
    let last_update_user = last_revision ? last_revision.user : orig_post.user;
    let now = new Date();

    if (last_update_time > now - HISTORY_GRACE_PERIOD &&
        last_update_time < now &&
        String(last_update_user) === String(env.user_info.user_id)) {

      // if the same user edits the same post within grace period, squash the changes
      await N.models.forum.Post.update(
        { _id: orig_post._id },
        { $set: {
          last_edit_ts: new Date()
        } }
      );
      return;
    }

    /* eslint-disable no-undefined */
    await new N.models.forum.PostHistory({
      post:       orig_post._id,
      user:       env.user_info.user_id,
      md:         orig_post.md,
      tail:       orig_post.tail,
      title:      orig_post.hid <= 1 ? env.data.topic.title : undefined,
      params_ref: orig_post.params_ref,
      revision:   orig_post.revision
    }).save();

    await N.models.forum.Post.update(
      { _id: orig_post._id },
      { $set: {
        last_edit_ts: new Date(),
        revision: orig_post.revision + 1
      } }
    );
  });


  // Update post
  //
  N.wire.after(apiPath, function* post_update(env) {
    // save post using model to trigger 'post' hooks (e.g. param_ref update)
    let post = yield N.models.forum.Post
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

    yield post.save();
  });


  // Schedule image size fetch
  //
  N.wire.after(apiPath, function* fill_image_info(env) {
    yield N.queue.forum_post_images_fetch(env.data.post._id).postpone();
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, function* add_search_index(env) {
    yield N.queue.forum_posts_search_update_by_ids([ env.data.post._id ]).postpone();
  });


  function buildPostIds(env) {
    env.data.posts_ids = [ env.data.post._id ];
    return Promise.resolve();
  }

  // Fetch post
  //
  N.wire.after(apiPath, function* fetch_post(env) {
    env.data.topic_hid = env.data.topic.hid;
    env.data.build_posts_ids = buildPostIds;

    yield N.wire.emit('internal:forum.post_list', env);
  });
};
