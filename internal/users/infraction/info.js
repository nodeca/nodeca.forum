// Fill urls and titles for forum posts (`FORUM_POST`)
//
// In:
//
// - infractions ([users.Infraction])
// - user_info (Object)
//
// Out:
//
// - info (Object) - key is `src`, value { url, title }
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function fetch_infraction_info(info_env) {
    let posts_ids = info_env.infractions.filter(i => i.src_type === N.shared.content_type.FORUM_POST).map(i => i.src);

    if (!posts_ids.length) return;


    // Fetch posts
    //
    let posts = await N.models.forum.Post.find()
                          .where('_id').in(posts_ids)
                          .lean(true);

    // Fetch topics
    //
    let topics = await N.models.forum.Topic.find()
                          .where('_id').in(posts.map(p => p.topic))
                          .lean(true);

    // Fetch sections
    //
    let sections = await N.models.forum.Section.find()
                            .where('_id').in(topics.map(t => t.section))
                            .lean(true);

    // Check permissions to see posts
    //
    let access_env = { params: {
      posts,
      user_info: info_env.user_info,
      preload: [].concat(topics).concat(sections)
    } };

    await N.wire.emit('internal:forum.access.post', access_env);

    posts = posts.filter((__, idx) => access_env.data.access_read[idx]);

    let topics_by_id   = _.keyBy(topics, '_id');
    let sections_by_id = _.keyBy(sections, '_id');

    posts.forEach(post => {
      let topic = topics_by_id[post.topic];
      let section = sections_by_id[topic.section];

      info_env.info[post._id] = {
        title: topic.title,
        url: N.router.linkTo('forum.topic', {
          section_hid: section.hid,
          topic_hid: topic.hid,
          post_hid: post.hid
        }),
        text: post.md
      };
    });
  });
};
