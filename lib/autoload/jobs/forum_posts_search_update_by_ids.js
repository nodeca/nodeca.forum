// Add forum posts to search index
//
'use strict';


const _              = require('lodash');
const Promise        = require('bluebird');
const docid_posts    = require('nodeca.forum/lib/search/docid_posts');
const docid_topics   = require('nodeca.forum/lib/search/docid_topics');
const docid_sections = require('nodeca.forum/lib/search/docid_sections');
const userInfo       = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  N.wire.on('init:jobs', function register_forum_posts_search_update_by_ids() {

    N.queue.registerTask({
      name: 'forum_posts_search_update_by_ids',
      pool: 'hard',
      removeDelay: 3600,
      process: Promise.coroutine(function* (ids, options = {}) {
        let posts = yield N.models.forum.Post.find()
                              .where('_id').in(ids)
                              .lean(true);

        if (!posts.length) return;

        let topics = yield N.models.forum.Topic.find()
                               .where('_id').in(_.uniq(posts.map(post => String(post.topic))))
                               .lean(true);

        let sections = yield N.models.forum.Section.find()
                                 .where('_id').in(_.uniq(topics.map(topic => String(topic.section))))
                                 .lean(true);

        let topics_by_id   = _.keyBy(topics, '_id');
        let sections_by_id = _.keyBy(sections, '_id');

        let user_info = yield userInfo(N, null);

        let access_env = { params: {
          posts,
          user_info,
          preload: [].concat(sections).concat(topics)
        } };

        yield N.wire.emit('internal:forum.access.post', access_env);

        let is_post_public = {};

        posts.forEach((post, idx) => {
          is_post_public[post._id] = access_env.data.access_read[idx] &&
                                     sections_by_id[topics_by_id[post.topic].section].is_searchable;
        });

        let values = [];
        let args = [];

        for (let post of posts) {
          let topic = topics_by_id[post.topic];

          if (!topic) {
            N.logger.error(`Cannot find forum topic ${post.topic} referred by post ${post._id}`);
            continue;
          }

          let section = sections_by_id[topic.section];

          if (!section) {
            N.logger.error(`Cannot find forum section ${topic.section} referred by topic ${topic._id}`);
            continue;
          }

          // only check `st` for posts assuming st=HB,ste=VISIBLE posts aren't public
          let visible = post.st === N.models.forum.Post.statuses.VISIBLE &&
                        N.models.forum.Topic.statuses.LIST_VISIBLE.indexOf(topic.st) !== -1;

          values.push('(?,?,?,?,?,?,?,?)');

          args.push(
            // id
            docid_posts(N, topic.hid, post.hid),
            // content
            post.html,
            // object_id
            String(post._id),
            // topic_uid
            docid_topics(N, topic.hid),
            // section_uid
            docid_sections(N, section.hid),
            // public
            (is_post_public[post._id] && visible) ? 1 : 0,
            // visible
            visible ? 1 : 0,
            // ts
            Math.floor(post.ts / 1000)
          );
        }

        if (options.shadow) {
          try {
            yield N.search.execute_shadow(
              'REPLACE INTO forum_posts ' +
              '(id, content, object_id, topic_uid, section_uid, public, visible, ts) ' +
              'VALUES ' + values.join(', '),
              args
            );
          } catch (err) {
            // check parent state (cancel doesn't explicitly finish iterator chunks),
            // if it's finished, it means task is canceled, so the error could be
            // safely ignored
            if ((yield N.queue.getTask(this.parent)).state !== 'finished') {
              throw err;
            }
          }
        } else {
          yield N.search.execute(
            'REPLACE INTO forum_posts ' +
            '(id, content, object_id, topic_uid, section_uid, public, visible, ts) ' +
            'VALUES ' + values.join(', '),
            args
          );
        }
      })
    });
  });
};
