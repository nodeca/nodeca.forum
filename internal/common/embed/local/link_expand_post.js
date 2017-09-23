// Generate snippets for forum posts
//
'use strict';


const render = require('nodeca.core/lib/system/render/common');


module.exports = function (N) {
  N.wire.on('internal:common.embed.local', async function embed_post(data) {
    if (data.html) return;

    let match = N.router.matchAll(data.url).reduce(
      (acc, match) => match.meta.methods.get === 'forum.topic' && (match.params.post_hid ? match : acc),
      null
    );

    if (!match) return;

    let topic = await N.models.forum.Topic
                          .findOne({ hid: match.params.topic_hid })
                          .lean(true);
    if (!topic) return;

    let post = await N.models.forum.Post
                        .findOne({ topic: topic._id, hid: match.params.post_hid })
                        .lean(true);
    if (!post) return;

    let user = await N.models.users.User
                        .findOne({ _id: post.user, exists: true })
                        .lean(true);

    let locals = { href: N.router.linkTo('forum.topic', match.params),
      topic, post, user };

    if (data.type === 'block') {
      let preview_data = await N.parser.md2preview({ text: post.md, limit: 500 });

      locals.html = preview_data.preview;
      data.html = render(N, 'common.blocks.markup.quote', locals, {});

    } else if (data.type === 'inline') {
      // preserve inline link exactly as it was (keep hash tags, etc.)
      locals.href = data.url;
      data.html = render(N, 'common.blocks.markup.forum_post_link', locals, {});
    }
  });
};
