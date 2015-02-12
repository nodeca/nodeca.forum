// Get post src html, update post
'use strict';

var punycode = require('punycode');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id:          { format: 'mongo', required: true },
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
    option_no_smiles: { type: 'boolean', required: true },
    as_moderator:     { type: 'boolean', required: true }
  });


  // Fetch post data and check permissions
  //
  N.wire.before(apiPath, function fetch_post_data(env, callback) {
    N.wire.emit('server:forum.topic.post.edit.index', env, callback);
  });


  // Check attachments owner
  //
  N.wire.before(apiPath, function attachments_check_owner(env, callback) {
    N.wire.emit('internal:users.attachments_check_owner', env, callback);
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
          message: env.t('@forum.topic.post.edit.err_text_too_short', post_text_min_length)
        });
        return;
      }

      callback();
    });
  });


  // Update post
  //
  N.wire.after(apiPath, function post_update(env, callback) {
    var updateData = {
      tail:   env.data.parse_result.tail,
      attach: env.params.attach.map(function (attach) { return attach.media_id; }),
      html:   env.data.parse_result.html,
      md:     env.params.txt,
      params: env.data.parse_options
    };

    N.models.forum.Post.update({ _id: env.params.post_id }, updateData, function (err) {

      if (err) {
        callback(err);
        return;
      }

      env.res.post = { html: updateData.html, tail: updateData.tail };

      callback();
    });
  });
};
