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


  // Fill parser options
  //
  N.wire.on(apiPath, function fill_parser_options(env) {
    env.res.parse_rules = {
      cleanupRules: N.config.parser.cleanup,
      smiles: N.config.smiles
    };
  });
};
