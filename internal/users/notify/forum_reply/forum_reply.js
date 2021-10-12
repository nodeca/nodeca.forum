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
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_froum_reply(local_env) {
    if (local_env.type !== 'FORUM_REPLY') return;

    // Fetch post
    //
    let post = await N.models.forum.Post
                        .findOne()
                        .where('_id').equals(local_env.src)
                        .lean(true);

    // If post not exists - terminate
    if (!post) return;

    // Fetch topic
    //
    let topic = await N.models.forum.Topic
                          .findOne()
                          .where('_id').equals(post.topic)
                          .lean(true);

    // If topic not exists - terminate
    if (!topic) return;

    // Fetch section
    //
    let section = await N.models.forum.Section
                            .findOne()
                            .where('_id').equals(topic.section)
                            .lean(true);

    // If section not exists - terminate async here
    if (!section) return;

    // Fetch answer author
    //
    let user = await N.models.users.User
                        .findOne()
                        .where('_id').equals(post.user)
                        .lean(true);

    // Fetch user info
    //
    let users_info = await user_info(N, local_env.to);


    // 1. filter by post owner (don't send notification if user reply to own post)
    //
    local_env.to = local_env.to.filter(user_id => String(user_id) !== String(post.user));

    // 2. filter users who muted this topic
    //
    let Subscription = N.models.users.Subscription;

    let subscriptions = await Subscription
                                .find()
                                .where('user').in(local_env.to)
                                .where('to').equals(topic._id)
                                .where('type').equals(Subscription.types.MUTED)
                                .lean(true);

    let muted = new Set(subscriptions.map(x => String(x.user)));

    local_env.to = local_env.to.filter(user_id => !muted.has(String(user_id)));

    // 3. filter users by access
    //
    await Promise.all(local_env.to.slice().map(user_id => {
      let access_env = { params: {
        posts: post,
        user_info: users_info[user_id],
        preload: [ topic ]
      } };

      return N.wire.emit('internal:forum.access.post', access_env)
        .then(() => {
          if (!access_env.data.access_read) {
            local_env.to = local_env.to.filter(x => x !== user_id);
          }
        });
    }));

    // 4. filter out ignored users
    //
    let ignore_data = await N.models.users.Ignore.find()
                                .where('from').in(local_env.to)
                                .where('to').equals(post.user)
                                .select('from to -_id')
                                .lean(true);

    let ignored = new Set(ignore_data.map(x => String(x.from)));

    local_env.to = local_env.to.filter(user_id => !ignored.has(String(user_id)));

    // Render messages
    //
    let general_project_name = await N.settings.get('general_project_name');

    local_env.to.forEach(user_id => {
      let locale = users_info[user_id].locale || N.config.locales[0];
      let helpers = {};

      helpers.t = (phrase, params) => N.i18n.t(locale, phrase, params);
      helpers.t.exists = phrase => N.i18n.hasPhrase(locale, phrase);

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

      let text = render(N, 'users.notify.forum_reply', { post_html: post.html, link: url }, helpers);

      local_env.messages[user_id] = { subject, text, url, unsubscribe };
    });
  });
};
