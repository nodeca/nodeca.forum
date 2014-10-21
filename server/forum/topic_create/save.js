// Create new topic
//
'use strict';

var _          = require('lodash');
var medialinks = require('nodeca.core/lib/parser/medialinks');
var $          = require('nodeca.core/lib/parser/cheequery');

// topic and post statuses
var statuses   = require('../_lib/statuses.js');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid:      { type: 'integer', required: true },
    topic_title:      { type: 'string', required: true },
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


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (env.user_info.is_guest) {
      return N.io.FORBIDDEN;
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

  // TODO: move code below to internal method (copy-paste from forum.topic.post_replay.save)

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

    N.models.users.Media.find({
      file_id: { $in: tail },
      exists: true,
      user_id: env.session.user_id
    }).lean(true).select('file_id file_name type').exec(function (err, attachments) {

      if (err) {
        callback(err);
        return;
      }

      env.data.attach_tail = attachments;

      callback();
    });
  });


  // Create new topic
  //
  N.wire.on(apiPath, function check_permissions(env, callback) {
    var topic = new N.models.forum.Topic();
    var post = new N.models.forum.Post();

    // Fill post data
    post.user = env.session.user_id;
    post.ts = Date.now();
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

    // Fill topic data
    topic.title = env.params.topic_title;
    topic.section = env.data.section._id;

    // TODO: hellbanned
    topic.st = statuses.topic.OPEN;
    topic.ste = statuses.topic.OPEN;

    topic.cache = {};

    topic.cache.post_count = 1;

    topic.cache.first_post = post._id;
    topic.cache.first_ts = post.ts;
    topic.cache.first_user = post.user;

    topic.cache.last_post = post._id;
    topic.cache.last_ts = post.ts;
    topic.cache.last_user = post.user;

    topic.cache.attach_count = post.attach_refs.length;

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
