// Check section permissions
//
// In:
//  - env
//  - params.hid
//
// Out:
//  - env.data.access_read
//  - env.data.section
//

'use strict';


module.exports = function (N, apiPath) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', function check_post_access(env, callback) {
    var match = N.router.matchAll(env.params.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.section' ? match : acc;
    }, null);

    if (!match) {
      callback();
      return;
    }

    N.wire.emit('internal:forum.access.section', {
      env: env,
      params: { hid: match.params.hid }
    }, callback);
  });


  //////////////////////////////////////////////////////////////////////////
  // Initialize return value for env.data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(data) {
    data.env.data.access_read = null;
  });


  // Fetch section if it's not present already
  //
  N.wire.before(apiPath, function fetch_section(data, callback) {
    var env = data.env;

    if (env.data.access_read === false) {
      callback();
      return;
    }

    if (env.data.section) {
      callback();
      return;
    }

    N.models.forum.Section.findOne({ hid: data.params.hid })
        .lean(true)
        .exec(function (err, section) {

      if (err) {
        callback(err);
        return;
      }

      if (!section) {
        env.data.access_read = false;
        callback();
        return;
      }

      env.data.section = section;
      callback();
    });
  });


  // Check section permissions
  //
  N.wire.before(apiPath, function check_section_access(data, callback) {
    var env = data.env;

    if (env.data.access_read === false) {
      callback();
      return;
    }

    env.extras.settings.params.section_id = env.data.section._id;

    env.extras.settings.fetch('forum_can_view', function (err, forum_can_view) {
      if (err) {
        callback(err);
        return;
      }

      // Section permission
      if (!forum_can_view) {
        env.data.access_read = false;
        callback();
        return;
      }

      callback();
    });
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(data) {
    var env = data.env;

    if (env.data.access_read === false) {
      return;
    }

    data.env.data.access_read = true;
  });
};
