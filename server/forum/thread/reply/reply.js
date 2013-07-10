'use strict';

var _ = require('lodash');

var posts_in_fields = [
  '_id',
  'id',
  'to',
  'attach_list',
  'text',
  'fmt',
  'html',
  'user',
  'ts'
];

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    thread_id: {
      type: "integer",
      required: true
    },
    to_id: {
      type: "string"
    },
    format: {
      type: "string",
      required: true
    },
    text: {
      type: "string",
      required: true
    }
  });

  var Thread = N.models.forum.Thread;
  var Post = N.models.forum.Post;

  // fetch thread info to simplify permisson check
  N.wire.before(apiPath, function fetch_thread(env, callback) {
    env.extras.puncher.start('Thread info prefetch (reply)');

    Thread.findOne({ id: env.params.thread_id }).setOptions({ lean: true })
        .exec(function (err, thread) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      if (!thread) {
        callback({
          code: N.io.BAD_REQUIEST,
          message: env.t('invalid_thread', env.params)
        });
        return;
      }

      env.data.thread = thread;
      callback();
    });
  });

  // fetch parent post to simplify permisson check
  N.wire.before(apiPath, function fetch_parent_post(env, callback) {
    if (env.params.to_id) {
      env.extras.puncher.start('Parent post info prefetch (reply)');

      Post.findOne({ _id: env.params.to_id }).select('_id').setOptions({ lean: true })
          .exec(function (err, post) {

        env.extras.puncher.stop();

        if (err) {
          callback(err);
          return;
        }

        if (!post) {
          callback({
            code: N.io.BAD_REQUEST,
            message: env.t('invalid_parent_post')
          });
          return;
        }

        env.data.parent_post_id = post._id;
        callback();
        return;
      });
      return;
    }

    callback();
  });

  // Request handler
  //
  N.wire.on(apiPath, function save_new_post(env, callback) {
    var thread = env.data.thread,
        parent_post_id = env.data.parent_post_id;

    env.extras.puncher.start('New post save (reply)');

    var post = new Post();

    post.text = env.params.text;
    post.fmt = env.params.format;
    post.id = 1; // TODO: generate user friendly id
    post.ip = env.request.ip;
    post.state = 0;

    post.forum = thread.forum;
    post.forum_id = thread.forum_id;

    post.thread = thread._id;
    post.thread_id = thread.id;

    // TODO: Set post.user

    if (parent_post_id) {
      post.to = parent_post_id;
    }

    post.save(function (err) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.data.new_post = post;

      callback();
    });
  });

  // Process response
  //
  N.wire.after(apiPath, function process_response(env, callback) {

    env.response.data.posts = [
      _.pick(env.data.new_post, posts_in_fields)
    ];

    env.response.data.users = [];

    if (env.data.new_post.user) {
      env.response.data.users.push(env.data.new_post.user);
    }

    callback();
  });

};
