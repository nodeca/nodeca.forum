// List of new and updated topics
//
'use strict';


const _                = require('lodash');
const ObjectId         = require('mongoose').Types.ObjectId;
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Fill list of sections excluded by user
  //
  N.wire.before(apiPath, async function fill_excluded_list(env) {
    if (!env.user_info.is_member) {
      env.res.excluded_sections = env.data.excluded_sections = [];
      return;
    }

    let result = await N.models.forum.ExcludedSections.findOne()
                          .where('user').equals(env.user_info.user_id)
                          .lean(true);

    env.res.excluded_sections = env.data.excluded_sections = result?.excluded_sections || [];
  });


  // Get all visible sections
  //
  N.wire.before(apiPath, async function get_sections(env) {
    let visible_section_ids = await N.models.forum.Section.getVisibleSections(env.user_info.usergroups);

    // Fetch sections
    env.data.sections = await N.models.forum.Section.find().where('_id').in(visible_section_ids).lean(true);
  });


  // Filter excluded by user sections
  //
  N.wire.before(apiPath, function filter_excluded(env) {
    if (!env.data.excluded_sections || !env.data.excluded_sections.length) return;

    let excluded_sections = env.data.excluded_sections.map(sid => String(sid));

    function excluded(section_info) {
      if (!section_info.is_excludable) return false;

      if (excluded_sections.indexOf(String(section_info._id)) === -1) return false;

      let children = section_info.children || [];

      for (let i = 0; i < children.length; i++) {
        if (!excluded(children[i])) return false;
      }

      return true;
    }

    env.data.sections = env.data.sections.filter(s => !excluded(s));
  });


  // Fill topic list
  //
  N.wire.on(apiPath, async function forum_recent(env) {
    let cache = 'cache';
    let cut = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let visible_st = N.models.forum.Topic.statuses.LIST_VISIBLE;

    if (env.user_info.is_member) {
      let can_see_hellbanned = await N.settings.get('can_see_hellbanned', {
        user_id: env.user_info.user_id,
        usergroup_ids: env.user_info.usergroups
      }, {});

      if (env.user_info.hb || can_see_hellbanned) {
        visible_st = [ N.models.forum.Topic.statuses.HB, ...visible_st ];
        cache = 'cache_hb';
      }

      // cut for non-existent section equals to oldest cut for any section
      let dummy_category = '000000000000000000000000';
      let cuts = await N.models.users.Marker.cuts(env.user_info.user_id, [ dummy_category ], 'forum_topic');

      if (cut < cuts[dummy_category]) cut = cuts[dummy_category];
    }

    let topics = await N.models.forum.Topic.find()
                           .where(`${cache}.last_post`).gt(new ObjectId(cut / 1000))
                           .where('section').in(env.data.sections.map(s => s._id))
                           .sort(`-${cache}.last_post`)
                           .lean(true);

    topics = topics.filter(topic => visible_st.includes(topic.st));

    // Fetch read marks
    //
    let data = topics.map(topic => ({
      categoryId: topic.section,
      contentId: topic._id,
      lastPostNumber: topic[cache].last_post_hid,
      lastPostTs: topic[cache].last_ts
    }));

    let read_marks = await N.models.users.Marker.info(env.user_info.user_id, data, 'forum_topic');

    if (env.user_info.is_member) {
      // Filter new and unread topics
      topics = topics.filter(topic => read_marks[topic._id].isNew || read_marks[topic._id].next !== -1);
    }

    // Check permissions subcall
    //
    let access_env = { params: {
      topics,
      user_info: env.user_info,
      preload: env.data.sections
    } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    topics = topics.filter((__, idx) => access_env.data.access_read[idx]);


    // Remove topics created by ignored users
    //
    let first_users = topics.map(topic => topic[cache]?.first_user).filter(Boolean);

    let ignored = _.keyBy(
      await N.models.users.Ignore.find()
                .where('from').equals(env.user_info.user_id)
                .where('to').in(first_users)
                .select('from to -_id')
                .lean(true),
      'to'
    );

    topics = topics.filter(topic => {
      // Topic starter is ignored
      if (ignored[topic.cache?.first_user]) {
        return false;
      }

      // Last poster is ignored, and there is only one unread message
      // (topic still shows up if ignored user leaves multiple messages)
      if (ignored[topic.cache?.last_user] &&
          read_marks[topic._id].position >= (topic.cache?.last_post_hid || 1) - 1) {

        return false;
      }

      return true;
    });


    // Sanitize topics
    //
    topics = await sanitize_topic(N, topics, env.user_info);
    env.res.topics = env.data.topics = topics;

    // Filter only sections with topics on this page
    //
    let section_ids = new Set();
    for (let { section } of topics) section_ids.add(section.toString());
    let sections = env.data.sections.filter(section => section_ids.has(section._id.toString()));

    // Sanitize sections
    //
    sections = await sanitize_section(N, sections, env.user_info);
    env.res.sections = _.keyBy(sections, '_id');

    // Collect user ids
    //
    env.data.users = env.data.users || [];
    env.data.users = env.data.users.concat(topics.map(t => t.cache?.first_user).filter(Boolean));
    env.data.users = env.data.users.concat(topics.map(t => t.cache?.last_user).filter(Boolean));

    env.res.read_marks = {};
    for (let topic of topics) env.res.read_marks[topic._id] = read_marks[topic._id];
  });


  // Fill bookmarks
  //
  N.wire.after(apiPath, async function fill_bookmarks(env) {
    let postIds = env.data.topics.map(topic => topic.cache.first_post);

    let bookmarks = await N.models.users.Bookmark.find()
                              .where('user').equals(env.user_info.user_id)
                              .where('src').in(postIds)
                              .lean(true);

    env.res.own_bookmarks = bookmarks.map(b => b.src);
  });


  // Fill subscriptions
  //
  N.wire.after(apiPath, async function fill_subscriptions(env) {
    if (!env.user_info.is_member) {
      env.res.subscriptions = [];
      return;
    }

    let subscriptions = await N.models.users.Subscription.find()
                          .where('user').equals(env.user_info.user_id)
                          .where('to').in(env.data.topics.map(x => x._id))
                          .where('type').in(N.models.users.Subscription.types.LIST_SUBSCRIBED)
                          .lean(true);

    env.res.subscriptions = subscriptions.map(s => s.to);
  });


  // Fill settings
  //
  N.wire.after(apiPath, async function fetch_and_fill_permissions(env) {
    env.res.settings = env.res.settings || {};
    env.res.settings.highlight_all_unread = await env.extras.settings.fetch('highlight_all_unread');
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env) {
    return N.wire.emit('internal:forum.breadcrumbs_fill', { env });
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function forum_meta(env) {
    env.res.head.title = env.t('title');
    env.res.head.robots = 'noindex,follow';
    env.res.mark_cut_ts = Date.now();
  });
};
