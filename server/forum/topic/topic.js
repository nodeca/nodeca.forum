// Show posts list (topic)
//
'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // topic id
    hid: {
      type: 'integer',
      minimum: 1,
      required: true
    },
    section_hid: {
      type: 'integer',
      minimum: 1
    },
    page: {
      type: 'integer',
      minimum: 1,
      'default': 1
    }
  });


  // Just subcall forum.topic.list, that enchances `env`
  //
  N.wire.on(apiPath, function get_posts(env, callback) {
    env.extras.puncher.start('process topic');

    N.wire.emit('server:forum.topic.list', env, callback);
  });


  // `params.section_hid` can be wrong (old link to moved topic)
  // If params.section_hid defined, and not correct - redirect to proper location
  //
  // Making redirect here is not optimal, because posts will be fetched twice.
  // But that's not crilital, and avoid logic duplication (permissions check and other)
  //
  N.wire.after(apiPath, function fix_section_hid(env) {
    if (!env.params.hasOwnProperty('section_hid')) {
      return;
    }

    if (env.data.section.hid !== +env.params.section_hid) {
      return {
        code: N.io.REDIRECT,
        head: {
          'Location': N.runtime.router.linkTo('forum.topic', {
            hid:       env.data.topic.hid,
            section_hid: env.data.section.hid,
            page:     env.params.page || 1
          })
        }
      };
    }
  });


  // Redirect to last page, if requested > available
  //
  N.wire.after(apiPath, function redirect_to_last_page(env) {
    if (env.data.page.current > env.data.page.max) {
      // Requested page is BIGGER than maximum - redirect to the last one
      return {
        code: N.io.REDIRECT,
        head: {
          'Location': N.runtime.router.linkTo('forum.topic', {
            section_hid: env.data.section.hid,
            hid:         env.params.hid,
            page:        env.data.page.max
          })
        }
      };
    }
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
    var topic = env.data.topic;

    env.res.head = env.res.head || {};

    env.res.head.title = (env.params.page > 1) ?
      env.t('title_with_page', { title: topic.title, page: env.params.page })
    :
      topic.title;

    env.extras.puncher.stop(); // Close first scope
  });
};
