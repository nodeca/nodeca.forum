'use strict';


const co = require('bluebird-co').co;


module.exports.up = co.wrap(function* (N) {
  let usergroupStore = N.settings.getStore('usergroup');

  // add usergroup settings for admin

  let adminGroupId = yield N.models.users.UserGroup.findIdByName('administrators');

  yield usergroupStore.set({
    forum_can_reply: { value: true },
    forum_can_start_topics: { value: true },
    forum_can_close_topic: { value: true },
    forum_show_ignored: { value: true },
    forum_mod_can_pin_topic: { value: true },
    forum_mod_can_edit_posts: { value: true },
    forum_mod_can_delete_topics: { value: true },
    forum_mod_can_edit_titles: { value: true },
    forum_mod_can_close_topic: { value: true },
    forum_mod_can_hard_delete_topics: { value: true },
    forum_mod_can_see_hard_deleted_topics: { value: true },
    forum_mod_can_add_infractions: { value: true }
  }, { usergroup_id: adminGroupId });

  // add usergroup settings for member

  let memberGroupId = yield N.models.users.UserGroup.findIdByName('members');

  yield usergroupStore.set({
    forum_can_reply: { value: true },
    forum_can_start_topics: { value: true }
  }, { usergroup_id: memberGroupId });

  // add usergroup settings for violators
  //
  // note: it is a modifier group added to users in addition to their
  //       existing usergroups, thus we should turn "force" flag on

  let violatorsGroupId = yield N.models.users.UserGroup.findIdByName('violators');

  yield usergroupStore.set({
    forum_can_reply: { value: false, force: true },
    forum_can_start_topics: { value: false, force: true },
    forum_edit_max_time: { value: 0, force: true },
    forum_can_close_topic: { value: false, force: true }
  }, { usergroup_id: violatorsGroupId });

  // add usergroup settings for banned

  let bannedGroupId = yield N.models.users.UserGroup.findIdByName('banned');

  yield usergroupStore.set({
    forum_edit_max_time: { value: 0 }
  }, { usergroup_id: bannedGroupId });
});
