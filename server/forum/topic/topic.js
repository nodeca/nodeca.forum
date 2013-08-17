// Show posts list (topic)
//
"use strict";


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // topic id
    hid: {
      type: "integer",
      minimum: 1,
      required: true
    },
    section_hid: {
      type: "integer",
      minimum: 1,
    },
    page: {
      type: "integer",
      minimum: 1,
      'default': 1
    }
  });


  // Just subcall forum.topic.list, that enchances `env`
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
    var res = env.res;
    var topic = env.data.topic;

    if (env.session && env.session.hb) {
      topic.cache.real = topic.cache.hb;
    }

    // prepare page title
    res.head.title = topic.title;
    if (env.params.page > 1) {
      t_params = { title: topic.title, page: env.params.page };
      res.head.title = env.t('title_with_page', t_params);
    }
  });

  // file breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {
    var parents = env.data.section.parent_list.slice();

    parents.push(env.data.section._id);

    N.wire.emit('internal:forum.breadcrumbs_fill', { env: env, parents: parents }, callback);
  });
};
