// Close/open topic
//

'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:    { type: 'integer', required: true },
    reopen:       { type: 'boolean', required: true },
    as_moderator: { type: 'boolean', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    env.data.topic = await N.models.forum.Topic
                              .findOne({ hid: env.params.topic_hid })
                              .lean(true);

    if (!env.data.topic) throw N.io.NOT_FOUND;
  });


  // Check if user has an access to this topic
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

    let settings = await env.extras.settings.fetch([ 'forum_can_close_topic', 'forum_mod_can_close_topic' ]);

    // Permit open/close as moderator
    if (settings.forum_mod_can_close_topic && env.params.as_moderator) {
      return;
    }

    // Check topic owner and `forum_can_close_topic` permission
    if ((env.user_info.user_id !== String(env.data.topic.cache.first_user)) || !settings.forum_can_close_topic) {
      throw N.io.FORBIDDEN;
    }
  });


  // Update topic status
  //
  N.wire.on(apiPath, async function update_topic(env) {
    let statuses = N.models.forum.Topic.statuses;
    let topic = env.data.topic;
    let update;
    let newStatus = env.params.reopen ? statuses.OPEN : statuses.CLOSED;

    if (topic.st === statuses.PINNED || topic.st === statuses.HB) {
      update = { ste: newStatus };
    } else {
      update = { st: newStatus };
    }

    let res = { st: update.st || topic.st, ste: update.ste || topic.ste };

    // Show `ste` instead `st` for hellbanned users in hellbanned topic
    if (env.user_info.hb && res.st === statuses.HB && !env.data.can_see_hellbanned) {
      res.st = res.ste;
      delete res.ste;
    }

    env.res.topic = res;

    env.data.new_topic = await N.models.forum.Topic.findOneAndUpdate(
      { _id: topic._id },
      update,
      { 'new': true }
    );
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.forum.PostHistory.add(
      {
        old_topic: env.data.topic,
        new_topic: env.data.new_topic
      },
      {
        user: env.user_info.user_id,
        role: N.models.forum.PostHistory.roles[env.params.as_moderator ? 'MODERATOR' : 'USER'],
        ip:   env.req.ip
      }
    );
  });
};
