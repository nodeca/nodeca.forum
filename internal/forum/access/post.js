// Check post permissions
//
// In:
//
// - params.topics - array of models.forum.Post. Could be plain value
// - params.user_info - user id or Object with `usergroups` array
// - params.preload - array of posts, topics or sections (used as a cache)
// - data - cache + result
//   - user_info
//   - access_read
//   - topics
// - cache - object of `id => post, topic or section`, only used internally
//
// Out:
//
// - data.access_read - array of boolean. If `params.topics` is not array - will be plain boolean
//

'use strict';


const _        = require('lodash');
const ObjectId = require('mongoose').Types.ObjectId;
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', function* check_post_access(access_env) {
    let match = N.router.matchAll(access_env.params.url).reduce(
      (acc, match) => match.meta.methods.get === 'forum.topic' && (match.params.post_hid ? match : acc),
      null);

    if (!match) return;

    let topic = yield N.models.forum.Topic.findOne()
                          .where('hid').equals(match.params.topic_hid)
                          .lean(true);

    if (!topic) return;

    let post = yield N.models.forum.Post.findOne()
                         .where('topic').equals(topic._id)
                         .where('hid').equals(match.params.post_hid)
                         .lean(true);

    if (!post) return;

    let access_env_sub = {
      params: {
        posts: post,
        user_info: access_env.params.user_info,
        preload: [ topic ]
      }
    };

    yield N.wire.emit('internal:forum.access.post', access_env_sub);

    access_env.data.access_read = access_env_sub.data.access_read;
  });


  /////////////////////////////////////////////////////////////////////////////
  // Initialize return value for data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(locals) {
    locals.data = locals.data || {};

    let posts = Array.isArray(locals.params.posts) ?
                 locals.params.posts :
                 [ locals.params.posts ];

    locals.data.post_ids = posts.map(post => post._id);

    // fill in cache
    locals.cache = locals.cache || {};

    posts.forEach(post => { locals.cache[post._id] = post; });

    (locals.params.preload || []).forEach(object => { locals.cache[object._id] = object; });

    // initialize access_read, remove posts that's not found in cache
    locals.data.access_read = locals.data.post_ids.map(id => {
      if (!locals.cache[id]) return false;
      return null;
    });
  });


  // Fetch user user_info if it's not present already
  //
  N.wire.before(apiPath, function* fetch_usergroups(locals) {
    if (ObjectId.isValid(String(locals.params.user_info))) {
      locals.data.user_info = yield userInfo(N, locals.params.user_info);
      return;
    }

    // Use presented
    locals.data.user_info = locals.params.user_info;
  });


  // Fetch topics for all posts into cache
  //
  N.wire.before(apiPath, function* fetch_topics(locals) {
    // select all topic ids that belong to posts we need to check access to
    let ids = locals.data.post_ids
                  .filter((__, i) => locals.data.access_read[i] !== false)
                  .map(id => locals.cache[id].topic)
                  .filter(id => !locals.cache[id]);

    if (!ids.length) return;

    let result = yield N.models.forum.Topic
                           .find()
                           .where('_id').in(ids)
                           .lean(true);

    if (!result) return;

    result.forEach(topic => {
      locals.cache[topic._id] = topic;
    });
  });


  // Check topic permissions
  //
  N.wire.before(apiPath, function* check_topics(locals) {
    let topics = _.uniq(
      locals.data.post_ids
          .filter((__, i) => locals.data.access_read[i] !== false)
          .map(id => String(locals.cache[id].topic))
    ).map(topic_id => locals.cache[topic_id]);

    let access_env = {
      params: { topics, user_info: locals.data.user_info },
      cache: locals.cache
    };
    yield N.wire.emit('internal:forum.access.topic', access_env);

    // topic_id -> access
    let topics_access = {};

    topics.forEach((topic, i) => {
      topics_access[topic._id] = access_env.data.access_read[i];
    });

    locals.data.post_ids.forEach((id, i) => {
      if (!topics_access[locals.cache[id].topic]) locals.data.access_read[i] = false;
    });
  });


  // Check post permissions
  //
  N.wire.on(apiPath, function* check_post_access(locals) {
    let Post = N.models.forum.Post;
    let params = {
      user_id: locals.data.user_info.user_id,
      usergroup_ids: locals.data.user_info.usergroups
    };

    let can_see_hellbanned = yield N.settings.get('can_see_hellbanned', params, {});

    locals.data.post_ids.forEach((id, i) => {
      if (locals.data.access_read[i] === false) return; // continue

      let post = locals.cache[id];

      let allow_access = (post.st === Post.statuses.VISIBLE || post.ste === Post.statuses.VISIBLE);

      if (post.st === Post.statuses.HB) {
        allow_access = allow_access && (locals.data.user_info.hb || can_see_hellbanned);
      }

      if (!allow_access) {
        locals.data.access_read[i] = false;
      }
    });
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(locals) {
    locals.data.access_read = locals.data.access_read.map(val => val !== false);

    // If `params.topics` is not array - `data.access_read` should be also not an array
    if (!_.isArray(locals.params.posts)) {
      locals.data.access_read = locals.data.access_read[0];
    }
  });
};
