// Check post permissions
//
// In:
//
// - params.topic - hid, id or models.forum.Topic
// - params.posts - array of hids, ids or models.forum.Post. Could be plain value
// - params.user_info - user id or Object with `usergroups` array
// - data - cache + result
//   - access_read
//   - posts
//   - topic
//
// Out:
//
// - data.access_read - array of boolean. If `params.posts` is not array - will be plain boolean
//
'use strict';


var _        = require('lodash');
var ObjectId = require('mongoose').Types.ObjectId;
var userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', function check_post_access(access_env, callback) {
    var match = N.router.matchAll(access_env.params.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.topic' && match.params.post_hid ? match : acc;
    }, null);

    if (!match) {
      callback();
      return;
    }

    var access_env_sub = {
      params: {
        topic: match.params.topic_hid,
        posts: match.params.post_hid,
        user_info: access_env.params.user_info
      }
    };

    N.wire.emit('internal:forum.access.post', access_env_sub, function (err) {
      if (err) {
        callback(err);
        return;
      }

      access_env.data.access_read = access_env_sub.data.access_read;
      callback();
    });
  });


  /////////////////////////////////////////////////////////////////////////////
  // Initialize return value for data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(locals) {
    locals.data = locals.data || {};

    locals.data.posts = _.isArray(locals.params.posts) ? locals.params.posts : [ locals.params.posts ];

    locals.data.access_read = locals.data.posts.map(function () {
      return null;
    });
  });


  // Check that all `data.posts` have same type
  //
  N.wire.before(apiPath, function check_params_type(locals) {
    var items = locals.data.posts;
    var type, curType;

    for (var i = 0; i < items.length; i++) {
      if (_.isNumber(items[i])) {
        curType = 'Number';
      } else if (ObjectId.isValid(String(items[i]))) {
        curType = 'ObjectId';
      } else {
        curType = 'Object';
      }

      if (!type) {
        type = curType;
      }

      if (curType !== type) {
        return new Error('internal:forum.access.post - can\'t mix object types in request');
      }
    }

    locals.data.type = type;
  });


  // Fetch user user_info if it's not present already
  //
  N.wire.before(apiPath, function fetch_usergroups(locals, callback) {
    if (ObjectId.isValid(String(locals.params.user_info))) {
      userInfo(N, locals.params.user_info, function (err, info) {
        if (err) {
          callback(err);
          return;
        }

        locals.data.user_info = info;
        callback();
      });
      return;
    }

    // Use presented
    locals.data.user_info = locals.params.user_info;
    callback();
  });


  // Fetch topic if it's not present already
  //
  N.wire.before(apiPath, function fetch_topic(locals, callback) {
    if (_.isNumber(locals.params.topic)) {
      N.models.forum.Topic.findOne({ hid: locals.params.topic }).lean(true).exec(function (err, res) {
        if (err) {
          callback(err);
          return;
        }

        locals.data.topic = res;
        callback();
      });
      return;
    }

    if (ObjectId.isValid(String(locals.params.topic))) {
      N.models.forum.Topic.findOne({ _id: locals.params.topic }).lean(true).exec(function (err, res) {
        if (err) {
          callback(err);
          return;
        }

        locals.data.topic = res;
        callback();
      });

      return;
    }

    // Use presented
    locals.data.topic = locals.params.topic;
    callback();
  });


  // Check topic permission
  //
  N.wire.before(apiPath, function check_topic(locals, callback) {
    var access_env = { params: { topics: locals.data.topic, user_info: locals.data.user_info } };

    N.wire.emit('internal:forum.access.topic', access_env, function (err) {
      if (err) {
        callback(err);
        return;
      }

      if (!access_env.data.access_read) {
        locals.data.access_read = locals.data.access_read.map(function () {
          return false;
        });
      }

      callback();
    });
  });


  // Fetch posts if it's not present already
  //
  N.wire.before(apiPath, function fetch_posts(locals, callback) {
    if (locals.data.type === 'Number') {
      var hids = locals.data.posts.filter(function (__, i) {
        return locals.data.access_read[i] !== false;
      });

      N.models.forum.Post.find()
          .where('topic').equals(locals.data.topic._id)
          .where('hid').in(hids)
          .select('hid st ste')
          .lean(true)
          .exec(function (err, result) {

        if (err) {
          callback(err);
          return;
        }

        locals.data.posts.forEach(function (hid, i) {
          if (locals.data.access_read[i] === false) {
            return; // continue
          }

          locals.data.posts[i] = _.find(result, { hid: hid });

          if (!locals.data.posts[i]) {
            locals.data.access_read[i] = false;
          }
        });
        callback();
      });
      return;
    }

    if (locals.data.type === 'ObjectId') {
      var ids = locals.data.posts.filter(function (__, i) {
        return locals.data.access_read[i] !== false;
      });

      N.models.forum.Post.find()
          .where('_id').in(ids)
          .select('_id st ste')
          .lean(true)
          .exec(function (err, result) {

        if (err) {
          callback(err);
          return;
        }

        locals.data.posts.forEach(function (id, i) {
          if (locals.data.access_read[i] === false) {
            return; // continue
          }

          locals.data.posts[i] = _.find(result, { _id: String(id) });

          if (!locals.data.posts[i]) {
            locals.data.access_read[i] = false;
          }
        });
        callback();
      });
      return;
    }

    callback();
    return;
  });


  // Check post permissions
  //
  N.wire.on(apiPath, function check_post_access(locals, callback) {
    var Post = N.models.forum.Post;
    var params = {
      user_id: locals.data.user_info.user_id,
      usergroup_ids: locals.data.user_info.usergroups
    };

    N.settings.get('can_see_hellbanned', params, {}, function (err, can_see_hellbanned) {
      if (err) {
        callback(err);
        return;
      }

      locals.data.posts.forEach(function (post, i) {
        if (locals.data.access_read[i] === false) {
          return; // continue
        }

        var allow_access = (post.st === Post.statuses.VISIBLE || post.ste === Post.statuses.VISIBLE);

        if (post.st === Post.statuses.HB) {
          allow_access = allow_access && (locals.data.user_info.hb || can_see_hellbanned);
        }

        if (!allow_access) {
          locals.data.access_read[i] = false;
        }
      });

      callback();
    });
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(locals) {
    locals.data.access_read = locals.data.access_read.map(function (val) {
      return val !== false;
    });

    // If `params.topics` is not array - `data.access_read` should be also not an array
    if (!_.isArray(locals.params.posts)) {
      locals.data.access_read = locals.data.access_read[0];
    }
  });
};
