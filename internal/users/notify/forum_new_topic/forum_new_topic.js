// Deliver `FORUM_NEW_TOPIC` notification
//
'use strict';


const _         = require('lodash');
const render    = require('nodeca.core/lib/system/render/common');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_froum_post(local_env) {
    if (local_env.type !== 'FORUM_NEW_TOPIC') return;

    // Fetch topic
    //
    let topic = await N.models.forum.Topic
                          .findOne()
                          .where('_id').equals(local_env.src)
                          .lean(true);

    // If topic not exists - terminate async here
    if (!topic) return;

    // Fetch post
    //
    let post = await N.models.forum.Post
                        .findOne()
                        .where('_id').equals(topic.cache.first_post)
                        .lean(true);

    // If post not exists - terminate async here
    if (!post) return;

    // Fetch section
    //
    let section = await N.models.forum.Section
                            .findOne()
                            .where('_id').equals(topic.section)
                            .lean(true);

    // If section not exists - terminate async here
    if (!section) return;

    // Fetch user info
    //
    let users_info = await user_info(N, local_env.to);

    // Filter topic owner (don't send notification to user who create this topic)
    //
    local_env.to = local_env.to.filter(user_id => String(user_id) !== String(post.user));

    // Filter users who not watching this section
    //
    let Subscription = N.models.users.Subscription;

    let subscriptions = await Subscription
                                .find()
                                .where('user').in(local_env.to)
                                .where('to').equals(section._id)
                                .where('type').equals(Subscription.types.WATCHING)
                                .lean(true);

    let watching = subscriptions.map(subscription => String(subscription.user));

    // Only if `user_id` in both arrays
    local_env.to = _.intersection(local_env.to, watching);

    // Filter users by access
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

    // Render messages
    //
    let general_project_name = await N.settings.get('general_project_name');

    local_env.to.forEach(user_id => {
      let locale = users_info[user_id].locale || N.config.locales[0];
      let helpers = {};

      helpers.t = (phrase, params) => N.i18n.t(locale, phrase, params);
      helpers.t.exists = phrase => N.i18n.hasPhrase(locale, phrase);

      let subject = N.i18n.t(locale, 'users.notify.forum_new_topic.subject', {
        project_name: general_project_name,
        section_title: section.title
      });

      let url = N.router.linkTo('forum.topic', {
        section_hid: section.hid,
        topic_hid: topic.hid,
        post_hid: post.hid
      });

      let unsubscribe = N.router.linkTo('forum.section.unsubscribe', {
        section_hid: section.hid
      });

      let text = render(N, 'users.notify.forum_new_topic', { post_html: post.html, link: url }, helpers);

      local_env.messages[user_id] = { subject, text, url, unsubscribe };
    });
  });
};
