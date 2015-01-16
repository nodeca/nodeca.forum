// Get post src html, update post
'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id:          { format: 'mongo', required: true },
    post_md:          { type: 'string', required: true },
    attach_tail:      {
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
    // groups should be sorted, to avoid cache duplication
    var g_ids = env.extras.settings.params.usergroup_ids.map(function (g) { return g.toString(); }).sort();

    N.settings.getByCategory(
      'forum_markup',
      { usergroup_ids: g_ids },
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
  N.wire.before(apiPath, function parse_text(env, callback) {
    N.parse(
      {
        text: env.params.post_md,
        attachments: env.params.attach_tail,
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


  // Update post
  //
  N.wire.on(apiPath, function post_update(env, callback) {
    var updateData = {
      attach_tail: env.data.parse_result.attachments.tail,
      attach_refs: env.data.parse_result.attachments.refs,
      html:        env.data.parse_result.html,
      md:          env.data.parse_result.srcText,
      params:      env.data.parse_result.options
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
