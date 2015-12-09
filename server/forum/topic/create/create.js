// Create new topic
//
'use strict';

var _         = require('lodash');
var punycode  = require('punycode');
var cheequery = require('nodeca.core/lib/parser/cheequery');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid:              { type: 'integer', required: true },
    title:                    { type: 'string', required: true },
    txt:                      { type: 'string', required: true },
    attach:                   {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo', required: true }
    },
    option_no_mlinks:         { type: 'boolean', required: true },
    option_no_emojis:         { type: 'boolean', required: true },
    option_no_quote_collapse: { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (env.user_info.is_guest) {
      return N.io.FORBIDDEN;
    }
  });


  // Check title length
  //
  N.wire.before(apiPath, function check_title_length(env, callback) {
    env.extras.settings.fetch('forum_topic_title_min_length', function (err, min_length) {
      if (err) {
        callback(err);
        return;
      }

      if (punycode.ucs2.decode(env.params.title.trim()).length < min_length) {
        callback({
          code: N.io.CLIENT_ERROR,
          message: env.t('err_title_too_short', min_length)
        });
        return;
      }

      callback();
    });
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


  // Check permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {
    env.extras.settings.params.section_id = env.data.section._id;

    env.extras.settings.fetch('forum_can_start_topics', function (err, canStartTopics) {

      if (err) {
        callback(err);
        return;
      }

      if (!canStartTopics) {
        callback(N.io.FORBIDDEN);
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
        user_info: env.user_info
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


  // Create new topic
  //
  N.wire.after(apiPath, function create_topic(env, callback) {
    var topic = new N.models.forum.Topic();
    var post = new N.models.forum.Post();

    env.data.new_topic = topic;
    env.data.new_post  = post;

    // Fill post data
    post.user = env.user_info.user_id;
    post.ts = Date.now();
    post.attach = env.params.attach;
    post.tail = env.data.parse_result.tail;
    post.html = env.data.parse_result.html;
    post.md = env.params.txt;
    post.ip = env.req.ip;
    post.params = env.data.parse_options;
    post.imports = env.data.parse_result.imports;
    post.import_users = env.data.parse_result.import_users;
    post.image_info = env.data.parse_result.image_info;

    if (env.user_info.hb) {
      post.st  = N.models.forum.Post.statuses.HB;
      post.ste = N.models.forum.Post.statuses.VISIBLE;
    } else {
      post.st  = N.models.forum.Post.statuses.VISIBLE;
    }

    // Fill topic data
    topic.title = env.params.title.trim();
    topic.section = env.data.section._id;

    if (env.user_info.hb) {
      topic.st  = N.models.forum.Topic.statuses.HB;
      topic.ste = N.models.forum.Topic.statuses.OPEN;
    } else {
      topic.st  = N.models.forum.Topic.statuses.OPEN;
    }

    topic.cache = {};

    topic.cache.post_count = 1;

    topic.cache.first_post = post._id;
    topic.cache.first_ts = post.ts;
    topic.cache.first_user = post.user;

    topic.cache.last_post = post._id;
    topic.cache.last_ts = post.ts;
    topic.cache.last_user = post.user;

    topic.cache.attach_count = post.attach.length;

    _.assign(topic.cache_hb, topic.cache);

    topic.save(function (err) {

      if (err) {
        callback(err);
        return;
      }

      post.topic = topic._id;

      post.save(function (err) {

        if (err) {
          callback(err);
          return;
        }

        env.res.topic_hid = topic.hid;
        env.res.post_hid = post.hid;
        callback();
      });
    });
  });


  // Schedule image size fetch
  //
  N.wire.after(apiPath, function fill_image_info(env) {
    N.queue.worker('forum_post_images_fetch').postpone({
      post_id: env.data.new_post._id
    }, function () {});
  });


  // Update section counters
  //
  N.wire.after(apiPath, function update_section(env, callback) {
    var topic = env.data.new_topic;
    var incData = {};

    if (!env.user_info.hb) {
      incData['cache.post_count'] = 1;
      incData['cache.topic_count'] = 1;
    }

    incData['cache_hb.post_count'] = 1;
    incData['cache_hb.topic_count'] = 1;


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
};
