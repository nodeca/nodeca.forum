// Show topics list (section)
//
'use strict';


var memoizee  = require('memoizee');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    // section hid
    hid:  { type: 'integer', required: true },
    page: { type: 'integer', required: true, minimum: 1 }
  });

  var buildTopicsIds = require('./list/_build_topics_ids_by_page.js')(N);


  var fetchSection = memoizee(
    function (id, callback) {
      N.models.forum.Section.findById(id)
        .lean(true)
        .exec(callback);
    },
    {
      async:      true,
      maxAge:     60000, // cache TTL = 60 seconds
      primitive:  true   // params keys are calculated as toString
    }
  );


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
    var page_max = Math.ceil(env.data.pagination.total / env.data.pagination.per_page) || 1;

    if (env.params.page > page_max) {

      // Requested page is BIGGER than maximum - redirect to the last one
      return {
        code: N.io.REDIRECT,
        head: {
          Location: N.router.linkTo('forum.section', {
            hid:  env.params.hid,
            page: page_max
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


  // Fill subscription type
  //
  N.wire.after(apiPath, function fill_subscription(env, callback) {
    if (env.user_info.is_guest) {
      env.res.subscription = null;

      callback();
      return;
    }

    N.models.users.Subscription.findOne({ user_id: env.user_info.user_id, to: env.data.section._id })
        .lean(true)
        .exec(function (err, subscription) {

      if (err) {
        callback(err);
        return;
      }

      env.res.subscription = subscription ? subscription.type : null;

      callback();
      return;
    });
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


  // Get parent section
  //
  N.wire.after(apiPath, function fill_parent_hid(env, callback) {
    N.models.forum.Section.getParentList(env.data.section._id, function (err, parents) {

      if (err) {
        callback(err);
        return;
      }

      if (!parents.length) {
        callback();
        return;
      }

      fetchSection(parents[parents.length - 1], function (err, section) {
        if (err) {
          callback(err);
          return;
        }

        if (!section) {
          callback();
          return;
        }

        env.res.section_level = parents.length;
        env.res.parent_hid = section.hid;

        callback();
      });
    });
  });


  // Fill default subscription mode
  //
  N.wire.after(apiPath, function fill_default_subscription_mode(env, callback) {
    env.extras.settings.fetch('default_subscription_mode', function (err, default_subscription_mode) {
      if (err) {
        callback(err);
        return;
      }

      env.res.settings = env.res.settings || {};
      env.res.settings.default_subscription_mode = default_subscription_mode;

      callback();
    });
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_meta(env) {
    var current = Math.floor(env.data.pagination.chunk_offset / env.data.pagination.per_page) + 1;
    var max     = Math.ceil(env.data.pagination.total / env.data.pagination.per_page) || 1;

    env.res.head = env.res.head || {};

    env.res.head.canonical = N.router.linkTo('forum.section', {
      hid: env.params.hid,
      page: current
    });

    if (current > 1) {
      env.res.head.prev = N.router.linkTo('forum.section', {
        hid: env.params.hid,
        page: current - 1
      });
    }

    if (current < max) {
      env.res.head.next = N.router.linkTo('forum.section', {
        hid: env.params.hid,
        page: current + 1
      });
    }
  });
};
