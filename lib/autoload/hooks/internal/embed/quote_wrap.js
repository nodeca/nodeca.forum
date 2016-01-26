// Generate a quote wrapper for forum posts
//

'use strict';


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

          callback(null, { user, post, topic });
        });
      });
    });

  }


  N.wire.on('internal:common.content.quote_wrap', function generate_quote_wrapper(data, callback) {
    if (data.html) {
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

        data.html = render(N, 'common.blocks.markup.quote', locals, {});
      }

      callback();
    });
  });
};
