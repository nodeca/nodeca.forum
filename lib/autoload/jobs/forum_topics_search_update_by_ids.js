// Add forum topics to search index
//
'use strict';


const _              = require('lodash');
const Promise        = require('bluebird');
const docid_topics   = require('nodeca.forum/lib/search/docid_topics');
const docid_sections = require('nodeca.forum/lib/search/docid_sections');
const userInfo       = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  N.wire.on('init:jobs', function register_forum_topics_search_update_by_ids() {

    N.queue.registerTask({
      name: 'forum_topics_search_update_by_ids',
      pool: 'hard',
      removeDelay: 3600,
      process: Promise.coroutine(function* (ids, options = {}) {
        let topics = yield N.models.forum.Topic.find()
                               .where('_id').in(ids)
                               .lean(true);

        if (!topics.length) return;

        let sections = yield N.models.forum.Section.find()
                                 .where('_id').in(_.uniq(topics.map(topic => String(topic.section))))
                                 .lean(true);

        let sections_by_id = _.keyBy(sections, '_id');

        let user_info = yield userInfo(N, null);
        let access_env = { params: { topics, user_info, preload: sections } };

        yield N.wire.emit('internal:forum.access.topic', access_env);

        let is_topic_public = {};

        topics.forEach((topic, idx) => {
          is_topic_public[topic._id] = access_env.data.access_read[idx] &&
                                       sections_by_id[topic.section].is_searchable;
        });

        let values = [];
        let args = [];

        for (let topic of topics) {
          let section = sections_by_id[topic.section];

          if (!section) {
            N.logger.error(`Cannot find forum section ${topic.section} referred by topic ${topic._id}`);
            continue;
          }

          let visible = N.models.forum.Topic.statuses.LIST_VISIBLE.indexOf(topic.st) !== -1;

          values.push('(?,?,?,?,?,?,?,?)');

          args.push(
            // id
            docid_topics(N, topic.hid),
            // content
            topic.title,
            // object_id
            String(topic._id),
            // section_uid
            docid_sections(N, section.hid),
            // post_count
            topic.cache.post_count,
            // public
            (is_topic_public[topic._id] && visible) ? 1 : 0,
            // visible
            visible ? 1 : 0,
            // ts
            Math.floor(topic.cache.last_ts / 1000)
          );
        }

        let query = `
          REPLACE INTO forum_topics
          (id, content, object_id, section_uid, post_count, public, visible, ts)
          VALUES ${values.join(', ')}
        `.replace(/\n\s*/mg, '');

        if (options.shadow) {
          yield N.search.execute_shadow(query, args);
        } else {
          yield N.search.execute(query, args);
        }
      })
    });
  });
};
