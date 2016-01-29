// Generate a quote wrapper for forum posts
//

'use strict';


var render = require('nodeca.core/lib/system/render/common');


module.exports = function (N) {

  N.wire.on('internal:common.content.quote_wrap', function* generate_quote_wrapper(data) {
    if (data.html) return;

    var match = N.router.matchAll(data.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.topic' && match.params.post_hid ? match : acc;
    }, null);

    if (!match) return;

    let topic = yield N.models.forum.Topic
                          .findOne({ hid: match.params.topic_hid })
                          .lean(true);
    if (!topic) return;

    let post = yield N.models.forum.Post
                        .findOne({ topic: topic._id, hid: match.params.post_hid })
                        .lean(true);
    if (!post) return;

    let user = yield N.models.users.User
                        .findOne({ _id: post.user, exists: true })
                        .lean(true);

    var locals = {
      href:   N.router.linkTo('forum.topic', match.params),
      topic, post, user
    };

    data.html = render(N, 'common.blocks.markup.quote', locals, {});
  });
};
