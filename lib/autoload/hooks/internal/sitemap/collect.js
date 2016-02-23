// Collect urls to include in sitemap
//

'use strict';

const from2    = require('from2');
const pump     = require('pump');
const through2 = require('through2');
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  N.wire.on('internal:common.sitemap.collect', function* get_forum_sitemap(data) {
    let user_info      = yield userInfo(N, null);
    let posts_per_page = yield N.settings.get('posts_per_page');
    let sections       = yield N.models.forum.Section.find().sort('hid').lean(true);

    let access_env = { params: { sections, user_info } };

    yield N.wire.emit('internal:forum.access.section', access_env);

    let visible_sections = sections.filter((section, idx) =>
      !!access_env.data.access_read[idx]
    );

    let sections_by_id = {};

    sections.forEach(section => { sections_by_id[section._id] = section; });

    let buffer = [];

    buffer.push({ loc: N.router.linkTo('forum.index', {}), lastmod: new Date() });

    visible_sections.forEach(section => {
      buffer.push({
        loc: N.router.linkTo('forum.section', {
          section_hid: section.hid
        }),
        lastmod: section.cache.last_ts
      });
    });

    data.streams.push(from2.obj(buffer));

    data.streams.push(
      pump(
        N.models.forum.Topic.collection.find({
          section:  { $in: visible_sections.map(section => section._id) },
          st:       { $in: N.models.forum.Topic.statuses.LIST_VISIBLE }
        }, {
          section:            1,
          hid:                1,
          'cache.post_count': 1,
          'cache.last_ts':    1
        }).sort({ hid: 1 }).stream(),

        through2.obj(function (topic, encoding, callback) {
          let pages = Math.ceil(topic.cache.post_count / posts_per_page);

          for (let page = 1; page <= pages; page++) {
            this.push({
              loc: N.router.linkTo('forum.topic', {
                section_hid: sections_by_id[topic.section].hid,
                topic_hid:   topic.hid,
                page
              }),
              lastmod: topic.cache.last_ts
            });
          }

          callback();
        })
      )
    );
  });
};
