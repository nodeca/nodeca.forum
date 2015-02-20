// Save new reply

'use strict';

var punycode = require('punycode');

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
    option_no_smiles: { type: 'boolean', required: true }
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
    N.models.forum.Topic.findOne({ hid: env.params.topic_hid }).lean(true).exec(function (err, topic) {
      if (err) {
        callback(err);
        return;
      }

      // TODO: check topic status and permissions
      if (!topic) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.topic = topic;
      callback();
    });
  });


  // Fetch parent post
  //
  N.wire.before(apiPath, function fetch_parent_post(env, callback) {
    if (!env.params.parent_post_id) {
      callback();
      return;
    }

    N.models.forum.Post.findOne({ _id: env.params.parent_post_id }).lean(true).exec(function (err, post) {
      if (err) {
        callback(err);
        return;
      }

      // TODO: check post status and permissions
      if (!post) {
        callback({
          code: N.io.CLIENT_ERROR,
          message: env.t('error_invalid_parent_post')
        });
        return;
      }

      env.data.parent_post = post;
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
    }, { user_id: env.user_info.user_id }, callback);
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


  // Check post length
  //
  N.wire.after(apiPath, function check_title_length(env, callback) {
    env.extras.settings.fetch('post_text_min_length', function (err, post_text_min_length) {
      if (err) {
        callback(err);
        return;
      }

      if (punycode.ucs2.decode(env.data.parse_result.text.trim()).length < post_text_min_length) {
        callback({
          code: N.io.CLIENT_ERROR,
          message: env.t('err_text_too_short', post_text_min_length)
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
    post.attach = env.params.attach.map(function (attach) {
      return attach.media_id;
    });
    post.html = env.data.parse_result.html;
    post.md = env.params.txt;
    post.ip = env.req.ip;
    post.st = statuses.VISIBLE;
    post.params = env.data.parse_options;
    // TODO: hellbanned

    if (env.data.parent_post) {
      post.to = env.data.parent_post;
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


  // Fill url of new post
  //
  N.wire.after(apiPath, function process_response(env) {

    // TODO: create internal method to get real post url
    env.res.redirect_url = N.router.linkTo('forum.topic',
      { section_hid: env.params.section_hid, hid: env.params.topic_hid, page: 9999 }
    ) + '#post' + env.data.new_post._id;
  });
};
