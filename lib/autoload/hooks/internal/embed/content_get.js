// Return full post contents for quote/snippet expansion
//

'use strict';


module.exports = function (N) {

  N.wire.on('internal:common.content.get', function* get_post_contents(data) {
    if (data.html) return;

    let match = N.router.matchAll(data.url).reduce(
      (acc, match) => match.meta.methods.get === 'forum.topic' && (match.params.post_hid ? match : acc),
      null
    );

    if (!match) return;

    let topic = yield N.models.forum.Topic
                          .findOne({ hid: match.params.topic_hid })
                          .lean(true);
    if (!topic) return;

    let post = yield N.models.forum.Post
                        .findOne({ topic: topic._id, hid: match.params.post_hid })
                        .lean(true);

    if (!post) return;

    data.html  = post.html;
    data.users = post.import_users;
  });
};
