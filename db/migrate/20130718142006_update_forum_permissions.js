// Compute initial raw settings for `forum_usergroup` store on all sections.


'use strict';


var updateForumPermissions = require('nodeca.forum/server/admin/forum/section_permissions/_lib/update_forum_permissions');


module.exports.up = function (N, callback) {
  updateForumPermissions(N, callback);
};
