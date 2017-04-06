// Create new topic
//
'use strict';


const _         = require('lodash');
const $         = require('nodeca.core/lib/parser/cheequery');
const charcount = require('charcount');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid:              { type: 'integer', required: true },
    title:                    { type: 'string', required: true },
    txt:                      { type: 'string', required: true },
    attach:                   {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo', required: true }
    },
    option_no_mlinks:         { type: 'boolean', required: true },
    option_no_emojis:         { type: 'boolean', required: true },
    option_no_quote_collapse: { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Check title length
  //
  N.wire.before(apiPath, function* check_title_length(env) {
    let min_length = yield env.extras.settings.fetch('forum_topic_title_min_length');

    if (charcount(env.params.title.trim()) < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_title_too_short', min_length)
      };
    }
  });


  // Fetch section info
  //
  N.wire.before(apiPath, function* fetch_section_info(env) {
    let section = yield N.models.forum.Section.findOne({ hid: env.params.section_hid }).lean(true);

    if (!section) throw N.io.NOT_FOUND;
    if (!section.is_enabled) throw N.io.NOT_FOUND;

    env.data.section = section;

    // Can not create topic in category. Should never happens - restricted on client
    if (section.is_category) throw N.io.BAD_REQUEST;

    // Can not create topic in read only section. Should never happens - restricted on client
    if (!section.is_writable) throw N.io.BAD_REQUEST;
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    env.extras.settings.params.section_id = env.data.section._id;

    let canStartTopics = yield env.extras.settings.fetch('forum_can_start_topics');

    if (!canStartTopics) throw N.io.FORBIDDEN;
  });


  // Check attachments owner
  //
  N.wire.before(apiPath, function attachments_check_owner(env) {
    return N.wire.emit('internal:users.attachments_check_owner', env);
  });


  // Prepare parse options
  //
  N.wire.before(apiPath, function* prepare_options(env) {
    let settings = yield N.settings.getByCategory(
      'forum_posts_markup',
      { usergroup_ids: env.user_info.usergroups },
      { alias: true });

    if (env.params.option_no_mlinks) {
      settings.link_to_title = false;
      settings.link_to_snippet = false;
    }

    if (env.params.option_no_emojis) {
      settings.emoji = false;
    }

    if (env.params.option_no_quote_collapse) {
      settings.quote_collapse = false;
    }

    env.data.parse_options = settings;
  });


  // Parse user input to HTML
  //
  N.wire.on(apiPath, function* parse_text(env) {
    env.data.parse_result = yield N.parser.md2html({
      text: env.params.txt,
      attachments: env.params.attach,
      options: env.data.parse_options,
      user_info: env.user_info
    });
  });


  // Check post length
  //
  N.wire.after(apiPath, function* check_post_length(env) {
    let min_length = yield env.extras.settings.fetch('forum_post_min_length');

    if (env.data.parse_result.text_length < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_text_too_short', min_length)
      };
    }
  });


  // Limit an amount of images in the post
  //
  N.wire.after(apiPath, function* check_images_count(env) {
    let max_images = yield env.extras.settings.fetch('forum_post_max_images');

    if (max_images <= 0) return;

    let ast         = $.parse(env.data.parse_result.html);
    let images      = ast.find('.image').length;
    let attachments = ast.find('.attach').length;
    let tail        = env.data.parse_result.tail.length;

    if (images + attachments + tail > max_images) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_images', max_images)
      };
    }
  });


  // Limit an amount of emoticons in the post
  //
  N.wire.after(apiPath, function* check_emoji_count(env) {
    let max_emojis = yield env.extras.settings.fetch('forum_post_max_emojis');

    if (max_emojis < 0) return;

    if ($.parse(env.data.parse_result.html).find('.emoji').length > max_emojis) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_emojis', max_emojis)
      };
    }
  });


  // Create new topic
  //
  N.wire.after(apiPath, function* create_topic(env) {
    let topic = new N.models.forum.Topic();
    let post = new N.models.forum.Post();

    env.data.new_topic = topic;
    env.data.new_post  = post;

    // Fill post data
    post.user = env.user_info.user_id;
    post.ts = Date.now();
    post.attach = env.params.attach;
    post.tail = env.data.parse_result.tail;
    post.html = env.data.parse_result.html;
    post.md = env.params.txt;
    post.ip = env.req.ip;
    post.params = env.data.parse_options;
    post.imports = env.data.parse_result.imports;
    post.import_users = env.data.parse_result.import_users;

    if (env.user_info.hb) {
      post.st  = N.models.forum.Post.statuses.HB;
      post.ste = N.models.forum.Post.statuses.VISIBLE;
    } else {
      post.st  = N.models.forum.Post.statuses.VISIBLE;
    }

    // Fill topic data
    topic.title = env.params.title.trim();
    topic.section = env.data.section._id;

    if (env.user_info.hb) {
      topic.st  = N.models.forum.Topic.statuses.HB;
      topic.ste = N.models.forum.Topic.statuses.OPEN;
    } else {
      topic.st  = N.models.forum.Topic.statuses.OPEN;
    }

    topic.cache = {};

    topic.cache.post_count = 1;

    topic.cache.first_post = post._id;
    topic.cache.first_ts = post.ts;
    topic.cache.first_user = post.user;

    topic.cache.last_post = post._id;
    topic.cache.last_ts = post.ts;
    topic.cache.last_post_hid = 1;
    topic.cache.last_user = post.user;

    _.assign(topic.cache_hb, topic.cache);

    yield topic.save();

    post.topic = topic._id;
    post.section = topic.section;

    yield post.save();

    env.res.topic_hid = topic.hid;
    env.res.post_hid = post.hid;
  });


  // Schedule image size fetch
  //
  N.wire.after(apiPath, function* fill_image_info(env) {
    yield N.queue.forum_post_images_fetch(env.data.new_post._id).postpone();
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, function* add_search_index(env) {
    yield N.queue.forum_topics_search_update_with_posts([ env.data.new_topic._id ]).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, function* update_section(env) {
    yield N.models.forum.Section.updateCache(env.data.new_topic.section);
  });


  // Add new topic notification for subscribers
  //
  N.wire.after(apiPath, function* add_new_post_notification(env) {
    let subscriptions = yield N.models.users.Subscription.find()
      .where('to').equals(env.data.section._id)
      .where('type').equals(N.models.users.Subscription.types.WATCHING)
      .lean(true);

    if (!subscriptions.length) return;

    let subscribed_users = _.map(subscriptions, 'user');

    let ignore = _.keyBy(
      yield N.models.users.Ignore.find()
                .where('from').in(subscribed_users)
                .where('to').equals(env.user_info.user_id)
                .select('from to -_id')
                .lean(true),
      'from'
    );

    subscribed_users = subscribed_users.filter(user_id => !ignore[user_id]);

    if (!subscribed_users.length) return;

    yield N.wire.emit('internal:users.notify', {
      src: env.data.new_topic._id,
      to: subscribed_users,
      type: 'FORUM_NEW_TOPIC'
    });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, function* set_active_flag(env) {
    yield N.wire.emit('internal:users.mark_user_active', env);
  });
};
