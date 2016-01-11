// Deliver `FORUM_REPLY` notification
//
'use strict';


var async     = require('async');
var _         = require('lodash');
var user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {
  N.wire.on('internal:users.notify.deliver', function notify_deliver_froum_reply(local_env, callback) {
    if (local_env.type !== 'FORUM_REPLY') {
      callback();
      return;
    }

    var post, topic, section, user, users_info;

    async.series([

      // Fetch post
      //
      function (next) {
        N.models.forum.Post.findOne()
            .where('_id').equals(local_env.src)
            .lean(true)
            .exec(function (err, res) {

          if (err) {
            next(err);
            return;
          }

          // If post not exists - terminate async here
          if (!res) {
            next(-1);
            return;
          }

          post = res;
          next();
        });
      },

      // Fetch topic
      //
      function (next) {
        N.models.forum.Topic.findOne()
            .where('_id').equals(post.topic)
            .lean(true)
            .exec(function (err, res) {

          if (err) {
            next(err);
            return;
          }

          // If topic not exists - terminate async here
          if (!res) {
            next(-1);
            return;
          }

          topic = res;
          next();
        });
      },

      // Fetch section
      //
      function (next) {
        N.models.forum.Section.findOne()
            .where('_id').equals(topic.section)
            .lean(true)
            .exec(function (err, res) {

          if (err) {
            next(err);
            return;
          }

          // If section not exists - terminate async here
          if (!res) {
            next(-1);
            return;
          }

          section = res;
          next();
        });
      },

      // Fetch answer author
      //
      function (next) {
        N.models.users.User.findOne()
            .where('_id').equals(post.user)
            .lean(true)
            .exec(function (err, res) {

          if (err) {
            next(err);
            return;
          }

          user = res;
          next();
        });
      },

      // Fetch user info
      //
      function (next) {
        user_info(N, local_env.to, function (err, res) {
          if (err) {
            next(err);
            return;
          }

          users_info = res;
          next();
        });
      },

      // Filter by post owner (don't send notification if user reply to own post)
      //
      function (next) {
        local_env.to = local_env.to.filter(user_id => String(user_id) !== String(post.user));
        next();
      },

      // Filter users who muted this topic
      //
      function (next) {
        // Shortcut
        var Subscription = N.models.users.Subscription;

        Subscription.find()
            .where('user_id').in(local_env.to)
            .where('to').equals(topic._id)
            .where('type').equals(Subscription.types.MUTED)
            .lean(true)
            .exec(function (err, subscriptions) {

          if (err) {
            next(err);
            return;
          }

          subscriptions.forEach(subscription => {
            local_env.to = _.without(local_env.to, String(subscription.user_id));
          });
          next();
        });
      },

      // Filter users by access
      //
      function (next) {
        async.each(local_env.to, function (user_id, cb) {
          var access_env = { params: { topic: topic, posts: post, user_info: users_info[user_id] } };

          N.wire.emit('internal:forum.access.post', access_env, function (err) {
            if (err) {
              cb(err);
              return;
            }

            if (!access_env.data.access_read) {
              local_env.to = _.without(local_env.to, user_id);
            }

            cb();
          });
        }, next);
      },

      // Render messages
      //
      function (next) {
        N.settings.get('general_project_name', function (err, general_project_name) {
          if (err) {
            next(err);
            return;
          }

          var locale, subject, url, text, unsubscribe;

          local_env.to.forEach(function (user_id) {
            locale = users_info[user_id].locale || N.config.locales[0];

            subject = N.i18n.t(locale, 'forum.notify.reply.subject', {
              project_name: general_project_name,
              user_name: user ? user.name : N.i18n.t(locale, 'forum.notify.reply.someone')
            });

            url = N.router.linkTo('forum.topic', {
              section_hid: section.hid,
              topic_hid: topic.hid,
              post_hid: post.hid
            });

            unsubscribe = N.router.linkTo('forum.topic.unsubscribe', {
              section_hid: section.hid,
              topic_hid: topic.hid
            });

            text = N.i18n.t(locale, 'forum.notify.reply.text', {
              post_html: post.html,
              link: url,
              unsubscribe
            });

            local_env.messages[user_id] = { subject, text, url, unsubscribe };
          });

          next();
        });
      }

    ], function (err) {
      // Special case if async was terminated
      if (err === -1) {
        callback();
        return;
      }

      if (err) {
        callback(err);
        return;
      }

      callback();
    });
  });
};
