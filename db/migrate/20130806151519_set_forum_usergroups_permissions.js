'use strict';


module.exports.up = async function (N) {
  let usergroupStore = N.settings.getStore('usergroup');

  // add usergroup settings for admin

  let adminGroupId = await N.models.users.UserGroup.findIdByName('administrators');

  await usergroupStore.set({
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

  let memberGroupId = await N.models.users.UserGroup.findIdByName('members');

  await usergroupStore.set({
    forum_can_reply: { value: true },
    forum_can_start_topics: { value: true }
  }, { usergroup_id: memberGroupId });

  // add usergroup settings for violators
  //
  // note: it is a modifier group added to users in addition to their
  //       existing usergroups, thus we should turn "force" flag on

  let violatorsGroupId = await N.models.users.UserGroup.findIdByName('violators');

  await usergroupStore.set({
    forum_can_reply: { value: false, force: true },
    forum_can_start_topics: { value: false, force: true },
    forum_edit_max_time: { value: 0, force: true },
    forum_can_close_topic: { value: false, force: true }
  }, { usergroup_id: violatorsGroupId });

  // add usergroup settings for banned

  let bannedGroupId = await N.models.users.UserGroup.findIdByName('banned');

  await usergroupStore.set({
    forum_edit_max_time: { value: 0 }
  }, { usergroup_id: bannedGroupId });
};
