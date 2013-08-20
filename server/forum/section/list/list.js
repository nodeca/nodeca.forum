// Fetch pure topics data. Used:
// - from section page, as sub-request
// - from ajax, to "append next page"
//
"use strict";

var _     = require('lodash');
var async = require('async');

// collections fields filters
var fields = require('./_fields.js');


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // section hid
    hid: {
      type: "integer",
      minimum: 1,
      required: true
    },
    page: {
      type: "integer",
      minimum: 1,
      'default': 1
    }
  });


  // shortcuts
  var Section = N.models.forum.Section;
  var Topic = N.models.forum.Topic;


  // fetch section info
  N.wire.before(apiPath, function fetch_section_info(env, callback) {

    env.extras.puncher.start('Forum info prefetch');

    Section.findOne({ hid: env.params.hid }).setOptions({ lean: true })
        .exec(function (err, section) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      // No section ->  "Not Found"
      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.section = section;
      callback();
    });
  });


  // check access permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {

    env.extras.settings.params.section_id = env.data.section._id;
    env.extras.puncher.start('Fetch settings');

    env.extras.settings.fetch(['forum_can_view'], function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      if (!settings.forum_can_view) {
        callback(N.io.NOT_AUTHORIZED);
        return;
      }

      callback();
    });
  });


  // fetch posts per page setting
  //
  N.wire.before(apiPath, function check_and_set_page_info(env, callback) {
    env.extras.puncher.start('Fetch topics per page setting');

    env.extras.settings.fetch(['topics_per_page'], function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.data.topics_per_page = settings.topics_per_page;
      callback();
    });
  });


  // Fill page data or redirect to last page, if requested > available
  //
  N.wire.before(apiPath, function check_and_set_page_info(env) {
    var per_page = env.data.topics_per_page,
        max      = Math.ceil(env.data.section.cache.real.topic_count / per_page) || 1,
        current  = parseInt(env.params.page, 10);

    if (current > max) {
      // Requested page is BIGGER than maximum - redirect to the last one
      return {
        code: N.io.REDIRECT,
        head: {
          "Location": N.runtime.router.linkTo('forum.section', {
            hid:  env.params.hid,
            page: max
          })
        }
      };
    }

    // requested page is OK. propose data for pagination
    env.res.page = { max: max, current: current };
  });


  // fetch and prepare topics
  //
  // ##### params
  //
  // - `id`   section._id
  //
  N.wire.on(apiPath, function check_and_set_page_info(env, callback) {
    // FIXME replace state hardcode
    //var VISIBLE_STATE = 0;
    //var DELETED_STATE = 1;

    var sort = {};
    var start;
    var query;
    var ids = [];

    var topics_per_page = env.data.topics_per_page;

    env.res.show_page_number = false;

    env.extras.puncher.start('Get topics');
    env.extras.puncher.start('Topic ids prefetch');

    if (env.session && env.session.hb) {
      sort['cache.hb.last_ts'] = -1;
    } else {
      sort['cache.real.last_ts'] = -1;
    }

    async.series([
      function (next) {
        // FIXME add state condition to select only visible topics
        start = (env.params.page - 1) * topics_per_page;

        // Fetch IDs of "visible" topics interval
        Topic.find({ section: env.data.section._id })
            //.where('state').equals(VISIBLE_STATE)
            .select('_id cache.real.last_ts').sort(sort).skip(start)
            .limit(topics_per_page + 1).setOptions({ lean: true })
            .exec(function (err, visible_topics) {

          env.extras.puncher.stop({ count: visible_topics.length });

          if (err) {
            next(err);
            return;
          }

          if (!visible_topics.length) {
            // properly close puncher scope on early interrupt
            env.extras.puncher.stop();

            if (env.params.page > 1) {
              // When user requests page that is out of possible range we redirect
              // them during before filter (see above).
              //
              // But very rarely, cached topics counter can be out of sync.
              // In this case return 404 for empty result.
              next(N.io.NOT_FOUND);
              return;
            }

            // category or section without topics
            env.data.topics = [];

            next();
            return;
          }

          // collect ids
          ids = visible_topics.map(function (topic) {
            return topic._id;
          });

          // FIXME need real check permission
          if (false) {
            next();
            return;
          }

          // delete last ID, if successefuly fetched (topics_per_page+1)
          if (ids.length > topics_per_page) { ids.pop(); }

          // Fetch IDs of "hidden" topics (use coverage index)
          /*Topic.find({ section: env.data.section._id })
              .where('state').equals(DELETED_STATE)
              .where('cache.real.last_ts')
                .lt(_.first(visible_topics).cache.real.last_ts)
                .gt(_.last(visible_topics).cache.real.last_ts)
              .select('_id').sort(sort)
              .setOptions({ lean: true })
              .exec(function (err, deleted_topics) {

            if (err) {
              next(err);
              return;
            }
            // append ids of deleted topics
            deleted_topics.forEach(function (topic) {
              ids.push(topic._id);
            });
            next();
          });*/
          next();
        });
      },
      function (next) {
        if (_.isEmpty(ids)) {
          next();
          return;
        }
        env.extras.puncher.start('Get topics by _id list');

        // FIXME modify state condition (deleted and etc) if user has permission
        // If no hidden topics - no conditions needed, just select by IDs
        query = Topic.find().where('_id').in(ids).sort(sort);

        // Select all allowed topics in calculated
        // interval: visible + deleted and others (if allowed by permissions)
        query.select(fields.topic_in.join(' ')).sort(sort)
            .setOptions({ lean: true }).exec(function (err, topics) {

          env.extras.puncher.stop({ count: topics.length });
          env.extras.puncher.stop();

          if (err) {
            next(err);
            return;
          }

          env.data.topics = topics;
          next();
        });
      }
    ], callback);
  });


  // Add topics into to response & collect user info
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {

    env.res.topics = env.data.topics;

    env.data.users = env.data.users || [];
    // collect users from topics
    env.data.topics.forEach(function (doc) {
      if (doc.cache.real.first_user) {
        env.data.users.push(doc.cache.real.first_user);
      }
      if (doc.cache.real.last_user) {
        env.data.users.push(doc.cache.real.last_user);
      }
    });

    callback();
  });


  // Add section info to response
  //
  N.wire.after(apiPath, function fill_topic_info(env) {
    env.res.section = _.extend({}, env.res.section,
      _.pick(env.data.section, [
        '_id',
        'hid',
        'title'
      ])
    );
  });


  // Add settings, required to render topics list
  //
  N.wire.after(apiPath, function expose_settings(env, callback) {

    env.extras.settings.params.section_id = env.data.section._id;
    env.extras.puncher.start('Fetch public topics list settings');

    env.extras.settings.fetch([
      'forum_can_start_topics',
      'posts_per_page' // needed for micropagination
    ], function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.res.settings = _.extend({}, env.res.settings, settings);
      callback();
    });
  });

};