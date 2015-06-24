// Generate snippets for forum posts
//

'use strict';


var _      = require('lodash');
var render = require('nodeca.core/lib/system/render/common');


module.exports = function (N) {

  function fetch_data(params, callback) {

    N.models.forum.Topic.findOne({ hid: params.topic_hid })
        .lean(true)
        .exec(function (err, topic) {

      if (err) {
        callback(err);
        return;
      }

      if (!topic) {
        callback();
        return;
      }

      N.models.forum.Post.findOne({ topic: topic._id, hid: params.post_hid })
          .lean(true).exec(function (err, post) {

        if (err) {
          callback(err);
          return;
        }

        if (!post) {
          callback();
          return;
        }

        N.models.users.User.findOne({ _id: post.user, exists: true })
            .lean(true).exec(function (err, user) {

          if (err) {
            callback(err);
            return;
          }

          callback(null, {
            user:  user,
            post:  post,
            topic: topic
          });
        });
      });
    });

  }


  N.wire.on('internal:common.embed.block', function embed_post_block(env, callback) {
    if (env.res.embed) {
      callback();
      return;
    }

    var match = N.router.matchAll(env.params.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.topic' && match.params.post_hid ? match : acc;
    }, null);

    if (!match) {
      callback();
      return;
    }

    fetch_data(match.params, function (err, data) {

      if (err) {
        callback(err);
        return;
      }

      if (data) {
        var locals = {
          href:   N.router.linkTo('forum.topic', match.params),
          topic:  data.topic,
          post:   data.post,
          user:   data.user
        };

        env.res.embed = render(N, 'common.blocks.embed.post_block', locals, env.helpers);
      }

      callback();
    });
  });


  N.wire.on('internal:common.embed.inline', function embed_post_inline(env, callback) {
    if (env.res.embed) {
      callback();
      return;
    }

    var match = N.router.matchAll(env.params.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.topic' && match.params.post_hid ? match : acc;
    }, null);

    if (!match) {
      callback();
      return;
    }

    fetch_data(match.params, function (err, data) {

      if (err) {
        callback(err);
        return;
      }

      if (data) {
        var locals = {
          href:   env.params.url,
          topic:  data.topic,
          post:   data.post,
          user:   data.user
        };

        env.res.embed = render(N, 'common.blocks.embed.post_link', locals, env.helpers);
      }

      callback();
    });
  });
};
