'use strict';


var _ = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    search: { type: 'string', required: true, minLength: 2 }
  });

  N.wire.on(apiPath, function section_moderator_find_user(env, callback) {
    N.models.users.User
        .find().where('_uname').regex(new RegExp(env.params.search, 'mi'))
        .limit(10)
        .select('_id _uname')
        .setOptions({ lean: true })
        .exec(function (err, users) {

      if (err) {
        callback(err);
        return;
      }

      env.response.data.suggestions = _.map(users, function (user) {
        return {
          label: user._uname
        , value: user._id
        };
      });
      callback();
    });
  });
};
