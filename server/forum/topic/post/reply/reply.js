// Save new reply

'use strict';

var punycode  = require('punycode');
var cheequery = require('nodeca.core/lib/parser/cheequery');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:        { type: 'integer', required: true },
    parent_post_id:   { format: 'mongo' },
    section_hid:      { type: 'integer', required: true },
    txt:              { type: 'string', required: true },
    attach:           {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: {
        type: 'object',
        properties: {
          media_id: { format: 'mongo', required: true },
          file_name: 'string',
          type: 'integer'
        }
      }
    },
    option_no_mlinks: { type: 'boolean', required: true },
    option_no_emojis: { type: 'boolean', required: true }
  });


  // Check user permission
  //
  N.wire.before(apiPath, function check_permissions(env) {
    if (env.user_info.is_guest) {
      return N.io.NOT_FOUND;
    }
  });


  // Fetch section info
  //
  N.wire.before(apiPath, function fetch_section_info(env, callback) {

    N.models.forum.Section.findOne({ hid: env.params.section_hid }).lean(true).exec(function (err, section) {
      if (err) {
        callback(err);
        return;
      }

      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.section = section;
      callback();
    });
  });


  // Check permission to reply in this section
  //
  N.wire.before(apiPath, function check_can_reply(env, callback) {
    env.extras.settings.params.section_id = env.data.section._id;

    env.extras.settings.fetch('forum_can_reply', function (err, forum_can_reply) {
      if (err) {
        callback(err);
        return;
      }

      if (!forum_can_reply) {
        callback(N.io.NOT_FOUND);
        return;
      }

      callback();
    });
  });


  // Check attachments owner
  //
  N.wire.before(apiPath, function attachments_check_owner(env, callback) {
    N.wire.emit('internal:users.attachments_check_owner', env, callback);
  });


  // Fetch topic info
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    var Topic = N.models.forum.Topic;

    Topic.findOne({ hid: env.params.topic_hid }).lean(true).exec(function (err, topic) {
      if (err) {
        callback(err);
        return;
      }

      if (!topic) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.topic = topic;
      callback();
    });
  });


  // Check if user can see this topic
  //
  N.wire.before(apiPath, function check_access(env, callback) {
    N.wire.emit('internal:forum.access.topic', {
      env:    env,
      params: { topic_hid: env.data.topic.hid }
    }, function (err) {
      if (err) {
        callback(err);
        return;
      }

      if (!env.data.access_read) {
        callback(N.io.NOT_FOUND);
        return;
      }

      callback();
    });
  });


  // Fetch parent post
  //
  N.wire.before(apiPath, function fetch_parent_post(env, callback) {
    var Post = N.models.forum.Post;

    if (!env.params.parent_post_id) {
      callback();
      return;
    }

    Post.findOne({ _id: env.params.parent_post_id }).lean(true).exec(function (err, post) {
      if (err) {
        callback(err);
        return;
      }

      if (!post) {
        callback({
          code: N.io.CLIENT_ERROR,
          message: env.t('error_invalid_parent_post')
        });
        return;
      }

      env.data.post = post;

      N.wire.emit('internal:forum.access.post', {
        env:    env,
        params: { topic_hid: env.data.topic.hid, post_hid: env.data.post.hid }
      }, function (err) {
        if (err) {
          callback(err);
          return;
        }

        if (!env.data.access_read) {
          callback({
            code: N.io.CLIENT_ERROR,
            message: env.t('error_invalid_parent_post')
          });
          return;
        }

        callback();
      });
    });
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

      var ast = cheequery(env.data.parse_result.html);

      ast.find('.emoji').remove();

      if (punycode.ucs2.decode(ast.text().replace(/\s+/g, ' ').trim()).length < min_length) {
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


  // Save new post
  //
  N.wire.after(apiPath, function save_new_post(env, callback) {
    var statuses = N.models.forum.Post.statuses;
    var post = new N.models.forum.Post();

    post.tail = env.data.parse_result.tail;
    post.imports = env.data.parse_result.imports;
    post.attach = env.params.attach.map(function (attach) {
      return attach.media_id;
    });
    post.html = env.data.parse_result.html;
    post.md = env.params.txt;
    post.ip = env.req.ip;
    post.params = env.data.parse_options;

    if (env.user_info.hb) {
      post.st  = statuses.HB;
      post.ste = statuses.VISIBLE;
    } else {
      post.st  = statuses.VISIBLE;
    }

    if (env.data.post) {
      post.to = env.data.post._id;
      post.to_user = env.data.post.user;
    }

    post.topic = env.data.topic._id;
    post.user = env.user_info.user_id;

    post.save(function (err) {
      if (err) {
        callback(err);
        return;
      }

      env.data.new_post = post;

      callback();
    });
  });


  // Update topic counters
  //
  N.wire.after(apiPath, function update_topic(env, callback) {
    var statuses = N.models.forum.Post.statuses;
    var post = env.data.new_post;
    var incData = {};

    if (post.st === statuses.VISIBLE) {
      incData['cache.post_count'] = 1;
      incData['cache.attach_count'] = post.attach.length;
    }

    incData['cache_hb.post_count'] = 1;
    incData['cache_hb.attach_count'] = post.attach.length;


    N.models.forum.Topic.update(
      { _id: env.data.topic._id },
      { $inc: incData },
      function (err) {

        if (err) {
          callback(err);
          return;
        }

        N.models.forum.Topic.updateCache(env.data.topic._id, false, callback);
      }
    );
  });


  // Update section counters
  //
  N.wire.after(apiPath, function update_section(env, callback) {
    var post_statuses = N.models.forum.Post.statuses;
    var topic_statuses = N.models.forum.Topic.statuses;
    var topic = env.data.topic;
    var post = env.data.new_post;
    var incData = {};

    // Increment normal cache if both topic and post are visible
    //
    if (post.st === post_statuses.VISIBLE && topic_statuses.LIST_VISIBLE.indexOf(topic.st) !== -1) {
      incData['cache.post_count'] = 1;
    }

    // Increment hb cache for any post if topic is visible or hb (but not deleted)
    //
    if (topic_statuses.LIST_VISIBLE.concat([ topic_statuses.HB ]).indexOf(topic.st) !== -1) {
      incData['cache_hb.post_count'] = 1;
    }


    N.models.forum.Section.getParentList(topic.section, function (err, parents) {
      if (err) {
        callback(err);
        return;
      }

      N.models.forum.Section.update(
        { _id: { $in: parents.concat([ topic.section ]) } },
        { $inc: incData },
        { multi: true },
        function (err) {
          if (err) {
            callback(err);
            return;
          }

          N.models.forum.Section.updateCache(topic.section, false, callback);
        }
      );
    });
  });


  // Fill url of new post
  //
  N.wire.after(apiPath, function process_response(env) {
    env.res.redirect_url = N.router.linkTo('forum.topic', {
      section_hid: env.params.section_hid,
      topic_hid: env.params.topic_hid,
      post_hid: env.data.new_post.hid
    });
  });
};
