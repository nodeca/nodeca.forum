// Show posts list (topic)
//
"use strict";


var _         = require('lodash');
var memoizee  = require('memoizee');


var forum_breadcrumbs = require('../../../lib/forum_breadcrumbs.js');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // topic id
    hid: {
      type: "integer",
      minimum: 1,
      required: true
    },
    section_id: {
      type: "integer",
      minimum: 1,
    },
    page: {
      type: "integer",
      minimum: 1,
      'default': 1
    }
  });


  // shortcut
  var Section = N.models.forum.Section;


  // Just subcall section.topic.list, that enchances `env`
  //
  N.wire.on(apiPath, function get_posts(env, callback) {
    env.extras.puncher.start('Fetch posts');

    N.wire.emit('server:forum.topic.list', env, function (err) {
      env.extras.puncher.stop();

      callback(err);
    });
  });


  // Fill head meta & topic info
  N.wire.after(apiPath, function fill_meta(env) {
    var t_params;
    var data = env.response.data;
    var topic = env.data.topic;

    if (env.session && env.session.hb) {
      topic.cache.real = topic.cache.hb;
    }

    // prepare page title
    data.head.title = topic.title;
    if (env.params.page > 1) {
      t_params = { title: topic.title, page: env.params.page };
      data.head.title = env.t('title_with_page', t_params);
    }
  });


  // Helper - cacheable bredcrumbs info fetch, to save DB request.
  // We can cache it, because cache size is limited by sections count.
  var fetchForumsBcInfo = memoizee(
    function (ids, callback) {
      Section
        .find({ _id: { $in: ids }})
        .select('id title')
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
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {
    var section = env.data.section;
    var data = env.response.data;

    env.extras.puncher.start('Build breadcrumbs');

    fetchForumsBcInfo(section.parent_list, function (err, parents) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      var bc_list = parents.slice(); // clone result to keep cache safe
      bc_list.push(_.pick(section, ['id', 'title']));

      data.blocks = data.blocks || {};
      data.blocks.breadcrumbs = forum_breadcrumbs(env, bc_list);

      callback();
    });
  });
};
