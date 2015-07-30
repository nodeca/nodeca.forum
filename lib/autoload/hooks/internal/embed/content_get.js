// Return full post contents for quote/snippet expansion
//

'use strict';


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

        callback(null, {
          post:  post,
          topic: topic
        });
      });
    });

  }


  N.wire.on('internal:common.content.get', function get_post_contents(data, callback) {
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

      data.html  = result.post.html;
      data.users = result.post.import_users;

      callback();
    });
  });
};
