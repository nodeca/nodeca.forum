// Show topics list (section)
//
"use strict";


var _     = require('lodash');


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


  // Just subcall forum.topic.list, that enchances `env`
  //
  N.wire.on(apiPath, function get_posts(env, callback) {
    env.extras.puncher.start('Fetch topics');

    N.wire.emit('server:forum.section.list', env, function (err) {
      env.extras.puncher.stop();

      callback(err);
    });
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


  // Build response:
  //  - sections list -> filtered tree
  //  - collect users ids (last posters / moderators / topics authors + last)
  //  - topics
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {
    //
    // Process topics
    //

    if (env.session && env.session.hb) {
      env.data.topics = env.data.topics.map(function (doc) {
        doc.cache.real = doc.cache.hb;
        return doc;
      });
    }

    // calculate pages number
    var topics_per_page = env.topics_per_page;
    env.data.topics.forEach(function (doc) {
      doc._pages_count = Math.ceil(doc.cache.real.post_count / topics_per_page);
    });

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

    env.extras.puncher.stop();

    callback();
  });


  // Fill head meta & fetch/fill breadcrumbs
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env) {
    var t_params;

    var res = env.res;
    var section = env.data.section;

    if (env.session && env.session.hb) {
      section.cache.real = section.cache.hb;
    }

    // prepare page title
    res.head.title = section.title;
    if (env.params.page > 1) {
      t_params = { title: section.title, page: env.params.page };
      res.head.title = env.t('title_with_page', t_params);
    }

    // prepare section info
    res.section  = _.pick(section, [
      'hid',
      'title',
      'description',
      'is_category'
    ]);
  });


  // fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {
    var parents = env.data.section.parent_list.slice();

    N.wire.emit('internal:forum.breadcrumbs_fill', { env: env, parents: parents }, callback);
  });

};
