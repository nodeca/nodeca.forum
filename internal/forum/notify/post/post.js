// Deliver `FORUM_NEW_POST` notification
//
'use strict';


const _         = require('lodash');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {
  N.wire.on('internal:users.notify.deliver', function* notify_deliver_froum_post(local_env) {
    if (local_env.type !== 'FORUM_NEW_POST') {
      return;
    }

    // Fetch post
    //
    let post = yield N.models.forum.Post
                        .findOne()
                        .where('_id').equals(local_env.src)
                        .lean(true);

    // If post not exists - terminate
    if (!post) { return; }

    // Fetch topic
    //
    let topic = yield N.models.forum.Topic
                          .findOne()
                          .where('_id').equals(post.topic)
                          .lean(true);

    // If topic not exists - terminate
    if (!topic) { return; }

    // Fetch section
    //
    let section = yield N.models.forum.Section
                            .findOne()
                            .where('_id').equals(topic.section)
                            .lean(true);

    // If section not exists - terminate
    if (!section) { return; }

    // Fetch user info
    let users_info = yield user_info(N, local_env.to);

    // Filter post owner (don't send notification to user who create this post)
    //
    local_env.to = local_env.to.filter(user_id => String(user_id) !== String(post.user));

    // If `post.to_user` is set, don't send him this notification because reply
    // notification already sent
    //
    if (post.to_user) {
      local_env.to = local_env.to.filter(user_id => String(user_id) !== String(post.to_user));
    }

    // Filter users who not watching this topic
    //
    let Subscription = N.models.users.Subscription;

    let subscriptions = yield Subscription
                                .find()
                                .where('user_id').in(local_env.to)
                                .where('to').equals(topic._id)
                                .where('type').equals(Subscription.types.WATCHING)
                                .lean(true);

    // Filter if subscriptions does not contain record with user_id
    local_env.to = local_env.to.filter(user_id => !_.find(subscriptions, { user_id }));

    // Filter users by access
    //
    yield local_env.to.slice().map(user_id => {
      let access_env = { params: { topic, posts: post, user_info: users_info[user_id] } };

      return N.wire.emit('internal:forum.access.post', access_env)
        .then(() => {
          if (!access_env.data.access_read) {
            local_env.to = _.without(local_env.to, user_id);
          }
          return;
        });
    });

    // Render messages
    //
    let general_project_name = yield N.settings.get('general_project_name');

    local_env.to.forEach(user_id => {
      let locale = users_info[user_id].locale || N.config.locales[0];

      let subject = N.i18n.t(locale, 'forum.notify.post.subject', {
        project_name: general_project_name,
        topic_title: topic.title
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

      let text = N.i18n.t(locale, 'forum.notify.post.text', {
        post_html: post.html,
        link: url,
        unsubscribe
      });

      local_env.messages[user_id] = { subject, text, url, unsubscribe };
    });
  });
};
