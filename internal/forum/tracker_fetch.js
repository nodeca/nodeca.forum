// Fetch topics for tracker
//
'use strict';


const ObjectId         = require('mongoose').Types.ObjectId;
const _                = require('lodash');
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N) {

  N.wire.on('internal:users.tracker.fetch', function* tracker_fetch_topics(env) {
    let topic_subs = _.filter(env.data.subscriptions, { to_type: N.models.users.Subscription.to_types.FORUM_TOPIC });
    let sect_subs = _.filter(env.data.subscriptions, { to_type: N.models.users.Subscription.to_types.FORUM_SECTION });


    // Fetch topics by topic subscriptions
    //
    let topics = [];

    if (topic_subs.length !== 0) {
      yield N.models.forum.Topic.find().where('_id').in(_.map(topic_subs, 'to')).lean(true);
    }


    // Fetch topics by section subscriptions
    //
    if (sect_subs.length !== 0) {
      let cuts = yield N.models.users.Marker.cuts(env.user_info.user_id, _.map(sect_subs, 'to'));
      let queryParts = [];

      _.forEach(cuts, (cutTs, id) => {
        queryParts.push({ $and: [ { section: id }, { _id: { $gt: new ObjectId(Math.round(cutTs / 1000)) } } ] });
      });

      topics = topics.concat(yield N.models.forum.Topic.find({ $or: queryParts }).lean(true) || []);
      topics = _.uniqBy(topics, topic => String(topic._id));
    }


    // Fetch read marks
    //
    let data = topics.map(topic => ({
      categoryId: topic.section,
      contentId: topic._id,
      lastPostNumber: topic.last_post_hid,
      lastPostTs: topic.cache.last_ts
    }));

    let read_marks = yield N.models.users.Marker.info(env.user_info.user_id, data);


    // Filter new and unread topics
    topics = topics.reduce((acc, topic) => {
      if (read_marks[topic._id].isNew || read_marks[topic._id].next !== -1) {
        acc.push(topic);
      }

      return acc;
    }, []);


    // Check permissions subcall
    //
    let access_env = { params: { topics, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.topic', access_env);

    topics = topics.reduce((acc, topic, i) => {
      if (access_env.data.access_read[i]) {
        acc.push(topic);
      }

      return acc;
    }, []);


    // Collect user ids
    //
    env.data.users = env.data.users || [];
    env.data.users = env.data.users.concat(_.map(topics, 'cache.last_user'));
    env.data.users = env.data.users.concat(_.map(topics, 'cache.first_user'));


    // Fetch sections
    let sections = yield N.models.forum.Section.find().where('_id').in(_.map(topics, 'section')).lean(true);

    // Sanitize topics
    topics = yield sanitize_topic(N, topics, env.user_info);

    // Sanitize sections
    sections = yield sanitize_section(N, sections, env.user_info);

    env.res.forum_topics = _.keyBy(topics, '_id');
    env.res.forum_sections = _.keyBy(sections, '_id');
    env.res.read_marks = _.assign(env.res.read_marks || {}, read_marks);

    topics.forEach(topic => {
      env.data.items.push({
        type: 'forum_topic',
        last_ts: topic.cache.last_ts,
        id: topic._id
      });
    });
  });
};
