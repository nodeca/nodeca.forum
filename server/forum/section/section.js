// Show topics list (section)
//
'use strict';


var _     = require('lodash');


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // section hid
    hid: {
      type: 'integer',
      minimum: 1,
      required: true
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
    env.extras.puncher.start('process section');

    N.wire.emit('server:forum.section.list', env, callback);
  });


  // Redirect to last page, if requested > available
  //
  N.wire.after(apiPath, function redirect_to_last_page(env) {
    if (env.data.page.current > env.data.page.max) {
      // Requested page is BIGGER than maximum - redirect to the last one
      return {
        code: N.io.REDIRECT,
        head: {
          'Location': N.runtime.router.linkTo('forum.section', {
            hid:  env.params.hid,
            page: env.data.page.max
          })
        }
      };
    }
  });


  // fetch visible sub-sections (only for the first page)
  //
  N.wire.after(apiPath, function fetch_visible_subsections(env, callback) {

    // subsections fetched only on first page
    if (env.params.page > 1) {
      callback();
      return;
    }

    N.wire.emit('internal:forum.subsections_fill', env, callback);
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {

    if (!env.data.section) {
      callback();
      return;
    }

    N.models.forum.Section.getParentList(env.data.section._id, function(err, parents) {

      if (err) {
        callback(err);
        return;
      }

      N.wire.emit('internal:forum.breadcrumbs_fill', { env: env, parents: parents }, callback);
    });
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env) {
    var section = env.data.section;

    env.res.head = env.res.head || {};

    // prepare page title
    env.res.head.title = (env.params.page > 1) ?
      env.t('title_with_page', { title: section.title, page: env.params.page })
    :
      section.title;
  });

  // Add section info to response
  //
  N.wire.after(apiPath, function fill_topic_info(env) {
    env.res.section = _.assign({}, env.res.section, _.pick(env.data.section, [
      'description',
      'is_category'
    ]));

    env.extras.puncher.stop(); // Close main page scope
  });
};
