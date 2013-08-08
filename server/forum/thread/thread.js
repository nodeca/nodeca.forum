// Show posts list (thread)
//
"use strict";


var _         = require('lodash');
var memoizee  = require('memoizee');


var forum_breadcrumbs = require('../../../lib/forum_breadcrumbs.js');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // thread id
    id: {
      type: "integer",
      minimum: 1,
      required: true
    },
    forum_id: {
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
  var Thread = N.models.forum.Thread;


  // Fetch thread info & check that thread exists.
  // Make sure, that fields are not filtered, because
  // data are reused in subrequest
  N.wire.before(apiPath, function fetch_thread_info(env, callback) {

    env.extras.puncher.start('Thread info prefetch');

    Thread.findOne({ id: env.params.id }).setOptions({ lean: true })
        .exec(function (err, thread) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      // No thread -> "Not Found" status
      if (!thread) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.thread = thread;
      callback();
    });
  });

  // fetch forum info
  N.wire.before(apiPath, function fetch_forum_info(env, callback) {

    env.extras.puncher.start('Forum info prefetch');

    Section.findOne({ _id: env.data.thread.forum }).setOptions({ lean: true })
        .exec(function (err, forum) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      // No forum -> thread with missed parent, return "Not Found" too
      if (!forum) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.section = forum;
      callback();
    });
  });

  // `params.forum_id` can be wrong (old link to moved thread)
  // If params.forum_id defined, and not correct - redirect to proper location
  N.wire.before(apiPath, function fix_forum_id(env) {
    if (env.params.forum_id && (env.data.section.id !== +env.params.forum_id)) {
      return {
        code: N.io.REDIRECT,
        head: {
          'Location': N.runtime.router.linkTo('forum.section', {
            id:       env.data.thread.id,
            forum_id: env.data.section.id,
            page:     env.params.page || 1
          })
        }
      };
    }
  });


  // check access permissions
  N.wire.before(apiPath, function check_permissions(env, callback) {

    env.extras.settings.params.forum_id = env.data.thread.forum;
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


  //
  // Just subcall forum.thread.list, that enchances `env`
  //

  N.wire.on(apiPath, function get_posts(env, callback) {
    var _params = env.params;

    env.params = { id: _params.id, page: _params.page };

    env.extras.puncher.start('Fetch posts');

    N.wire.emit('server:forum.thread.list', env, function (err) {
      env.extras.puncher.stop();

      env.params = _params;
      callback(err);
    });
  });


  // Fill head meta & thread info
  N.wire.after(apiPath, function fill_meta(env) {
    var t_params;
    var data = env.response.data;
    var thread = env.data.thread;

    if (env.session && env.session.hb) {
      thread.cache.real = thread.cache.hb;
    }

    // prepare page title
    data.head.title = thread.title;
    if (env.params.page > 1) {
      t_params = { title: thread.title, page: env.params.page };
      data.head.title = env.t('title_with_page', t_params);
    }

    // add thread info, specific for this page (partially filled in `forum.thread.list`)
    data.thread = _.extend({}, data.thread, _.pick(thread, ['_seo_desc']));
  });


  // Helper - cacheable bredcrumbs info fetch, to save DB request.
  // We can cache it, because cache size is limited by sections count.
  var fetchForumsBcInfo = memoizee(
    function (ids, callback) {
      Section
        .find({ _id: { $in: ids }})
        .select('_id id title')
        .sort({ 'level': 1 })
        .setOptions({ lean: true })
        .exec(function (err, parents) {
        callback(err, parents);
      });
    },
    {
      async: true,
      maxAge:     60000, // cache TTL = 60 seconds
      primitive:  true   // params keys are calculated as toStrins, ok for our case
    }
  );

  // build breadcrumbs
  N.wire.after(apiPath, function fill_breadcrumbs(env, callback) {
    var forum = env.data.section;
    var data = env.response.data;

    env.extras.puncher.start('Build breadcrumbs');

    fetchForumsBcInfo(forum.parent_list, function (err, parents) {
      if (err) {
        env.extras.puncher.stop();
        callback(err);
        return;
      }

      parents.push(forum);
      data.blocks = data.blocks || {};
      data.blocks.breadcrumbs = forum_breadcrumbs(env, parents);

      env.extras.puncher.stop();

      callback();
    });
  });
};
