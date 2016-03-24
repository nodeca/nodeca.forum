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


const _  = require('lodash');
const co = require('bluebird-co').co;


module.exports = function (N) {

  // Shortcut
  const Post = N.models.forum.Post;

  return co.wrap(function* buildPostHids(env) {
    let range = [ env.params.post_hid - 1, env.params.post_hid + 1 ];

    // Posts with this statuses are counted on page (others are shown, but not counted)
    let countable_statuses = [ Post.statuses.VISIBLE ];

    // For hellbanned users - count hellbanned posts too
    if (env.user_info.hb) {
      countable_statuses.push(Post.statuses.HB);
    }

    function select_visible_before() {
      let posts_count = env.params.before;
      if (posts_count <= 0) return Promise.resolve([]);

      return Post.find()
        .where('topic').equals(env.data.topic._id)
        .where('st').in(countable_statuses)
        .where('hid').lt(env.params.post_hid)
        .select('hid -_id')
        .sort({ hid: -1 })
        .limit(posts_count + 1)
        .lean(true)
        .then(countable => {

          if (countable.length) {
            range[0] = countable[countable.length - 1].hid;
          }

          if (countable.length < posts_count + 1) {
            // we reached the last post, so it should be included as well
            range[0]--;
          }
        });
    }

    function select_visible_after() {
      let posts_count = env.params.after;
      if (posts_count <= 0) return Promise.resolve();

      return Post.find()
        .where('topic').equals(env.data.topic._id)
        .where('st').in(countable_statuses)
        .where('hid').gt(env.params.post_hid)
        .select('hid -_id')
        .sort({ hid: 1 })
        .limit(posts_count + 1)
        .lean(true)
        .then(countable => {

          if (countable.length) {
            range[1] = countable[countable.length - 1].hid;
          }

          if (countable.length < posts_count + 1) {
            // we reached the last post, so it should be included as well
            range[1]++;
          }
        });
    }

    yield [ select_visible_before(), select_visible_after() ];

    let posts = yield Post.find()
                          .where('topic').equals(env.data.topic._id)
                          .where('st').in(env.data.posts_visible_statuses)
                          .where('hid').gt(range[0])
                          .where('hid').lt(range[1])
                          .select('hid -_id')
                          .sort('hid')
                          .lean(true);

    env.data.posts_hids = _.map(posts, 'hid');
  });
};
