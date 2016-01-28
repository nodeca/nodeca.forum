// Deliver `FORUM_REPLY` notification
//
'use strict';


var _         = require('lodash');
var user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {
  N.wire.on('internal:users.notify.deliver', function* notify_deliver_froum_reply(local_env) {
    if (local_env.type !== 'FORUM_REPLY') return;

    // Fetch post
    //
    let post = yield N.models.forum.Post
                        .findOne()
                        .where('_id').equals(local_env.src)
                        .lean(true);

    // If post not exists - terminate
    if (!post) return;

    // Fetch topic
    //
    let topic = yield N.models.forum.Topic
                          .findOne()
                          .where('_id').equals(post.topic)
                          .lean(true);

    // If topic not exists - terminate
    if (!topic) return;

    // Fetch section
    //
    let section = N.models.forum.Section
                      .findOne()
                      .where('_id').equals(topic.section)
                      .lean(true);

    // If section not exists - terminate async here
    if (!section) return;

    // Fetch answer author
    //
    let user = yield N.models.users.User
                        .findOne()
                        .where('_id').equals(post.user)
                        .lean(true);

    // Fetch user info
    //
    let users_info = yield user_info(N, local_env.to);


    // Filter by post owner (don't send notification if user reply to own post)
    //
    local_env.to = local_env.to.filter(user_id => String(user_id) !== String(post.user));

    // Filter users who muted this topic
    //
    let Subscription = N.models.users.Subscription;

    let subscriptions = yield Subscription
                                .find()
                                .where('user_id').in(local_env.to)
                                .where('to').equals(topic._id)
                                .where('type').equals(Subscription.types.MUTED)
                                .lean(true);

    // TODO: replace like in post notify?
    subscriptions.forEach(subscription => {
      local_env.to = _.without(local_env.to, String(subscription.user_id));
    });

    // Filter users by access
    //
    yield local_env.to.slice().map(user_id => {
      let access_env = { params: { topic, posts: post, user_info: users_info[user_id] } };

      return N.wire.emit('internal:forum.access.post', access_env)
        .then(() => {
          if (!access_env.data.access_read) {
            local_env.to = _.without(local_env.to, user_id);
          }
        });
    });

    // Render messages
    //
    let general_project_name = yield N.settings.get('general_project_name');

    local_env.to.forEach(function (user_id) {
      let locale = users_info[user_id].locale || N.config.locales[0];

      let subject = N.i18n.t(locale, 'forum.notify.reply.subject', {
        project_name: general_project_name,
        user_name: user ? user.name : N.i18n.t(locale, 'forum.notify.reply.someone')
      });

      let url = N.router.linkTo('forum.topic', {
        section_hid: section.hid,
        topic_hid: topic.hid,
        post_hid: post.hid
      });

      let unsubscribe = N.router.linkTo('forum.topic.unsubscribe', {
        section_hid: section.hid,
        topic_hid: topic.hid
      });

      let text = N.i18n.t(locale, 'forum.notify.reply.text', {
        post_html: post.html,
        link: url,
        unsubscribe
      });

      local_env.messages[user_id] = { subject, text, url, unsubscribe };
    });
  });
};
