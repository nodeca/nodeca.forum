// Save new reply

'use strict';

var _          = require('lodash');
var medialinks = require('nodeca.core/lib/parser/medialinks');
var $          = require('nodeca.core/lib/parser/cheequery');

// topic and post statuses
var statuses   = require('nodeca.forum/server/forum/_lib/statuses.js');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:        { type: 'integer', required: true },
    parent_post_id:   { type: 'string' },
    section_hid:      { type: 'integer', required: true },
    post_md:          { type: 'string', required: true },
    attach_tail:      {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo' }
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
    }, { user_id: env.session.user_id }, callback);
  });


  // Parse user input to HTML
  //
  N.wire.before(apiPath, function parse_text(env, callback) {

    var providers = env.params.option_no_mlinks ?
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
          smiles: env.params.option_no_smiles ? {} : N.config.smiles,
          medialinkProviders: providers,
          baseUrl: env.origin.req.headers.host // TODO: get real domains from config
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
    var MEDIA_ID_RE = /.*?\/(files|member[0-9]+\/media)\/([0-9a-f]{24}).*/;

    // Find all images in post
    ast.find('img').each(function () {
      src = $(this).attr('src');

      if (!MEDIA_ID_RE.test(src)) {
        return;
      }

      // Get file_id from url
      src = src.replace(MEDIA_ID_RE, '$2');

      result.push(src);
    });

    // Find all links in post
    ast.find('a').each(function () {
      src = $(this).attr('href');

      if (!MEDIA_ID_RE.test(src)) {
        return;
      }

      // Get file_id from url
      src = src.replace(MEDIA_ID_RE, '$2');

      result.push(src);
    });

    result = _.uniq(result);

    env.data.attach_refs = result;
  });

  // TODO: check attach_refs!!!

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

    N.models.users.MediaInfo.find({
      media_id: { $in: tail },
      type: { $in: N.models.users.MediaInfo.types.LIST_VISIBLE },
      user_id: env.session.user_id
    }).lean(true).select('media_id file_name type').exec(function (err, attachments) {

      if (err) {
        callback(err);
        return;
      }

      env.data.attach_tail = attachments;

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
    post.params = {
      no_mlinks: env.params.option_no_mlinks,
      no_smiles: env.params.option_no_smiles
    };
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


  // Update topic counters
  //
  N.wire.after(apiPath, function update_topic(env, callback) {

    var post = env.data.new_post;
    var incData = {};

    if (post.st === statuses.post.VISIBLE) {
      incData['cache.post_count'] = 1;
      incData['cache.attach_count'] = post.attach_refs.length;
    }

    incData['cache_hb.post_count'] = 1;
    incData['cache_hb.attach_count'] = post.attach_refs.length;


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
