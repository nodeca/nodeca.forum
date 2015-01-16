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


  // Fill post options
  //
  N.wire.before(apiPath, function fill_post_options(env, callback) {

    var userStore = N.settings.getStore('user');

    userStore.get([ 'edit_no_mlinks', 'edit_no_smiles' ], { user_id: env.session.user_id }, {}, function (err, data) {
      if (err) {
        callback(err);
      }

      env.res.post_options = { no_mlinks: data.edit_no_mlinks.value, no_smiles: data.edit_no_smiles.value };
      callback();
    });

  });


  // Fill parse options
  //
  N.wire.on(apiPath, function fill_parse_options(env, callback) {
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

        env.res.parse_options = settings;
        callback();
      }
    );
  });
};
