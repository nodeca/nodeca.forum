// Show reply dialog

'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Check user permission
  //
  N.wire.before(apiPath, function check_permissions(env) {
    if (env.user_info.is_guest) {
      return N.io.NOT_FOUND;
    }
  });


  // Fill user settings
  //
  N.wire.before(apiPath, function fill_user_settings(env, callback) {

    var userStore = N.settings.getStore('user');

    userStore.get([ 'edit_no_mlinks', 'edit_no_emojis' ], { user_id: env.user_info.user_id }, {}, function (err, data) {
      if (err) {
        callback(err);
      }

      env.res.user_settings = { no_mlinks: data.edit_no_mlinks.value, no_emojis: data.edit_no_emojis.value };
      callback();
    });

  });


  // Fill parse options
  //
  N.wire.on(apiPath, function fill_parse_options(env, callback) {
    N.settings.getByCategory(
      'forum_markup',
      { usergroup_ids: env.extras.settings.params.usergroup_ids },
      { alias: true },
      function (err, settings) {
        if (err) {
          callback(err);
          return;
        }

        env.res.parse_options = settings;
        callback();
      }
    );
  });
};
