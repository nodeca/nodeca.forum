// Check post permissions
//
// In:
//  - env
//  - params.topic_hid
//  - params.post_hid
//
// Out:
//  - env.data.access_read
//  - env.data.topic
//  - env.data.post
//

'use strict';


module.exports = function (N, apiPath) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', function check_post_access(env, callback) {
    var match = N.router.matchAll(env.params.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.topic' && match.params.post_hid ? match : acc;
    }, null);

    if (!match) {
      callback();
      return;
    }

    N.wire.emit('internal:forum.access.post', {
      env: env,
      params: { topic_hid: match.params.topic_hid, post_hid: match.params.post_hid }
    }, callback);
  });


  //////////////////////////////////////////////////////////////////////////
  // Initialize return value for env.data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(data) {
    data.env.data.access_read = null;
  });


  // Fetch topic if it's not present already
  //
  N.wire.before(apiPath, function check_topic(data, callback) {
    var env = data.env;

    if (env.data.access_read === false) {
      callback();
      return;
    }

    N.wire.emit('internal:forum.access.topic', {
      env:    env,
      params: { topic_hid: data.params.topic_hid }
    }, function (err) {
      if (err) {
        callback(err);
        return;
      }

      if (!env.data.access_read) {
        callback();
        return;
      }

      // subcall will set access_read to true, so reset it to null again
      env.data.access_read = null;
      callback();
    });
  });


  // Fetch post if it's not present already
  //
  N.wire.on(apiPath, function fetch_post(data, callback) {
    var env = data.env;

    if (env.data.access_read === false) {
      callback();
      return;
    }

    if (env.data.post) {
      callback();
      return;
    }

    N.models.forum.Post.findOne({ hid: data.params.post_hid, topic: env.data.topic._id })
        .lean(true)
        .exec(function (err, post) {

      if (err) {
        callback(err);
        return;
      }

      if (!post) {
        env.data.access_read = false;
        callback();
        return;
      }

      env.data.post = post;
      callback();
    });
  });


  // Check post permissions
  //
  N.wire.on(apiPath, function check_post_access(data, callback) {
    var Post = N.models.forum.Post;
    var env = data.env;

    if (env.data.access_read === false) {
      callback();
      return;
    }

    env.extras.settings.fetch('can_see_hellbanned', function (err, can_see_hellbanned) {
      if (err) {
        callback(err);
        return;
      }

      var allow_access = (env.data.post.st === Post.statuses.VISIBLE || env.data.post.ste === Post.statuses.VISIBLE);

      if (env.data.post.st === Post.statuses.HB) {
        allow_access = allow_access && (env.user_info.hb || can_see_hellbanned);
      }

      if (!allow_access) {
        env.data.access_read = false;
      }

      callback();
    });
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(data) {
    var env = data.env;

    if (env.data.access_read === false) {
      return;
    }

    data.env.data.access_read = true;
  });
};
