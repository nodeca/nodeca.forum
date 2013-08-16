'use strict';

var _ = require('lodash');


// topic and post statuses
var statuses = require('../_statuses.js');


var posts_in_fields = [
  '_id',
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
    topic_hid: {
      type: "integer",
      required: true
    },
    to_id: {
      type: "string"
    },
    _id: {
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

  var Topic = N.models.forum.Topic;
  var Post = N.models.forum.Post;

  // fetch topic info to simplify permisson check
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    env.extras.puncher.start('Topic info prefetch (reply)');

    Topic.findOne({ hid: env.params.topic_hid }).setOptions({ lean: true })
        .exec(function (err, topic) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      if (!topic) {
        callback({
          code: N.io.BAD_REQUIEST,
          message: env.t('error_invalid_topic', env.params)
        });
        return;
      }

      env.data.topic = topic;
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
            message: env.t('error_invalid_parent_post')
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

  // fetch post to simplify permisson check
  N.wire.before(apiPath, function fetch_post(env, callback) {
    if (env.params._id) {
      env.extras.puncher.start('Post info prefetch (edit)');

      Post.findOne({ _id: env.params._id })
          .exec(function (err, post) {

        env.extras.puncher.stop();

        if (err) {
          callback(err);
          return;
        }

        if (!post) {
          callback({
            code: N.io.BAD_REQUEST,
            message: env.t('error_invalid_post')
          });
          return;
        }

        env.data.post = post;

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
    var topic = env.data.topic,
        parent_post_id = env.data.parent_post_id,
        post;

    if (env.data.post) {
      env.extras.puncher.start('Post save (edit)');

      post = env.data.post;

      post.text = env.params.text;
      post.fmt = env.params.format;

      post.save(function(err){
        env.extras.puncher.stop();

        if (err) {
          callback(err);
          return;
        }

        env.data.new_post = post;

        callback();
      });
    } else {
      env.extras.puncher.start('New post save (reply)');

      post = new Post();

      post.text = env.params.text;
      post.fmt = env.params.format;
      post.ip = env.request.ip;
      post.st = statuses.post.VISIBLE;

      post.forum = topic.forum;
      post.topic = topic._id;

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
    }
  });

  // Process response
  //
  N.wire.after(apiPath, function process_response(env, callback) {

    env.res.posts = [
      _.pick(env.data.new_post, posts_in_fields)
    ];

    env.data.users = env.data.users || [];

    if (env.data.new_post.user) {
      env.data.users.push(env.data.new_post.user._id);
    }

    callback();
  });

};
