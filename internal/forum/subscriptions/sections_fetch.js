// Fetch sections for subscriptions
//
'use strict';


var _                = require('lodash');
var async            = require('async');
var sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', function subscriptions_fetch_sections(env, callback) {
    var sections = [];

    async.series([

      // Fetch sections
      //
      function (next) {
        var subs = _.filter(env.data.subscriptions, 'to_type', N.models.users.Subscription.to_types.FORUM_SECTION);

        N.models.forum.Section.find().where('_id').in(_.pluck(subs, 'to')).lean(true).exec(function (err, result) {
          if (err) {
            next(err);
            return;
          }

          sections = result;
          next();
        });
      },

      // Check permissions subcall
      //
      function (next) {
        var access_env = { params: { sections: sections, user_info: env.user_info } };

        N.wire.emit('internal:forum.access.section', access_env, function (err) {
          if (err) {
            next(err);
            return;
          }

          sections = sections.reduce(function (acc, section, i) {
            if (access_env.data.access_read[i]) {
              acc.push(section);
            }

            return acc;
          }, []);

          next();
        });
      },

      // Sanitize sections
      //
      function (next) {
        sanitize_section(N, sections, env.user_info, function (err, res) {
          if (err) {
            next(err);
            return;
          }

          sections = res;
          next();
        });
      }
    ], function (err) {
      if (err) {
        callback(err);
        return;
      }

      env.res.forum_sections = _.assign(env.res.forum_sections || {}, _.indexBy(sections, '_id'));

      callback();
    });
  });
};
