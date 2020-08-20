// Collect urls to include in sitemap
//

'use strict';

const stream   = require('stream');
const multi    = require('multistream');
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function get_forum_sitemap(data) {
    let user_info      = await userInfo(N, null);
    let posts_per_page = await N.settings.get('posts_per_page');
    let sections       = await N.models.forum.Section.find().sort('hid').lean(true);

    let access_env = { params: { sections, user_info } };

    await N.wire.emit('internal:forum.access.section', access_env);

    let visible_sections = sections.filter((section, idx) =>
      !!access_env.data.access_read[idx]
    );

    let sections_by_id = {};

    for (let section of sections) sections_by_id[section._id] = section;

    let buffer = [];

    buffer.push({ loc: N.router.linkTo('forum.index', {}), lastmod: new Date() });

    for (let section of visible_sections) {
      buffer.push({
        loc: N.router.linkTo('forum.section', {
          section_hid: section.hid
        }),
        lastmod: section.cache.last_ts
      });
    }

    let section_stream = stream.Readable.from(buffer);

    let topic_stream = new stream.Transform({
      objectMode: true,
      transform(topic, encoding, callback) {
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
      }
    });

    stream.pipeline(
      N.models.forum.Topic.find()
          .where('section').in(visible_sections.map(section => section._id))
          .where('st').in(N.models.forum.Topic.statuses.LIST_VISIBLE)
          .select('section hid cache.post_count cache.last_ts')
          .sort('hid')
          .lean(true)
          .stream(),

      topic_stream,
      () => {}
    );

    data.streams.push({
      name: 'forum',
      stream: multi.obj([ section_stream, topic_stream ])
    });
  });
};
