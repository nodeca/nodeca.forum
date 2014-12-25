// Show topic add page
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: {
      type: 'integer',
      minimum: 1
    }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (env.user_info.is_guest) {
      return N.io.FORBIDDEN;
    }
  });


  // Fetch section info
  //
  N.wire.before(apiPath, function fetch_section_info(env, callback) {

    N.models.forum.Section.findOne({ hid: env.params.section_hid }).lean(true).exec(function (err, section) {
      if (err) {
        callback(err);
        return;
      }

      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.section = section;
      callback();
    });
  });


  // Check permissions
  //
  N.wire.on(apiPath, function check_permissions(env, callback) {
    env.extras.settings.params.section_id = env.data.section._id;

    env.extras.settings.fetch('forum_can_start_topics', function (err, canStartTopics) {

      if (err) {
        callback(err);
        return;
      }

      if (!canStartTopics) {
        callback(N.io.FORBIDDEN);
        return;
      }

      callback();
    });
  });


  // Fill settings
  //
  N.wire.after(apiPath, function fill_settings(env, callback) {
    env.extras.settings.fetch('topic_title_min_length', function (err, topic_title_min_length) {
      if (err) {
        callback(err);
        return;
      }

      env.res.settings = env.res.settings || {};
      env.res.settings.topic_title_min_length = topic_title_min_length;

      callback();
    });
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {

    N.models.forum.Section.getParentList(env.data.section._id, function(err, parents) {
      if (err) {
        callback(err);
        return;
      }

      // add current section
      parents.push(env.data.section._id);
      N.wire.emit('internal:forum.breadcrumbs_fill', { env: env, parents: parents }, callback);
    });
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_meta(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');
  });
};
