// Save new reply
//
'use strict';


const _ = require('lodash');
const $ = require('nodeca.core/lib/parser/cheequery');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:                { type: 'integer', required: true },
    parent_post_id:           { format: 'mongo' },
    txt:                      { type: 'string', required: true },
    option_no_mlinks:         { type: 'boolean', required: true },
    option_no_emojis:         { type: 'boolean', required: true },
    option_no_quote_collapse: { type: 'boolean', required: true }
  });


  // Check user permission
  //
  N.wire.before(apiPath, function check_permissions(env) {
    if (!env.user_info.is_member) throw N.io.NOT_FOUND;
  });


  // Fetch topic info
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let topic = await N.models.forum.Topic.findOne({ hid: env.params.topic_hid }).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Fetch section info
  //
  N.wire.before(apiPath, async function fetch_section_info(env) {
    let section = await N.models.forum.Section.findById(env.data.topic.section)
                            .lean(true);

    if (!section) throw N.io.NOT_FOUND;
    if (!section.is_enabled) throw N.io.NOT_FOUND;

    env.data.section = section;

    // Can not create post in read only section. Should never happens - restricted on client
    if (!section.is_writable) throw N.io.BAD_REQUEST;
  });


  // Check permission to reply in this section
  //
  N.wire.before(apiPath, async function check_can_reply(env) {
    env.extras.settings.params.section_id = env.data.section._id;

    let forum_can_reply = await env.extras.settings.fetch('forum_can_reply');

    if (!forum_can_reply) throw N.io.NOT_FOUND;
  });


  // Check if user can see this topic
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Fetch parent post
  //
  N.wire.before(apiPath, async function fetch_parent_post(env) {
    if (!env.params.parent_post_id) return;

    let post = await N.models.forum.Post.findOne({ _id: env.params.parent_post_id }).lean(true);

    if (!post) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('error_invalid_parent_post')
      };
    }

    env.data.post = post;

    let access_env = { params: {
      posts: env.data.post,
      user_info: env.user_info,
      preload: [ env.data.topic ]
    } };

    await N.wire.emit('internal:forum.access.post', access_env);

    if (!access_env.data.access_read) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('error_invalid_parent_post')
      };
    }
  });


  // Prepare parse options
  //
  N.wire.before(apiPath, async function prepare_options(env) {
    let settings = await N.settings.getByCategory(
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
  N.wire.on(apiPath, async function parse_text(env) {
    env.data.parse_result = await N.parser.md2html({
      text: env.params.txt,
      options: env.data.parse_options,
      user_info: env.user_info
    });
  });


  // Check post length
  //
  N.wire.after(apiPath, async function check_post_length(env) {
    let min_length = await env.extras.settings.fetch('forum_post_min_length');

    if (env.data.parse_result.text_length < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_text_too_short', min_length)
      };
    }
  });


  // Limit an amount of images in the post
  //
  N.wire.after(apiPath, async function check_images_count(env) {
    let max_images = await env.extras.settings.fetch('forum_post_max_images');

    if (max_images <= 0) return;

    let ast         = $.parse(env.data.parse_result.html);
    let images      = ast.find('.image').length;
    let attachments = ast.find('.attach').length;

    if (images + attachments > max_images) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_images', max_images)
      };
    }
  });


  // Limit an amount of emoticons in the post
  //
  N.wire.after(apiPath, async function check_emoji_count(env) {
    let max_emojis = await env.extras.settings.fetch('forum_post_max_emojis');

    if (max_emojis < 0) return;

    if ($.parse(env.data.parse_result.html).find('.emoji').length > max_emojis) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_emojis', max_emojis)
      };
    }
  });


  // Save new post
  //
  N.wire.after(apiPath, async function save_new_post(env) {
    let statuses = N.models.forum.Post.statuses;
    let post = new N.models.forum.Post();

    post.imports = env.data.parse_result.imports;
    post.import_users = env.data.parse_result.import_users;
    post.html = env.data.parse_result.html;
    post.md = env.params.txt;
    post.ip = env.req.ip;
    post.params = env.data.parse_options;

    if (env.user_info.hb) {
      post.st  = statuses.HB;
      post.ste = statuses.VISIBLE;
    } else {
      post.st  = statuses.VISIBLE;
    }

    if (env.data.post) {
      post.to = env.data.post._id;
      post.to_user = env.data.post.user;
      post.to_phid = env.data.post.hid;
    }

    post.topic   = env.data.topic._id;
    post.section = env.data.topic.section;
    post.user    = env.user_info.user_id;

    await post.save();

    env.data.new_post = post;
  });


  // Schedule image size fetch
  //
  N.wire.after(apiPath, async function fill_image_info(env) {
    await N.queue.forum_post_images_fetch(env.data.new_post._id).postpone();
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.forum_topics_search_update_by_ids([ env.data.topic._id ]).postpone();
    await N.queue.forum_posts_search_update_by_ids([ env.data.new_post._id ]).postpone();
  });


  // Update topic counters
  //
  N.wire.after(apiPath, async function update_topic(env) {
    await N.models.forum.Topic.updateCache(env.data.topic._id);
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    await N.models.forum.Section.updateCache(env.data.topic.section);
  });


  // Update user counters
  //
  N.wire.after(apiPath, async function update_user(env) {
    await N.models.forum.UserPostCount.inc(env.user_info.user_id, {
      section_id: env.data.topic.section,
      is_hb: env.user_info.hb
    });
  });


  // Set marker position
  //
  N.wire.after(apiPath, async function set_marker_pos(env) {
    // TODO: set max position only if added post just after last read
    await N.models.users.Marker.setPos(
      env.user_info.user_id,
      env.data.topic._id,
      env.data.new_post.hid,
      env.data.new_post.hid,
      env.data.topic.section,
      'forum_topic'
    );
  });


  // Fill url of new post
  //
  N.wire.after(apiPath, function process_response(env) {
    env.res.redirect_url = N.router.linkTo('forum.topic', {
      section_hid: env.data.section.hid,
      topic_hid: env.data.topic.hid,
      post_hid: env.data.new_post.hid
    });
  });


  // Add reply notification for parent post owner
  //
  N.wire.after(apiPath, async function add_reply_notification(env) {
    if (!env.data.new_post.to) return;

    let ignore_data = await N.models.users.Ignore.findOne()
                               .where('from').equals(env.data.new_post.to_user)
                               .where('to').equals(env.user_info.user_id)
                               .select('from to -_id')
                               .lean(true);

    if (ignore_data) return;

    await N.wire.emit('internal:users.notify', {
      src: env.data.new_post._id,
      to: env.data.new_post.to_user,
      type: 'FORUM_REPLY'
    });
  });


  // Add new post notification for subscribers
  //
  N.wire.after(apiPath, async function add_new_post_notification(env) {
    let subscriptions = await N.models.users.Subscription.find()
      .where('to').equals(env.data.topic._id)
      .where('type').equals(N.models.users.Subscription.types.WATCHING)
      .lean(true);

    if (!subscriptions.length) return;

    let subscribed_users = subscriptions.map(s => s.user);

    let ignore = _.keyBy(
      await N.models.users.Ignore.find()
                .where('from').in(subscribed_users)
                .where('to').equals(env.user_info.user_id)
                .select('from to -_id')
                .lean(true),
      'from'
    );

    subscribed_users = subscribed_users.filter(user_id => !ignore[user_id]);

    if (!subscribed_users.length) return;

    await N.wire.emit('internal:users.notify', {
      src: env.data.new_post._id,
      to: subscribed_users,
      type: 'FORUM_NEW_POST'
    });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    await N.wire.emit('internal:users.mark_user_active', env);
  });
};
