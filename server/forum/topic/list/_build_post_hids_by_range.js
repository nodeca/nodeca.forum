// Reflection helper for `internal:forum.post_list`:
//
// Builds hids of posts to fetch for current page
//
// In:
//
// - env.user_info.hb
// - env.data.posts_visible_statuses - list of statuses, allowed to view
// - env.data.topic
// - env.params.post_hid
// - env.params.before
// - env.params.after
//
// Out:
//
// - env.data.posts_hids
//
// Needed in:
//
// - `forum/topic/topic.js`
// - `forum/topic/list/by_range.js`
//
'use strict';


const _       = require('lodash');


module.exports = function (N) {

  // Shortcut
  const Post = N.models.forum.Post;

  // Select starting post hid
  //
  function select_visible_before(env) {
    let posts_count = env.params.before;
    if (posts_count <= 0) return Promise.resolve(null);

    // Posts with this statuses are counted on page (others are shown, but not counted)
    let countable_statuses = [ Post.statuses.VISIBLE ];

    // For hellbanned users - count hellbanned posts too
    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      countable_statuses.push(Post.statuses.HB);
    }

    return Post.find()
      .where('topic').equals(env.data.topic._id)
      .where('st').in(countable_statuses)
      .where('hid').lt(env.params.post_hid)
      .select('hid -_id')
      .sort({ hid: -1 })
      .limit(posts_count + 1)
      .lean(true)
      .then(countable => {
        let result = null;

        if (countable.length) {
          result = countable[countable.length - 1].hid;

          if (countable.length < posts_count + 1) {
            // we reached the last post, so it should be included as well
            result--;
          }
        }

        return result;
      });
  }

  // Select ending post hid
  //
  function select_visible_after(env) {
    let posts_count = env.params.after;
    if (posts_count <= 0) return Promise.resolve(null);

    // Posts with this statuses are counted on page (others are shown, but not counted)
    let countable_statuses = [ Post.statuses.VISIBLE ];

    // For hellbanned users - count hellbanned posts too
    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      countable_statuses.push(Post.statuses.HB);
    }

    return Post.find()
      .where('topic').equals(env.data.topic._id)
      .where('st').in(countable_statuses)
      .where('hid').gt(env.params.post_hid)
      .select('hid -_id')
      .sort({ hid: 1 })
      .limit(posts_count + 1)
      .lean(true)
      .then(countable => {
        let result = null;

        if (countable.length) {
          result = countable[countable.length - 1].hid;

          if (countable.length < posts_count + 1) {
            // we reached the last post, so it should be included as well
            result++;
          }
        }

        return result;
      });
  }

  return async function buildPostHids(env) {
    let results = await Promise.all([ select_visible_before(env), select_visible_after(env) ]);

    let select_from = results[0] !== null ? results[0] : env.params.post_hid - 1;
    let select_to   = results[1] !== null ? results[1] : env.params.post_hid + 1;

    // select posts from the range calculated above
    // (post with hid=env.params.post_hid is always selected)
    let posts = await Post.find()
                          .where('topic').equals(env.data.topic._id)
                          .where('st').in(env.data.posts_visible_statuses)
                          .where('hid').gt(select_from)
                          .where('hid').lt(select_to)
                          .select('hid -_id')
                          .sort('hid')
                          .lean(true);

    env.data.posts_hids = _.map(posts, 'hid');
  };
};
