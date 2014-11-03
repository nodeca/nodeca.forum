// Get post src html, update post
'use strict';

var _          = require('lodash');
var medialinks = require('nodeca.core/lib/parser/medialinks');
var $          = require('nodeca.core/lib/parser/cheequery');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    moderator_action: { type: 'boolean', required: true },
    post_id:          { type: 'string', required: true },
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


  // Fetch post data and check permissions
  //
  N.wire.before(apiPath, function fetch_post_data(env, callback) {
    N.wire.emit('server:forum.topic.post_edit.fetch', env, callback);
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


  // Update post
  //
  N.wire.on(apiPath, function post_update(env, callback) {
    var updateData = {
      attach_tail: env.data.attach_tail,
      attach_refs: env.data.attach_refs,
      html:        env.data.post_html,
      md:          env.params.post_md,
      params:      { no_mlinks: env.params.option_no_mlinks, no_smiles: env.params.option_no_smiles }
    };

    N.models.forum.Post.update({ _id: env.params.post_id }, updateData, function (err) {

      if (err) {
        callback(err);
        return;
      }

      env.res.post = { html: updateData.html, attach_tail: updateData.attach_tail };

      callback();
    });
  });
};
