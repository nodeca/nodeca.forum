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


  N.wire.on('internal:common.embed.local', function embed_post_block(data, callback) {
    if (data.html) {
      callback();
      return;
    }

    if (data.type !== 'block') {
      callback();
      return;
    }

    var match = N.router.matchAll(data.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.topic' && match.params.post_hid ? match : acc;
    }, null);

    if (!match) {
      callback();
      return;
    }

    fetch_data(match.params, function (err, result) {

      if (err) {
        callback(err);
        return;
      }

      if (result) {
        var locals = {
          href:   N.router.linkTo('forum.topic', match.params),
          topic:  result.topic,
          post:   result.post,
          user:   result.user
        };

        data.html = render(N, 'common.blocks.embed.post_block', locals, {});
      }

      callback();
    });
  });


  N.wire.on('internal:common.embed.local', function embed_post_inline(data, callback) {
    if (data.html) {
      callback();
      return;
    }

    if (data.type !== 'inline') {
      callback();
      return;
    }

    var match = N.router.matchAll(data.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.topic' && match.params.post_hid ? match : acc;
    }, null);

    if (!match) {
      callback();
      return;
    }

    fetch_data(match.params, function (err, result) {

      if (err) {
        callback(err);
        return;
      }

      if (result) {
        var locals = {
          href:   data.url,
          topic:  result.topic,
          post:   result.post,
          user:   result.user
        };

        data.html = render(N, 'common.blocks.embed.post_link', locals, {});
      }

      callback();
    });
  });
};
