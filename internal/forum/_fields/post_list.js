'use strict';

module.exports = {

  post: [
    '_id',
    'hid',
    'to',
    'to_user',
    'tail',
    'html',
    'user',
    'ts',
    'st',
    'ste',
    'del_reason',
    'del_by',
    'votes',
    'votes_hb',
    'bookmarks'
  ],

  section: [
    'hid'
  ],

  topic: [
    '_id',
    'hid',
    'last_post_hid',
    'cache',
    'cache_hb',
    'st',
    'ste',
    'title',
    'del_reason',
    'del_by'
  ],

  settings: [
    'can_see_ip',
    'can_see_hellbanned',
    'forum_can_view',
    'forum_topic_title_min_length',
    'forum_can_reply',
    'forum_edit_max_time',
    'forum_can_close_topic',
    'forum_mod_can_delete_topics',
    'forum_mod_can_hard_delete_topics',
    'forum_mod_can_see_hard_deleted_topics',
    'forum_mod_can_edit_posts',
    'forum_mod_can_pin_topic',
    'forum_mod_can_edit_titles',
    'forum_mod_can_close_topic',
    'can_vote',
    'votes_add_max_time'
  ]
};
