// Show posts list (topic)
//
'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_hid: {
      type: 'integer',
      minimum: 1,
      required: true
    },
    topic_hid: {
      type: 'integer',
      minimum: 1,
      required: true
    },
    post_hid: {
      type: 'integer',
      minimum: 1
    },
    page: {
      type: 'integer',
      minimum: 1,
      'default': 1
    }
  });


  var buildPostIdsByPage    = require('./list/_build_posts_ids_by_page.js')(N),
      buildPostIdsByPostHid = require('./list/_build_posts_ids_by_post_hid.js')(N);


  // `params.section_hid` can be wrong (old link to moved topic).
  // If `params.section_hid` not correct - redirect to proper location.
  //
  // Redirect here to avoid fetching posts twice.
  //
  function buildPostIdsAndCheckRedirect(env, callback) {
    if (env.data.section.hid !== +env.params.section_hid) {
      callback({
        code: N.io.REDIRECT,
        head: {
          Location: N.router.linkTo('forum.topic', {
            section_hid: env.data.section.hid,
            topic_hid:   env.data.topic.hid,
            post_hid:    env.params.post_hid,
            page:        env.params.page
          })
        }
      });
      return;
    }

    if (env.params.post_hid) {
      buildPostIdsByPostHid(env, callback);
    } else {
      buildPostIdsByPage(env, callback);
    }
  }


  // Fetch posts subcall
  //
  N.wire.on(apiPath, function fetch_posts_list(env, callback) {
    env.data.topic_hid = env.params.topic_hid;
    env.data.build_posts_ids = buildPostIdsAndCheckRedirect;

    N.wire.emit('internal:forum.post_list', env, callback);
  });


  // Fill pagination
  //
  N.wire.after(apiPath, function fill_pagination(env) {

    // Prepared by `buildPostIds`
    env.res.page = env.data.page;
  });


  // Fill additional topic fields
  //
  N.wire.after(apiPath, function fill_topic_fields(env) {
    env.res.topic.title = env.data.topic.title;
  });


  // Redirect to last page, if requested > available
  //
  N.wire.after(apiPath, function redirect_to_last_page(env) {
    if (env.data.page.current > env.data.page.max) {
      // Requested page is BIGGER than maximum - redirect to the last one
      return {
        code: N.io.REDIRECT,
        head: {
          Location: N.router.linkTo('forum.topic', {
            section_hid: env.data.section.hid,
            topic_hid:   env.params.topic_hid,
            page:        env.data.page.max
          })
        }
      };
    }
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {

    N.models.forum.Section.getParentList(env.data.section._id, function (err, parents) {
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
      env.t('title_with_page', { title: topic.title, page: env.data.page.current })
    :
      topic.title;
  });
};
