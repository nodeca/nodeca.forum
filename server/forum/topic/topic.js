// Show posts list (topic)
//
'use strict';

const _              = require('lodash');
const sanitize_topic = require('nodeca.forum/lib/sanitizers/topic');


// When requested to display a post, we add a fixed amount of posts before
// and after it.
//
// This is needed to avoid triggering autoload code just after page load
//
const LOAD_POSTS_BEFORE_COUNT = 5;
const LOAD_POSTS_AFTER_COUNT  = 15;


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    properties: {
      section_hid: { type: 'integer', required: true },
      topic_hid:   { type: 'integer', required: true },
      post_hid:    { type: 'integer', minimum: 1 },
      page:        { type: 'integer', minimum: 1 }
    },

    additionalProperties: false,

    oneOf: [
      { title: 'post_hid required', required: [ 'post_hid' ] },
      { title: 'page required',     required: [ 'page' ] }
    ]
  });


  let buildPostHidsByPage  = require('./list/_build_post_hids_by_page.js')(N),
      buildPostHidsByRange = require('./list/_build_post_hids_by_range.js')(N);


  // `params.section_hid` can be wrong (old link to moved topic).
  // If `params.section_hid` not correct - redirect to proper location.
  //
  // Redirect here to avoid fetching posts twice.
  //
  function buildPostHidsAndCheckRedirect(env) {
    if (env.data.section.hid !== +env.params.section_hid) {
      return Promise.reject({
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
    }

    if (env.params.post_hid) {
      env.params.before = LOAD_POSTS_BEFORE_COUNT;
      env.params.after  = LOAD_POSTS_AFTER_COUNT;

      return buildPostHidsByRange(env);
    }

    return buildPostHidsByPage(env);
  }


  // Fetch posts subcall
  //
  N.wire.on(apiPath, function fetch_posts_list(env) {
    env.data.topic_hid = env.params.topic_hid;
    env.data.build_posts_ids = buildPostHidsAndCheckRedirect;

    return N.wire.emit('internal:forum.post_list', env);
  });


  // Fill subscription type
  //
  N.wire.after(apiPath, async function fill_subscription(env) {
    if (!env.user_info.is_member) {
      env.res.subscription = null;
      return;
    }

    let subscription = await N.models.users.Subscription
                          .findOne({ user: env.user_info.user_id, to: env.data.topic._id })
                          .lean(true);

    env.res.subscription = subscription?.type;
  });


  // Fill `env.data.pagination` structure
  //
  N.wire.after(apiPath, async function fetch_pagination(env) {
    let posts_per_page = await env.extras.settings.fetch('posts_per_page');

    let post_count = (env.data.settings.can_see_hellbanned || env.user_info.hb) ?
                     env.data.topic.cache_hb.post_count : env.data.topic.cache.post_count;

    // If user requests a specific page, we know how many posts are displayed
    // before it.
    //
    if (env.params.page) {
      let page_current = parseInt(env.params.page, 10);

      env.data.pagination = {
        total:        post_count,
        per_page:     posts_per_page,
        chunk_offset: posts_per_page * (page_current - 1)
      };

      env.res.current_post_hid = env.res.posts[0]?.hid;

      return;
    }

    // If user requests a post by its hid, we need to retrieve a number
    // of posts before it to calculate pagination info
    //
    // Both id builders used in this controller return hids,
    // so we use hids to utilize index.
    //
    let current_post_number = await N.models.forum.PostCountCache.getCount(
      env.data.topic._id,
      env.data.topic.version,
      // `env.data.posts_hids` could not be empty, but we should avoid exception in all cases.
      env.data.posts_hids[0] || 0,
      env.data.settings.can_see_hellbanned || env.user_info.hb
    );

    env.res.current_post_hid = env.params.post_hid;

    // Create page info
    env.data.pagination = {
      total:        post_count,
      per_page:     posts_per_page,
      chunk_offset: current_post_number
    };
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
    let page_max = Math.ceil(env.data.pagination.total / env.data.pagination.per_page) || 1;

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
  N.wire.after(apiPath, async function fill_topic_breadcrumbs(env) {
    let parents = await N.models.forum.Section.getParentList(env.data.section._id);

    // add current section
    parents.push(env.data.section._id);
    await N.wire.emit('internal:forum.breadcrumbs_fill', { env, parents });
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_meta(env) {
    let topic  = env.data.topic;
    let current = Math.floor(env.data.pagination.chunk_offset / env.data.pagination.per_page) + 1;
    let max     = Math.ceil(env.data.pagination.total / env.data.pagination.per_page) || 1;

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


  // Update view counter
  //
  // The handler is deliberately synchronous with all updates happening in the
  // background, so it won't affect response time
  //
  N.wire.after(apiPath, function update_view_counter(env) {
    // First-time visitor or a bot, don't count those
    if (env.session_just_created) return;

    N.redis.time(function (err, time) {
      if (err) return;

      let score = Math.floor(time[0] * 1000 + time[1] / 1000);
      let key   = `${env.data.topic._id}-${env.session_id}`;

      N.redis.zscore('views:forum_topic:track_last', key, function (err, old_score) {
        if (err) return;

        // Check if user has loaded the same page in the last 10 minutes,
        // it prevents refreshes and inside-the-topic navigation from being
        // counted.
        //
        if (Math.abs(score - old_score) < 10 * 60 * 1000) { return; }

        N.redis.zadd('views:forum_topic:track_last', score, key, function (err) {
          if (err) return;

          N.redis.hincrby('views:forum_topic:count', String(env.data.topic._id), 1, function () {});
        });
      });
    });
  });


  // Mark topic as read
  //
  N.wire.after(apiPath, function mark_topic_read(env) {
    if (!env.user_info.is_member) return;

    // Don't need wait for callback, just log error if needed
    N.models.users.Marker.mark(
      env.user_info.user_id,
      env.data.topic._id,
      env.data.section._id,
      'forum_topic').catch(err => N.logger.error(`Marker cannot mark topic as read: ${err}`));
  });


  // Add blocks
  //
  N.wire.after(apiPath, function fill_post_list_blocks(env) {
    env.res.posts_list_before_post = env.res.posts_list_before_post || [];

    env.res.posts_list_before_post.push('paginator');
    env.res.posts_list_before_post.push('datediff');
  });


  // Add "similar topics" block
  //
  N.wire.after(apiPath, async function fill_similar_topics(env) {
    let data = { topic_id: env.data.topic._id };

    try {
      await N.wire.emit('internal:forum.topic_similar', data);
    } catch (__) {
      // if similar topics can't be fetched, just show empty result
      return;
    }

    if (data.results?.length) {
      let topics = await N.models.forum.Topic.find()
                             .where('_id').in(data.results.map(r => r.topic_id))
                             .lean(true);

      let sections = await N.models.forum.Section.find()
                               .where('_id').in(_.uniq(topics.map(t => t.section)).map(String))
                               .lean(true);

      let access_env = { params: { topics, user_info: env.user_info, preload: sections } };

      await N.wire.emit('internal:forum.access.topic', access_env);

      let is_topic_visible = {};

      topics.forEach((topic, idx) => {
        is_topic_visible[topic._id] = access_env.data.access_read[idx];
      });

      let topics_by_id   = _.keyBy(await sanitize_topic(N, topics, env.user_info), '_id');
      let sections_by_id = _.keyBy(sections, '_id'); // not sanitized because only hid is used

      env.res.similar_topics = data.results.filter(result => is_topic_visible[result.topic_id])
                                           .map(result => ({
                                             topic:       topics_by_id[result.topic_id],
                                             section_hid: sections_by_id[topics_by_id[result.topic_id].section].hid,
                                             weight:      result.weight
                                           }));
    }
  });
};
