// Fill urls for infractions with type `FORUM_POST`
//
'use strict';


const _ = require('lodash');


module.exports = function (N) {

  N.wire.on('internal:users.infractions.fill_content_urls', function* infractions_fill_content_urls(data) {
    let posts_ids = _.map(data.list.filter(i => i.src_type === 'FORUM_POST'), 'src_id');

    if (!posts_ids.length) return;


    // Fetch posts
    //
    let posts = yield N.models.forum.Post.find()
                          .where('_id').in(posts_ids)
                          .select('_id hid topic')
                          .lean(true);


    // Fetch topics
    //
    let topics = yield N.models.forum.Topic.find()
                          .where('_id').in(_.map(posts, 'topic'))
                          .select('_id hid section')
                          .lean(true);

    topics = topics.reduce((acc, t) => {
      acc[t._id] = t;
      return acc;
    }, {});


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
      data.urls[post._id] = N.router.linkTo('forum.topic', {
        section_hid: sections[topics[post.topic].section].hid,
        topic_hid: topics[post.topic].hid,
        post_hid: post.hid
      });
    });
  });
};
