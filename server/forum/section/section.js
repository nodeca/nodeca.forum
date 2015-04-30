// Show topics list (section)
//
'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    // section hid
    hid: {
      type: 'integer',
      required: true
    },
    page: {
      type: 'integer',
      minimum: 1,
      required: true
    }
  });

  var buildTopicsIds = require('./list/_build_topics_ids_by_page.js')(N);


  // Subcall forum.topic_list
  //
  N.wire.on(apiPath, function subcall_topic_list(env, callback) {
    env.data.section_hid = env.params.hid;
    env.data.build_topics_ids = buildTopicsIds;

    N.wire.emit('internal:forum.topic_list', env, callback);
  });


  // Fill page info
  //
  N.wire.after(apiPath, function fill_page(env) {
    env.res.pagination = env.data.pagination;
  });


  // Redirect to last page, if requested > available
  //
  N.wire.after(apiPath, function redirect_to_last_page(env) {
    if (env.params.page > env.data.pagination.page_max) {

      // Requested page is BIGGER than maximum - redirect to the last one
      return {
        code: N.io.REDIRECT,
        head: {
          Location: N.router.linkTo('forum.section', {
            hid:  env.params.hid,
            page: env.data.pagination.page_max
          })
        }
      };
    }
  });


  // Fetch visible sub-sections
  //
  N.wire.after(apiPath, function fetch_visible_subsections(env, callback) {
    N.wire.emit('internal:forum.subsections_fill', env, callback);
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {

    if (!env.data.section) {
      callback();
      return;
    }

    N.models.forum.Section.getParentList(env.data.section._id, function (err, parents) {

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

    // Prepare page title
    if (env.params.page === 1) {
      env.res.head.title = section.title;
    } else {
      env.res.head.title = env.t('title_with_page', { title: section.title, page: env.params.page });
    }
  });
};
