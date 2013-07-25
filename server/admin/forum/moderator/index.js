// Show list of forum moderator with associated forum sections info.


'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  N.wire.before(apiPath, function forum_moderator_store_check() {
    if (!N.settings.getStore('forum_moderator')) {
      return {
        code:    N.io.APP_ERROR
      , message: 'Settings store `forum_moderator` is not registered.'
      };
    }
  });


  N.wire.before(apiPath, function moderator_sections_fetch(env, callback) {
    var ForumModeratorStore = N.settings.getStore('forum_moderator');

    N.models.forum.Section
        .find('_id title')
        .setOptions({ lean: true })
        .exec(function (err, sections) {

      env.data.sectionsByModerator = {};

      async.forEach(sections, function (section, next) {
        ForumModeratorStore.getModeratorsInfo(
          section._id
        , { skipCache: true }
        , function (err, sectionsByModerator) {
          if (err) {
            next(err);
            return;
          }

          _.forEach(sectionsByModerator, function (moderator) {
            if (!_.has(env.data.sectionsByModerator, moderator._id)) {
              env.data.sectionsByModerator[moderator._id] = [];
            }

            env.data.sectionsByModerator[moderator._id].push({
              _id:       section._id
            , title:     section.title
            , total:     moderator.total
            , own:       moderator.own
            , inherited: moderator.inherited
            });
          });
          next();
        });
      }, callback);
    });
  });


  N.wire.before(apiPath, function overriden_type_compute(env) {
    var ForumModeratorStore = N.settings.getStore('forum_moderator');

    _.forEach(env.data.sectionsByModerator, function (sections) {
      _.forEach(sections, function (section) {
        // Select override type.
        if (section.total >= ForumModeratorStore.keys.length) {
          section.override_type = 'every';
        } else if (section.total > 0) {
          section.override_type = 'some';
        } else {
          section.override_type = 'none';
        }

        // Append type modifier for 'every' and 'some' types.
        if (section.own > 0) {
          section.override_type += '-own';
        } else if (section.inherited > 0) {
          section.override_type += '-inherited';
        }
      });
    });
  });


  // Collect user ids for `users_join` hook. (provides users info)
  N.wire.on(apiPath, function users_prepare(env) {
    env.data.users = (env.data.users || []).concat(_.keys(env.data.sectionsByModerator));
  });


  N.wire.on(apiPath, function moderator_index(env) {
    env.response.data.moderators = _(env.data.sectionsByModerator)
      .map(function (sections, userId) {
        return { _id: userId, sections: _.sortBy(sections, 'title') };
      })
      .sortBy(env.data.moderators, function (moderator) {
        return String(moderator._id);
      })
      .valueOf();
  });


  N.wire.after(apiPath, function title_set(env) {
    env.response.data.head.title = env.t('title');
  });
};
