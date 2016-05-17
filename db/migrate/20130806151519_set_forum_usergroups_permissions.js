'use strict';


const co = require('bluebird-co').co;


module.exports.up = co.wrap(function* (N) {
  let usergroupStore = N.settings.getStore('usergroup');

  // add usergroup settings for admin

  let adminGroup = yield N.models.users.UserGroup.findOne({ short_name: 'administrators' });

  yield usergroupStore.set({
    forum_can_reply: { value: true },
    forum_can_start_topics: { value: true },
    forum_can_close_topic: { value: true },
    forum_mod_can_pin_topic: { value: true },
    forum_mod_can_edit_posts: { value: true },
    forum_mod_can_delete_topics: { value: true },
    forum_mod_can_edit_titles: { value: true },
    forum_mod_can_close_topic: { value: true },
    forum_mod_can_hard_delete_topics: { value: true },
    forum_mod_can_see_hard_deleted_topics: { value: true },
    forum_mod_can_add_infractions: { value: true }
  }, { usergroup_id: adminGroup._id });

  // add usergroup settings for member

  let memberGroup = yield N.models.users.UserGroup.findOne({ short_name: 'members' });

  yield usergroupStore.set({
    forum_can_reply: { value: true },
    forum_can_start_topics: { value: true }
  }, { usergroup_id: memberGroup._id });

  // add usergroup settings for violators
  //
  // note: it is a modifier group added to users in addition to their
  //       existing usergroups, thus we should turn "force" flag on

  let violatorsGroup = yield N.models.users.UserGroup.findOne({ short_name: 'violators' });

  yield usergroupStore.set({
    forum_can_reply: { value: false, force: true },
    forum_can_start_topics: { value: false, force: true },
    forum_edit_max_time: { value: 0, force: true },
    forum_can_close_topic: { value: false, force: true }
  }, { usergroup_id: violatorsGroup._id });

  // add usergroup settings for banned

  let bannedGroup = yield N.models.users.UserGroup.findOne({ short_name: 'banned' });

  yield usergroupStore.set({
    forum_edit_max_time: { value: 0 }
  }, { usergroup_id: bannedGroup._id });
});
