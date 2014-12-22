// Get post src html, update post
'use strict';

var _          = require('lodash');
var medialinks = require('nodeca.core/lib/parser/medialinks');
var $          = require('nodeca.core/lib/parser/cheequery');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id:          { format: 'mongo', required: true },
    post_md:          { type: 'string', required: true },
    attach_tail:      {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo' }
    },
    option_no_mlinks: { type: 'boolean', required: true },
    option_no_smiles: { type: 'boolean', required: true },
    as_moderator:     { type: 'boolean', required: true }
  });


  // Fetch post data and check permissions
  //
  N.wire.before(apiPath, function fetch_post_data(env, callback) {
    N.wire.emit('server:forum.topic.post.edit.index', env, callback);
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


  // Update post
  //
  N.wire.on(apiPath, function post_update(env, callback) {
    var updateData = {
      attach_tail: env.data.attach_tail,
      attach_refs: env.data.attach_refs,
      html:        env.data.post_html,
      md:          env.params.post_md,
      params:      {
        no_mlinks: env.params.option_no_mlinks,
        no_smiles: env.params.option_no_smiles
      }
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
