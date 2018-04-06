// Fetch topics for tracker
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


    // Fetch topics by topic subscriptions
    //
    let topics = [];

    if (topic_subs.length !== 0) {
      topics = await N.models.forum.Topic.find()
                        .where('_id').in(_.map(topic_subs, 'to'))
                        .lean(true);
    }


    // Fetch topics by section subscriptions
    //
    if (sect_subs.length !== 0) {
      let cuts = await N.models.users.Marker.cuts(locals.params.user_info.user_id, _.map(sect_subs, 'to'));
      let queryParts = [];

      _.forEach(cuts, (cutTs, id) => {
        queryParts.push({ $and: [ { section: id }, { _id: { $gt: new ObjectId(Math.round(cutTs / 1000)) } } ] });
      });

      topics = topics.concat(await N.models.forum.Topic.find({ $or: queryParts }).lean(true) || []);
      topics = _.uniqBy(topics, topic => String(topic._id));
    }


    // Fetch read marks
    //
    let data = topics.map(topic => ({
      categoryId: topic.section,
      contentId: topic._id,
      lastPostNumber: topic.last_post_counter,
      lastPostTs: topic.cache.last_ts
    }));

    let read_marks = await N.models.users.Marker.info(locals.params.user_info.user_id, data);


    // Filter new and unread topics
    topics = topics.reduce((acc, topic) => {
      if (read_marks[topic._id].isNew || read_marks[topic._id].next !== -1) {
        acc.push(topic);
      }

      return acc;
    }, []);


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

    topics = topics.reduce((acc, topic, i) => {
      if (access_env.data.access_read[i]) {
        acc.push(topic);
      }

      return acc;
    }, []);


    // Collect user ids
    //
    locals.users = locals.users || [];
    locals.users = locals.users.concat(_.map(topics, 'cache.last_user'));
    locals.users = locals.users.concat(_.map(topics, 'cache.first_user'));

    // Remove topics created by ignored users (except for subscribed ones)
    //
    let topic_subs_by_id = _.keyBy(topic_subs, 'to');

    let first_users = topics.map(topic => _.get(topic, 'cache.first_user')).filter(Boolean);

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
      if (ignored[_.get(topic, 'cache.first_user')] &&
          !topic_subs_by_id[topic._id]) {

        return false;
      }

      // Last poster is ignored, and there is only one unread message
      // (topic still shows up if ignored user leaves multiple messages)
      if (ignored[_.get(topic, 'cache.last_user')] &&
          read_marks[topic._id].position >= _.get(topic, 'cache.last_post_hid') - 1) {

        return false;
      }

      return true;
    });

    // Sanitize topics
    topics = await sanitize_topic(N, topics, locals.params.user_info);

    // Sanitize sections
    sections = await sanitize_section(N, sections, locals.params.user_info);

    locals.res.forum_topics = _.keyBy(topics, '_id');
    locals.res.forum_sections = _.keyBy(sections, '_id');
    locals.res.read_marks = _.assign(locals.res.read_marks || {}, read_marks);

    let items = [];

    topics.forEach(topic => {
      items.push({
        type: 'forum_topic',
        last_ts: topic.cache.last_ts,
        id: topic._id
      });
    });

    locals.res.items = _.orderBy(items, 'last_ts', 'desc');
    locals.count = locals.res.items.length;
  });
};
