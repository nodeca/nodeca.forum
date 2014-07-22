// Get post src html, update post
'use strict';

var _ = require('lodash');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id:     { type: 'string', required: true },
    section_hid: { type: 'integer', required: true },
    topic_hid:   { type: 'integer', required: true },
    post_text:   { type: 'string' }
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


  // Fetch post
  //
  N.wire.before(apiPath, function fetch_post(env, callback) {
    N.models.forum.Post.findOne({ _id: env.params.post_id }).lean(true).exec(function (err, post) {
      if (err) {
        callback(err);
        return;
      }

      // TODO: check post status and permissions
      if (!post) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.post = post;
      callback();
    });
  });


  // Check permissions
  //
  N.wire.before(apiPath, function check_permissions(env) {
    // TODO: check post ts (user can edit only posts not older than 30 minutes)
    if (!env.session.user_id || env.session.user_id.toString() !== env.data.post.user.toString()) {
      return N.io.FORBIDDEN;
    }

    // TODO: check moderator permissions to edit post
  });


  // Update post
  //
  N.wire.on(apiPath, function update_post(env, callback) {
    if (!env.params.post_text) {
      callback();
      return;
    }

    var providers;

    // Get available for media providers
    if (N.config.medialinks.content === true) {
      providers = N.config.medialinks.providers;
    } else {
      providers = _.filter(N.config.medialinks.providers, function (provider, providerName) {
        return N.config.medialinks.albums.indexOf(providerName) !== -1;
      });
    }

    var data = {
      input: env.params.post_text,
      output: null, // will be cheerio instance
      options:
      {
        cleanupRules: N.config.parser.cleanup,
        smiles: N.config.smiles,
        medialinkProviders: providers
      }
    };

    N.parser.src2ast(data, function (err) {
        if (err) {
          callback(err);
          return;
        }

        // TODO: save data.output.text() for search reasons
        env.data.post.text = data.output.html();
        N.models.forum.Post.update({ _id: env.params.post_id }, { text: env.data.post.text }, callback);
      }
    );
  });


  // Fill post src html
  //
  N.wire.after(apiPath, function get_src_html(env, callback) {
    var data = {
      input: env.data.post.text,
      output: null // will be cheerio instance
    };

    N.parser.html2ast(data, function (err) {
      if (err) {
        callback(err);
        return;
      }

      env.res.html = env.data.post.text;
      env.res.src = data.output.html();
      callback();
    });
  });
};
