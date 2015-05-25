// Show posts list (topic)
//
'use strict';


// When requested to display a post, we add a fixed amount of posts before
// and after it.
//
// This is needed to avoid triggering autoload code just after page load
//
var LOAD_POSTS_BEFORE_COUNT = 5;
var LOAD_POSTS_AFTER_COUNT  = 15;


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    properties: {
      section_hid: {
        type: 'integer',
        required: true
      },
      topic_hid: {
        type: 'integer',
        required: true
      },
      post_hid: {
        type: 'integer',
        minimum: 1
      },
      page: {
        type: 'integer',
        minimum: 1
      }
    },

    additionalProperties: false,

    oneOf: [
      { title: 'post_hid required', required: [ 'post_hid' ] },
      { title: 'page required',     required: [ 'page' ] }
    ]
  });


  var buildPostHidsByPage  = require('./list/_build_post_hids_by_page.js')(N),
      buildPostHidsByRange = require('./list/_build_post_hids_by_range.js')(N);


  // `params.section_hid` can be wrong (old link to moved topic).
  // If `params.section_hid` not correct - redirect to proper location.
  //
  // Redirect here to avoid fetching posts twice.
  //
  function buildPostHidsAndCheckRedirect(env, callback) {
    if (env.data.section.hid !== +env.params.section_hid) {
      callback({
        code: N.io.REDIRECT,
        head: {
          Location: N.router.linkTo('forum.topic', {
            section_hid: env.data.section.hid,
            topic_hid:   env.data.topic.hid,
            post_hid:    env.params.post_hid,
            page:        env.params.page
          })
        }
      });
      return;
    }

    if (env.params.post_hid) {
      env.params.before = LOAD_POSTS_BEFORE_COUNT;
      env.params.after  = LOAD_POSTS_AFTER_COUNT;
      buildPostHidsByRange(env, callback);
    } else {
      buildPostHidsByPage(env, callback);
    }
  }


  // Fetch posts subcall
  //
  N.wire.on(apiPath, function fetch_posts_list(env, callback) {
    env.data.topic_hid = env.params.topic_hid;
    env.data.build_posts_ids = buildPostHidsAndCheckRedirect;

    N.wire.emit('internal:forum.post_list', env, callback);
  });


  // If pagination info isn't available, fetch it from the database
  //
  N.wire.after(apiPath, function fetch_pagination(env, callback) {
    if (env.data.pagination) {
      callback();
      return;
    }

    var Post = N.models.forum.Post;

    // Posts with this statuses are counted on page (others are shown, but not counted)
    var countable_statuses = [ Post.statuses.VISIBLE ];

    // For hellbanned users - count hellbanned posts too
    if (env.user_info.hb) {
      countable_statuses.push(Post.statuses.HB);
    }

    // Calculate pagination info
    //
    // Both id builders used in this controller return hids,
    // so we use hids to utilize index.
    //
    var query = Post.find()
                    .where('topic').equals(env.data.topic._id)
                    .where('st').in(countable_statuses);

    // If no posts_hids are specified, calculate pagination for the post
    // after the last one.
    //
    if (env.data.posts_hids.length) {
      query = query.where('hid').lt(env.data.posts_hids[0]);
    }

    query.count(function (err, current_post_number) {
      if (err) {
        callback(err);
        return;
      }

      env.extras.settings.fetch('posts_per_page', function (err, posts_per_page) {
        if (err) {
          callback(err);
          return;
        }

        // Page numbers starts from 1, not from 0
        var post_count = env.user_info.hb ? env.data.topic.cache_hb.post_count : env.data.topic.cache.post_count;

        // Create page info
        env.data.pagination = {
          total:        post_count,
          per_page:     posts_per_page,
          chunk_offset: current_post_number
        };

        callback();
      });
    });
  });


  // Fill pagination
  //
  N.wire.after(apiPath, function fill_pagination(env) {

    // Prepared by `buildPostHids` or by a `fetch_pagination` function above
    env.res.pagination = env.data.pagination;
  });


  // Fill additional topic fields
  //
  N.wire.after(apiPath, function fill_topic_fields(env) {
    env.res.topic.title = env.data.topic.title;
  });


  // Redirect to last page, if requested > available
  //
  N.wire.after(apiPath, function redirect_to_last_page(env) {
    var page_max = Math.ceil(env.data.pagination.total / env.data.pagination.per_page) || 1;

    if (env.params.page > page_max) {
      // Requested page is BIGGER than maximum - redirect to the last one
      return {
        code: N.io.REDIRECT,
        head: {
          Location: N.router.linkTo('forum.topic', {
            section_hid: env.data.section.hid,
            topic_hid:   env.params.topic_hid,
            page:        page_max
          })
        }
      };
    }
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {

    N.models.forum.Section.getParentList(env.data.section._id, function (err, parents) {
      if (err) {
        callback(err);
        return;
      }

      // add current section
      parents.push(env.data.section._id);
      N.wire.emit('internal:forum.breadcrumbs_fill', { env: env, parents: parents }, callback);
    });
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_meta(env) {
    var topic  = env.data.topic;
    var current = Math.floor(env.data.pagination.chunk_offset / env.data.pagination.per_page) + 1;
    var max     = Math.ceil(env.data.pagination.total / env.data.pagination.per_page) || 1;

    env.res.head = env.res.head || {};

    env.res.head.title = (env.params.page > 1) ?
      env.t('title_with_page', { title: topic.title, page: env.params.page })
    :
      topic.title;

    env.res.head.canonical = N.router.linkTo('forum.topic', {
      section_hid: env.params.section_hid,
      topic_hid: env.params.topic_hid,
      page: current
    });

    if (current > 1) {
      env.res.head.prev = N.router.linkTo('forum.topic', {
        section_hid: env.params.section_hid,
        topic_hid: env.params.topic_hid,
        page: current - 1
      });
    }

    if (current < max) {
      env.res.head.next = N.router.linkTo('forum.topic', {
        section_hid: env.params.section_hid,
        topic_hid: env.params.topic_hid,
        page: current + 1
      });
    }
  });
};
