// Show topics list (section)
//
'use strict';


var memoizee  = require('memoizee');
var _         = require('lodash');
var thenify   = require('thenify');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    // section hid
    hid:  { type: 'integer', required: true },
    page: { type: 'integer', required: true, minimum: 1 }
  });

  var buildTopicsIds = require('./list/_build_topics_ids_by_page.js')(N);


  var fetchSection = thenify(memoizee(
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
  ));


  // Subcall forum.topic_list
  //
  N.wire.on(apiPath, function subcall_topic_list(env, callback) {
    env.data.section_hid = env.params.hid;
    env.data.build_topics_ids = buildTopicsIds;

    N.wire.emit('internal:forum.topic_list', env, callback);
  });


  // Fetch pagination
  //
  N.wire.after(apiPath, function* fetch_pagination(env) {

    let topics_per_page = yield env.extras.settings.fetch('topics_per_page');

    let statuses = _.without(env.data.topics_visible_statuses, N.models.forum.Topic.statuses.PINNED);

    let counters_by_status = yield statuses.map(
      st => N.models.forum.Topic
                .where('section').equals(env.data.section._id)
                .where('st').equals(st)
                .count()
    );

    let topic_count = _.sum(counters_by_status);

    // Page numbers starts from 1, not from 0
    let page_current = parseInt(env.params.page, 10);

    env.data.pagination = {
      total: topic_count,
      per_page: topics_per_page,
      chunk_offset: topics_per_page * (page_current - 1)
    };
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
  N.wire.after(apiPath, function* fill_subscription(env) {
    if (env.user_info.is_guest) {
      env.res.subscription = null;
      return;
    }

    let subscription = yield N.models.users.Subscription
                                .findOne({ user_id: env.user_info.user_id, to: env.data.section._id })
                                .lean(true);

    env.res.subscription = subscription ? subscription.type : null;
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function* fill_topic_breadcrumbs(env) {

    if (!env.data.section) {
      return;
    }

    let parents = yield N.models.forum.Section.getParentList(env.data.section._id);

    yield N.wire.emit('internal:forum.breadcrumbs_fill', { env, parents });
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
  N.wire.after(apiPath, function* fill_parent_hid(env) {
    let parents = yield N.models.forum.Section.getParentList(env.data.section._id);

    if (!parents.length) {
      return;
    }

    let section = yield fetchSection(parents[parents.length - 1]);

    if (!section) {
      return;
    }

    env.res.section_level = parents.length;
    env.res.parent_hid = section.hid;
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
