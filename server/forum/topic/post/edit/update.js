// Get post src html, update post
'use strict';

var cheequery = require('nodeca.core/lib/parser/cheequery');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id:          { format: 'mongo', required: true },
    txt:              { type: 'string', required: true },
    attach:           {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo', required: true }
    },
    option_no_mlinks: { type: 'boolean', required: true },
    option_no_emojis: { type: 'boolean', required: true },
    as_moderator:     { type: 'boolean', required: true }
  });


  // Fetch post data and check permissions
  //
  N.wire.before(apiPath, function fetch_post_data(env, callback) {
    N.wire.emit('server:forum.topic.post.edit.index', env, callback);
  });


  // Check attachments owner
  //
  N.wire.before(apiPath, function attachments_check_owner(env, callback) {
    N.wire.emit('internal:users.attachments_check_owner', env, callback);
  });


  // Save post options
  //
  N.wire.before(apiPath, function save_options(env, callback) {
    var userStore = N.settings.getStore('user');

    userStore.set({
      edit_no_mlinks: { value: env.params.option_no_mlinks },
      edit_no_emojis: { value: env.params.option_no_emojis }
    }, { user_id: env.user_info.user_id }, callback);
  });


  // Prepare parse options
  //
  N.wire.before(apiPath, function prepare_options(env, callback) {
    N.settings.getByCategory(
      'forum_markup',
      { usergroup_ids: env.user_info.usergroups },
      { alias: true },
      function (err, settings) {
        if (err) {
          callback(err);
          return;
        }

        if (env.params.option_no_mlinks) {
          settings.medialink = false;
        }

        if (env.params.option_no_emojis) {
          settings.emoji = false;
        }

        env.data.parse_options = settings;
        callback();
      }
    );
  });


  // Parse user input to HTML
  //
  N.wire.on(apiPath, function parse_text(env, callback) {
    N.parse(
      {
        text: env.params.txt,
        attachments: env.params.attach,
        options: env.data.parse_options,
        image_info: env.data.post.image_info,
        env: env
      },
      function (err, result) {
        if (err) {
          callback(err);
          return;
        }

        env.data.parse_result = result;
        callback();
      }
    );
  });


  // Check post length
  //
  N.wire.after(apiPath, function check_post_length(env, callback) {
    env.extras.settings.fetch('forum_post_text_min_length', function (err, min_length) {
      if (err) {
        callback(err);
        return;
      }

      if (env.data.parse_result.text_length < min_length) {
        callback({
          code: N.io.CLIENT_ERROR,
          message: env.t('err_text_too_short', min_length)
        });
        return;
      }

      callback();
    });
  });


  // Limit an amount of images in the post
  //
  N.wire.after(apiPath, function check_images_count(env, callback) {
    env.extras.settings.fetch('forum_post_text_max_images', function (err, max_images) {
      if (err) {
        callback(err);
        return;
      }

      if (max_images <= 0) {
        callback();
        return;
      }

      var ast         = cheequery(env.data.parse_result.html);
      var images      = ast.find('.image').length;
      var attachments = ast.find('.attach').length;
      var tail        = env.data.parse_result.tail.length;

      if (images + attachments + tail > max_images) {
        callback({
          code: N.io.CLIENT_ERROR,
          message: env.t('err_too_many_images', max_images)
        });
        return;
      }

      callback();
    });
  });


  // Limit an amount of emoticons in the post
  //
  N.wire.after(apiPath, function check_emoji_count(env, callback) {
    env.extras.settings.fetch('forum_post_text_max_emojis', function (err, max_emojis) {
      if (err) {
        callback(err);
        return;
      }

      if (max_emojis < 0) {
        callback();
        return;
      }

      if (cheequery(env.data.parse_result.html).find('.emoji').length > max_emojis) {
        callback({
          code: N.io.CLIENT_ERROR,
          message: env.t('err_too_many_emojis', max_emojis)
        });
        return;
      }

      callback();
    });
  });


  // Update post
  //
  N.wire.after(apiPath, function post_update(env, callback) {
    N.models.forum.Post
        .findOne({ _id: env.data.post._id })
        .lean(false)
        .exec(function (err, post) {

      if (err) {
        callback(err);
        return;
      }

      if (!post) {
        callback(N.io.NOT_FOUND);
        return;
      }

      post.tail         = env.data.parse_result.tail;
      post.attach       = env.params.attach;
      post.html         = env.data.parse_result.html;
      post.md           = env.params.txt;
      post.params       = env.data.parse_options;
      post.imports      = env.data.parse_result.imports;
      post.import_users = env.data.parse_result.import_users;
      post.image_info   = env.data.parse_result.image_info;

      post.save(callback);
    });
  });


  function buildPostIds(env, callback) {
    env.data.posts_ids = [ env.data.post._id ];
    callback();
  }


  // Schedule image size fetch
  //
  N.wire.after(apiPath, function fill_image_info(env) {
    N.queue.postpone('forum_post_images_fetch', {
      post_id: env.data.post._id
    }, function () {});
  });


  // Fetch post
  //
  N.wire.after(apiPath, function fetch_post(env, callback) {
    env.data.topic_hid = env.data.topic.hid;
    env.data.build_posts_ids = buildPostIds;

    N.wire.emit('internal:forum.post_list', env, callback);
  });
};
