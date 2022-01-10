// Deliver `FORUM_REPLY` notification
//
'use strict';


const render    = require('nodeca.core/lib/system/render/common');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  // Notification will not be sent if target user:
  //
  // 1. replies to his own post
  // 2. muted this topic
  // 3. no longer has access to this topic
  // 4. ignores author of this post
  //
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_forum_reply(local_env) {
    if (local_env.type !== 'FORUM_REPLY') return;

    // Fetch post
    //
    let post = await N.models.forum.Post.findById(local_env.src).lean(true);
    if (!post) return;

    // Fetch topic
    //
    let topic = await N.models.forum.Topic.findById(post.topic).lean(true);
    if (!topic) return;

    // Fetch section
    //
    let section = await N.models.forum.Section.findById(topic.section).lean(true);
    if (!section) return;

    // Fetch parent post
    if (!post.to) return;

    let parent_post = await N.models.forum.Post.findById(post.to).lean(true);
    if (!parent_post) return;

    // Fetch answer author
    //
    let user = await N.models.users.User.findById(post.user).lean(true);
    if (!user) return;

    let from_user_id = String(post.user);

    let user_ids = new Set([ String(parent_post.user) ]);

    // Apply ignores (list of users who already received this notification earlier)
    for (let user_id of local_env.ignore || []) user_ids.delete(user_id);

    // Fetch user info
    let users_info = await user_info(N, Array.from(user_ids));

    // 1. filter by post owner (don't send notification if user reply to own post)
    //
    user_ids.delete(from_user_id);

    // 2. filter users who muted this topic
    //
    let muted = await N.models.users.Subscription.find()
                          .where('user').in(Array.from(user_ids))
                          .where('to').equals(topic._id)
                          .where('type').equals(N.models.users.Subscription.types.MUTED)
                          .lean(true);

    for (let sub of muted) {
      user_ids.delete(String(sub.user));
    }

    // 3. filter users by access
    //
    for (let user_id of user_ids) {
      let access_env = { params: {
        posts: post,
        user_info: users_info[user_id],
        preload: [ topic ]
      } };

      await N.wire.emit('internal:forum.access.post', access_env);

      if (!access_env.data.access_read) user_ids.delete(user_id);
    }

    // 4. filter out ignored users
    //
    let ignore_data = await N.models.users.Ignore.find()
                                .where('from').in(Array.from(user_ids))
                                .where('to').equals(from_user_id)
                                .select('from to -_id')
                                .lean(true);

    for (let ignore of ignore_data) {
      user_ids.delete(String(ignore.from));
    }

    // Render messages
    //
    let general_project_name = await N.settings.get('general_project_name');

    for (let user_id of user_ids) {
      let locale = users_info[user_id].locale || N.config.locales[0];
      let helpers = {};

      helpers.t = (phrase, params) => N.i18n.t(locale, phrase, params);
      helpers.t.exists = phrase => N.i18n.hasPhrase(locale, phrase);
      helpers.asset_body = path => N.assets.asset_body(path);

      let subject = N.i18n.t(locale, 'users.notify.forum_reply.subject', {
        project_name: general_project_name,
        user: user ? user.nick : N.i18n.t(locale, 'users.notify.forum_reply.someone')
      });

      let url = N.router.linkTo('forum.topic', {
        section_hid: section.hid,
        topic_hid: topic.hid,
        post_hid: post.hid
      });

      let unsubscribe = N.router.linkTo('forum.topic.mute', {
        section_hid: section.hid,
        topic_hid: topic.hid
      });

      let text = render(N, 'users.notify.forum_reply', {
        title: topic.title,
        post_html: post.html,
        url,
        unsubscribe
      }, helpers);

      local_env.messages[user_id] = { subject, text };
    }
  });
};
