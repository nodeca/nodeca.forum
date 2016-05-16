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

  N.wire.on(apiPath, function* fetch_infraction_info(info_env) {
    let posts_ids = _.map(info_env.infractions.filter(i => i.src_type === 'FORUM_POST'), 'src');

    if (!posts_ids.length) return;


    // Fetch posts
    //
    let posts = yield N.models.forum.Post.find()
                          .where('_id').in(posts_ids)
                          .select('_id hid topic st ste md')
                          .lean(true);


    // Fetch topics
    //
    let topics = yield N.models.forum.Topic.find()
                          .where('_id').in(_.map(posts, 'topic'))
                          .select('_id hid section st ste title')
                          .lean(true);

    topics = topics.reduce((acc, t) => {
      acc[t._id] = t;
      return acc;
    }, {});


    // Check permissions to see posts
    //
    let restricted = [];

    for (let i = 0; i < posts.length; i++) {
      let access_env = { params: { topic: topics[posts[i].topic], posts: posts[i], user_info: info_env.user_info } };

      // We should check permissions one by one because posts could be from different topics
      yield N.wire.emit('internal:forum.access.post', access_env);

      if (!access_env.data.access_read) {
        restricted.push(posts[i]);
      }
    }

    posts = _.difference(posts, restricted);


    // Fetch sections
    //
    let sections = yield N.models.forum.Section.find()
                            .where('_id').in(_.map(topics, 'section'))
                            .select('_id hid')
                            .lean(true);

    sections = sections.reduce((acc, s) => {
      acc[s._id] = s;
      return acc;
    }, {});

    posts.forEach(post => {
      info_env.info[post._id] = {
        title: topics[post.topic].title,
        url: N.router.linkTo('forum.topic', {
          section_hid: sections[topics[post.topic].section].hid,
          topic_hid: topics[post.topic].hid,
          post_hid: post.hid
        }),
        text: post.md
      };
    });
  });
};
