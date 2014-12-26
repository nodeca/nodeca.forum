// Create new topic
//
'use strict';

var _          = require('lodash');
var punycode   = require('punycode');
var medialinks = require('nodeca.core/lib/parser/medialinks');
var $          = require('nodeca.core/lib/parser/cheequery');

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


  // Check title length
  //
  N.wire.before(apiPath, function check_title_length(env, callback) {
    env.extras.settings.fetch('topic_title_min_length', function (err, topic_title_min_length) {
      if (err) {
        callback(err);
        return;
      }

      if (punycode.ucs2.decode(env.params.topic_title.trim()).length < topic_title_min_length) {
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

  // TODO: move code below to internal method (copy-paste from forum.topic.post.replay.create)

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


  // Fetch `attach_refs` and `attach_tail`
  //
  N.wire.before(apiPath, function fetch_attachments(env, callback) {
    var tail = env.params.attach_tail;
    var refs = [];

    // Find all attachments inserted to text
    env.data.ast.find('img[data-nd-media-id], a[data-nd-media-id]').each(function () {
      refs.push($(this).data('nd-media-id'));
    });

    refs = _.uniq(refs);

    // Remove refs from tail
    tail = _.remove(tail, function(id) {
      return refs.indexOf(id) === -1;
    });

    env.data.attach_refs = _.union(refs, tail);

    // Fetch tail attachments
    N.models.users.MediaInfo.find({
      media_id: { $in: tail },
      type: { $in: N.models.users.MediaInfo.types.LIST_VISIBLE },
      user_id: env.session.user_id
    }).lean(true).select('media_id file_name type').exec(function (err, attachments) {

      if (err) {
        callback(err);
        return;
      }

      // TODO: check attach_refs owner
      env.data.attach_refs = refs;
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
    post.st = N.models.forum.Post.statuses.VISIBLE;
    post.params = {
      no_mlinks: env.params.option_no_mlinks,
      no_smiles: env.params.option_no_smiles
    };

    // Fill topic data
    topic.title = env.params.topic_title.trim();
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
