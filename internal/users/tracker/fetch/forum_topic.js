// Fetch topics for tracker
//
// In:
//
//  - params.user_info
//  - params.subscriptions
//  - params.start (optional) - last last_ts from previous page
//  - params.limit - max number of topics, 0 means return count only
//
// Out:
//  - count
//  - items - { type, last_ts, id }
//  - next  - last last_ts (contents of params.start for the next page),
//            null if last page
//  - users - merged with env.data.users
//  - res   - misc data (specific to template, merged with env.res)
//

'use strict';


const ObjectId         = require('mongoose').Types.ObjectId;
const _                = require('lodash');
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function tracker_fetch_topics(locals) {
    locals.res = {};

    let topic_subs = _.filter(locals.params.subscriptions, { to_type: N.shared.content_type.FORUM_TOPIC });
    let sect_subs = _.filter(locals.params.subscriptions, { to_type: N.shared.content_type.FORUM_SECTION });

    let content_read_marks_expire = await N.settings.get('content_read_marks_expire');
    let min_cut = new Date(Date.now() - (content_read_marks_expire * 24 * 60 * 60 * 1000));

    let can_see_hellbanned = await N.settings.get('can_see_hellbanned', {
      user_id: locals.params.user_info.user_id,
      usergroup_ids: locals.params.user_info.usergroups
    }, {});

    let cache = locals.params.user_info.hb || can_see_hellbanned ? 'cache_hb' : 'cache';

    // Fetch topics by topic subscriptions
    //
    let topics = [];

    if (topic_subs.length !== 0) {
      topics = await N.models.forum.Topic.find()
                        .where('_id').in(_.map(topic_subs, 'to'))
                        .where(cache + '.last_ts').gt(min_cut)
                        .lean(true);
    }


    // Fetch topics by section subscriptions
    //
    if (sect_subs.length !== 0) {
      let cuts = await N.models.users.Marker.cuts(locals.params.user_info.user_id, _.map(sect_subs, 'to'));
      let queryParts = [];

      _.forEach(cuts, (cutTs, id) => {
        queryParts.push({ section: id, _id: { $gt: new ObjectId(Math.round(cutTs / 1000)) } });
      });

      topics = topics.concat(await N.models.forum.Topic.find({ $or: queryParts }).lean(true) || []);
      topics = _.uniqBy(topics, topic => String(topic._id));
    }


    // Fetch read marks
    //
    let data = topics.map(topic => ({
      categoryId: topic.section,
      contentId: topic._id,
      lastPostNumber: topic[cache].last_post_hid,
      lastPostTs: topic[cache].last_ts
    }));

    let read_marks = await N.models.users.Marker.info(locals.params.user_info.user_id, data);


    // Filter new and unread topics
    topics = topics.filter(topic => read_marks[topic._id].isNew || read_marks[topic._id].next !== -1);

    // Fetch sections
    let sections = await N.models.forum.Section.find().where('_id').in(_.map(topics, 'section')).lean(true);


    // Check permissions subcall
    //
    let access_env = { params: {
      topics,
      user_info: locals.params.user_info,
      preload: sections
    } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    topics = topics.filter((__, idx) => access_env.data.access_read[idx]);


    // Remove topics created by ignored users (except for subscribed ones)
    //
    let topic_subs_by_id = _.keyBy(topic_subs, 'to');

    let first_users = topics.map(topic => _.get(topic, cache + '.first_user')).filter(Boolean);

    let ignored = _.keyBy(
      await N.models.users.Ignore.find()
                .where('from').equals(locals.params.user_info.user_id)
                .where('to').in(first_users)
                .select('from to -_id')
                .lean(true),
      'to'
    );

    topics = topics.filter(topic => {
      // Topic starter is ignored, and topic is not subscribed to
      if (ignored[_.get(topic, cache + '.first_user')] &&
          !topic_subs_by_id[topic._id]) {

        return false;
      }

      // Last poster is ignored, and there is only one unread message
      // (topic still shows up if ignored user leaves multiple messages)
      if (ignored[_.get(topic, cache + '.last_user')] &&
          read_marks[topic._id].position >= _.get(topic, cache + '.last_post_hid') - 1) {

        return false;
      }

      return true;
    });


    let items = [];

    topics.forEach(topic => {
      items.push({
        type: 'forum_topic',
        last_ts: topic[cache].last_ts,
        id: String(topic._id)
      });
    });

    locals.count = items.length;

    if (locals.params.limit > 0) {
      if (locals.params.start) items = items.filter(item => item.last_ts.valueOf() < locals.params.start);

      let items_sorted = _.orderBy(items, 'last_ts', 'desc');
      let items_on_page = items_sorted.slice(0, locals.params.limit);

      locals.items = items_on_page;
      locals.next = items_sorted.length > items_on_page.length ?
                    items_on_page[items_on_page.length - 1].last_ts.valueOf() :
                    null;

      // Filter only topics that are on this page
      //
      let topic_ids = new Set();
      for (let { id } of items_on_page) topic_ids.add(id);
      topics = topics.filter(topic => topic_ids.has(String(topic._id)));

      // Sanitize topics
      //
      topics = await sanitize_topic(N, topics, locals.params.user_info);
      locals.res.forum_topics = _.keyBy(topics, '_id');

      // Filter only sections with topics on this page
      //
      let section_ids = new Set();
      for (let { section } of topics) section_ids.add(section.toString());
      sections = sections.filter(section => section_ids.has(section._id.toString()));

      // Sanitize sections
      //
      sections = await sanitize_section(N, sections, locals.params.user_info);
      locals.res.forum_sections = _.keyBy(sections, '_id');

      // Collect user ids
      //
      locals.users = locals.users || [];
      locals.users = locals.users.concat(_.map(topics, 'cache.last_user'));
      locals.users = locals.users.concat(_.map(topics, 'cache.first_user'));

      locals.res.read_marks = {};
      for (let id of topic_ids) locals.res.read_marks[id] = read_marks[id];
    }
  });
};
