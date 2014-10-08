// Save new reply

'use strict';

var async      = require('async');
var medialinks = require('nodeca.core/lib/parser/medialinks');

// topic and post statuses
var statuses = require('../../_lib/statuses.js');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:       { type: 'integer', required: true },
    parent_post_id:  { type: 'string' },
    post_text:       { type: 'string', required: true },
    section_hid:     { type: 'integer', required: true },
    attach_list:     { type: 'array', required: true },
    option_nomlinks: { type: 'boolean', required: true },
    option_nosmiles: { type: 'boolean', required: true }
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
  N.wire.before(apiPath, function save_options(/*env, callback*/) {
    // TODO: implementation
  });


  // Parse user input to HTML
  //
  N.wire.before(apiPath, function parse_text(env, callback) {

    var providers = env.params.option_nomlinks ?
                    [] :
                    medialinks(N.config.medialinks.providers, N.config.medialinks.content);

    var data = {
      input: env.params.post_text,
      output: null, // will be cheerio instance
      options:
      {
        cleanupRules: N.config.parser.cleanup,
        smiles: env.params.option_nosmiles ? {} : N.config.smiles,
        medialinkProviders: providers
      }
    };

    N.parser.src2ast(data, function (err) {
        if (err) {
          callback(err);
          return;
        }

        env.params.post_text = data.output.html();
        // TODO: save data.output.text() for search reasons
        callback();
      }
    );
  });


  // Check attachments owner
  //
  N.wire.before(apiPath, function check_attachments(env, callback) {

    async.each(env.params.attach_list, function (attach, next) {

      N.models.users.Media.count(
        { file_id: attach, exists: true, user_id: env.session.user_id  },
        function (err, count) {

          if (err) {
            next(err);
            return;
          }

          if (count === 0) {
            next(N.io.FORBIDDEN);
            return;
          }

          next();
        }
      );
    }, callback);
  });


  // Save new post
  //
  N.wire.on(apiPath, function save_new_post(env, callback) {

    var post = new N.models.forum.Post();

    post.attach_list = env.params.attach_list;
    post.text = env.params.post_text;
    post.ip = env.req.ip;
    post.st = statuses.post.VISIBLE;
    // TODO: hellbanned

    if (env.data.parent_post) {
      post.to = env.data.parent_post;
    }

    post.topic = env.data.topic._id;
    post.user = env.session.user_id;

    post.save(function (err) {
      if (err) {
        callback(err);
        return;
      }

      env.data.new_post = post;

      callback();
    });
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
