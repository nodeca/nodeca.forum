// Reflection helper for `internal:forum.post_list`:
//
// Builds hids of posts to fetch for current page
//
// In:
//
// - env.user_info.hb
// - env.data.posts_visible_statuses - list of statuses, allowed to view
// - env.data.topic
// - env.params.page
//
// Out:
//
// - env.data.posts_hids
//
// Needed in:
//
// - `forum/topic/topic.js`
//
'use strict';


const _       = require('lodash');
const Promise = require('bluebird');


module.exports = function (N) {

  // Shortcut
  const Post = N.models.forum.Post;

  return Promise.coroutine(function* buildPostHids(env) {

    let posts_per_page = yield env.extras.settings.fetch('posts_per_page');

    // Posts with this statuses are counted on page (others are shown, but not counted)
    let countable_statuses = [ Post.statuses.VISIBLE ];

    // For hellbanned users - count hellbanned posts too
    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      countable_statuses.push(Post.statuses.HB);
    }

    // Page numbers starts from 1, not from 0
    let page_current = parseInt(env.params.page, 10);
    let post_count = (env.data.settings.can_see_hellbanned || env.user_info.hb) ?
                     env.data.topic.cache_hb.post_count : env.data.topic.cache.post_count;
    let page_max = Math.ceil(post_count / posts_per_page) || 1;

    // Algorithm:
    //
    // - calculate range for countable posts
    // - select visible posts (ids) in this range

    let countable = yield Post.find()
                              .where('topic').equals(env.data.topic._id)
                              .where('st').in(countable_statuses)
                              .select('hid -_id')
                              .sort('hid')
                              .skip((page_current - 1) * posts_per_page) // start offset
                              .limit(posts_per_page + 1) // fetch +1 post more, to detect next page
                              .lean(true);

    if (countable.length === 0) {
      env.data.posts_hids = [];
      return;
    }

    let query = Post.find()
                    .where('topic').equals(env.data.topic._id)
                    .where('st').in(env.data.posts_visible_statuses)
                    .where('hid').gte(countable[0].hid); // Set start limit

    // Set last limit. Need to cut last post, but NOT at last page
    if (page_current < page_max) {
      query.lt(countable[countable.length - 1].hid);
    }

    let posts = yield query.select('hid -_id')
                           .sort('hid')
                           .lean(true);

    env.data.posts_hids = _.map(posts, 'hid');
  });
};
