// When user removes a bookmark from bookmark list, we need to
// update bookmark counters for the corresponding post
//

'use strict';


module.exports = function (N) {

  N.wire.after('server:users.bookmarks.destroy', async function update_bookmark_counters(env) {
    if (!env.data.bookmark) return;
    if (env.data.bookmark.src_type !== N.shared.content_type.FORUM_POST) return;

    let count = await N.models.users.Bookmark.countDocuments({ src: env.params.post_id });

    await N.models.forum.Post.updateOne({ _id: env.data.bookmark.src }, { bookmarks: count });
  });
};
