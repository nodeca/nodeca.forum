// Update topic title
//

'use strict';


const sanitize_topic = require('nodeca.forum/lib/sanitizers/topic');
const check_title    = require('nodeca.users/lib/check_title');
const charcount      = require('charcount');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:        { type: 'integer', required: true },
    title:            { type: 'string', minLength: 1, required: true },
    as_moderator:     { type: 'boolean', required: true }
  });


  // Check title
  //
  //  - return an error if title is too short (< 10)
  //  - return an error if title is too long (> 100)
  //  - return an error if title has unicode emoji
  //  - normalize title
  //    - trim spaces on both ends
  //    - replace multiple ending punctuations with one (???, !!!)
  //    - convert title to lowercase if title has too many (5+ consecutive) uppercase letters
  //
  N.wire.before(apiPath, async function check_and_normalize_title(env) {
    let title = check_title.normalize_title(env.params.title);
    let min_length = await env.extras.settings.fetch('forum_topic_title_min_length');
    let max_length = await env.extras.settings.fetch('forum_topic_title_max_length');
    let title_length = charcount(title);
    let error = null;

    if (title_length < min_length)    error = env.t('err_title_too_short', min_length);
    if (title_length > max_length)    error = env.t('err_title_too_long', max_length);
    if (check_title.has_emoji(title)) error = env.t('err_title_emojis');

    if (error) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: error
      };
    }

    env.data.title = title;
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let statuses = N.models.forum.Topic.statuses;

    let topic = await N.models.forum.Topic
                          .findOne({ hid: env.params.topic_hid })
                          .lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    // Can edit titles only in opened topics
    if (topic.st !== statuses.OPEN && topic.ste !== statuses.OPEN) {
      throw N.io.NOT_FOUND;
    }

    env.data.topic = topic;
  });


  // Check section writeble
  //
  N.wire.before(apiPath, async function check_section_writeble(env) {
    let section = await N.models.forum.Section.findOne({ _id: env.data.topic.section }).lean(true);

    if (!section) throw N.io.NOT_FOUND;

    // Can not modify topic in read only section. Should never happens - restricted on client
    if (!section.is_writable && !env.params.as_moderator) throw N.io.BAD_REQUEST;

    env.data.section = section;
  });


  // Check if user can view this topic
  //
  N.wire.before(apiPath, async function check_access(env) {
    var access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    env.extras.settings.params.section_id = env.data.topic.section;

    let forum_mod_can_edit_titles = await env.extras.settings.fetch('forum_mod_can_edit_titles');

    // Permit as moderator
    if (forum_mod_can_edit_titles && env.params.as_moderator) return;

    // Check is user topic owner
    if (env.user_info.user_id !== String(env.data.topic.cache.first_user)) {
      throw N.io.FORBIDDEN;
    }

    let forum_edit_max_time = await env.extras.settings.fetch('forum_edit_max_time');

    // Check, that topic created not more than 30 minutes ago
    if (forum_edit_max_time !== 0 && env.data.topic.cache.first_ts < Date.now() - forum_edit_max_time * 60 * 1000) {
      throw N.io.FORBIDDEN;
    }
  });


  // Update topic title
  //
  N.wire.on(apiPath, async function update_topic(env) {
    env.data.new_topic = await N.models.forum.Topic.findOneAndUpdate(
      { _id: env.data.topic._id },
      { title: env.data.title },
      { new: true }
    );
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.forum.TopicHistory.add(
      {
        old_topic: env.data.topic,
        new_topic: env.data.new_topic
      },
      {
        user: env.user_info.user_id,
        role: N.models.forum.TopicHistory.roles[env.params.as_moderator ? 'MODERATOR' : 'USER'],
        ip:   env.req.ip
      }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.forum_topics_search_update_by_ids([ env.data.topic._id ]).postpone();
  });


  // Return changed topic info
  //
  N.wire.after(apiPath, async function return_topic(env) {
    let topic = await N.models.forum.Topic.findById(env.data.topic._id).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.res.topic = await sanitize_topic(N, topic, env.user_info);
  });
};
