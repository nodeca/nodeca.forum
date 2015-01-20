// Create new topic
//
'use strict';

var _        = require('lodash');
var punycode = require('punycode');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid:      { type: 'integer', required: true },
    title:            { type: 'string', required: true },
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
    option_no_smiles: { type: 'boolean', required: true }
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
    env.extras.settings.fetch('topic_title_min_length', function (err, topic_title_min_length) {
      if (err) {
        callback(err);
        return;
      }

      if (punycode.ucs2.decode(env.params.title.trim()).length < topic_title_min_length) {
        // Real check is done on the client, no need to care about details here
        callback(N.io.BAD_REQUEST);
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


  // Save post options
  //
  N.wire.before(apiPath, function save_options(env, callback) {
    var userStore = N.settings.getStore('user');

    userStore.set({
      edit_no_mlinks: { value: env.params.option_no_mlinks },
      edit_no_smiles: { value: env.params.option_no_smiles }
    }, { user_id: env.session.user_id }, callback);
  });


  // Prepare parse options
  //
  N.wire.before(apiPath, function prepare_options(env, callback) {
    N.settings.getByCategory(
      'forum_markup',
      { usergroup_ids: env.extras.settings.params.usergroup_ids },
      { alias: true },
      function (err, settings) {
        if (err) {
          callback(err);
          return;
        }

        if (env.params.option_no_mlinks) {
          settings.medialinks = false;
        }

        if (env.params.option_no_smiles) {
          settings.smiles = false;
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
        options: env.data.parse_options
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


  // Create new topic
  //
  N.wire.after(apiPath, function create_topic(env, callback) {
    var topic = new N.models.forum.Topic();
    var post = new N.models.forum.Post();

    // Fill post data
    post.user = env.session.user_id;
    post.ts = Date.now();
    post.attach = env.params.attach.map(function (attach) {
      return attach.media_id;
    });
    post.tail = env.data.parse_result.tail;
    post.html = env.data.parse_result.html;
    post.md = env.params.txt;
    post.ip = env.req.ip;
    post.st = N.models.forum.Post.statuses.VISIBLE;
    post.params = env.data.parse_options;

    // Fill topic data
    topic.title = env.params.title.trim();
    topic.section = env.data.section._id;

    // TODO: hellbanned
    topic.st = N.models.forum.Topic.statuses.OPEN;

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
        callback();
      });
    });
  });
};
