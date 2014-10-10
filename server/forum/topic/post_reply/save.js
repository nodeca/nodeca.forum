// Save new reply

'use strict';

var _          = require('lodash');
var medialinks = require('nodeca.core/lib/parser/medialinks');
var $          = require('nodeca.core/lib/parser/cheequery');

// topic and post statuses
var statuses   = require('../../_lib/statuses.js');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:       { type: 'integer', required: true },
    parent_post_id:  { type: 'string' },
    section_hid:     { type: 'integer', required: true },
    post_md:         { type: 'string', required: true },
    attach_tail:     {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo' }
    },
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

    var mdData = { input: env.params.post_md, output: null };

    N.parser.md2src(mdData, function (err) {
      if (err) {
        callback(err);
        return;
      }

      var srcData = {
        input: mdData.output,
        output: null, // will be cheerio instance
        options:
        {
          cleanupRules: N.config.parser.cleanup,
          smiles: env.params.option_nosmiles ? {} : N.config.smiles,
          medialinkProviders: providers
        }
      };

      N.parser.src2ast(srcData, function (err) {
          if (err) {
            callback(err);
            return;
          }

          env.data.ast = srcData.output;
          env.data.post_html = srcData.output.html();
          // TODO: save data.output.text() for search reasons
          callback();
        }
      );
    });
  });


  // Fetch attachments from post body
  //
  N.wire.before(apiPath, function fetch_attachments(env) {
    var ast = env.data.ast;
    var result = [];
    var src;
    var urlCutRE = /\/files\/([0-9a-f]{24}).*/;

    ast.find('img').each(function () {
      src = $(this).attr('src');
      src = src.replace(urlCutRE, '$1');

      result.push(src);
    });

    result = _.uniq(result);

    env.data.attach_refs = result;
  });


  // Fetch tail attachments
  //
  N.wire.before(apiPath, function check_attachments(env, callback) {
    var tail = env.params.attach_tail;
    var refs = env.data.attach_refs;

    // Remove refs from tail
    tail = _.remove(tail, function(id) {
      return refs.indexOf(id) === -1;
    });

    env.data.attach_refs = _.union(refs, tail);

    N.models.users.Media.find({
      file_id: { $in: tail },
      exists: true,
      user_id: env.session.user_id
    }).lean(true).select('file_id file_name').exec(function (err, attachments) {

      if (err) {
        callback(err);
        return;
      }

      env.data.attach_tail = _.map(attachments, function (attach) {
        return { id: attach.file_id, name: attach.file_name };
      });

      callback();
    });
  });


  // Save new post
  //
  N.wire.on(apiPath, function save_new_post(env, callback) {

    var post = new N.models.forum.Post();

    post.attach_tail = env.data.attach_tail;
    post.attach_refs = env.data.attach_refs;
    post.html = env.data.post_html;
    post.md = env.params.post_md;
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
