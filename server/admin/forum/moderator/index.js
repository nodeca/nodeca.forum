// Show list of forum moderator with associated forum sections info.


'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  N.wire.before(apiPath, function section_moderator_store_check() {
    if (!N.settings.getStore('section_moderator')) {
      return {
        code:    N.io.APP_ERROR
      , message: 'Settings store `section_moderator` is not registered.'
      };
    }
  });


  N.wire.before(apiPath, function sections_fetch(env, callback) {
    N.models.forum.Section
        .find()
        .setOptions({ lean: true })
        .exec(function (err, sections) {

      if (err) {
        callback(err);
        return;
      }

      env.data.sections     = sections;
      env.data.sectionsById = {};
      
      _.forEach(sections, function (section) {
        env.data.sectionsById[section._id] = section;
      });
      callback();
    });
  });


  // Fetch moderators map `user_id` => `array of section info`.
  //
  N.wire.on(apiPath, function moderator_index(env, callback) {
    var SectionModeratorStore = N.settings.getStore('section_moderator')
      , sectionsByModerator = {};

    async.forEach(env.data.sections, function (section, next) {
      SectionModeratorStore.getModeratorsInfo(section._id, function (err, moderators) {
        if (err) {
          next(err);
          return;
        }

        _.forEach(moderators, function (moderator) {
          if (!_.has(sectionsByModerator, moderator._id)) {
            sectionsByModerator[moderator._id] = [];
          }

          sectionsByModerator[moderator._id].push({
            _id:       section._id
          , own:       moderator.own
          , inherited: moderator.inherited
          });
        });
        next();
      });
    }, function (err) {
      if (err) {
        callback(err);
        return;
      }

      env.response.data.settings_count = SectionModeratorStore.keys.length;

      env.response.data.sections = env.data.sectionsById;

      env.response.data.moderators = _(sectionsByModerator)
        .map(function (sections, userId) {
          var sortedSections = _.sortBy(sections, function (section) {
            return env.data.sectionsById[section._id].title;
          });

          return { _id: userId, sections: sortedSections };
        })
        .sortBy(function (moderator) {
          return String(moderator._id); // Sort moderators by user id.
        })
        .valueOf();

      callback();
    });
  });


  // Collect user ids for `users_join` hook. (provides users info)
  //
  N.wire.after(apiPath, function users_prepare(env) {
    env.data.users = (env.data.users || []).concat(_.pluck(env.response.data.moderators, '_id'));
  });


  N.wire.after(apiPath, function title_set(env) {
    env.response.data.head.title = env.t('title');
  });
};
