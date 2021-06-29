// Get a post from the database, rebuild it and write it back to the database
//
'use strict';


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function rebuild_post(ids) {
    if (!Array.isArray(ids)) ids = [ ids ];

    let posts = await N.models.forum.Post.find()
                          .where('_id').in(ids)
                          .lean(true);

    let bulk = N.models.forum.Post.collection.initializeUnorderedBulkOp();

    await Promise.all(posts.map(async post => {
      let params = await N.models.core.MessageParams.getParams(post.params_ref);
      let result = await N.parser.md2html({
        text:         post.md,
        options:      params,
        imports:      post.imports,
        import_users: post.import_users
      });

      let updateData = {
        $set: {
          html: result.html
        }
      };

      let needsUpdate = result.html !== post.html;

      for (let field of [ 'imports', 'import_users' ]) {
        if (result[field]?.length) {
          updateData.$set[field] = result[field];
          needsUpdate = needsUpdate || JSON.stringify(result[field]) !== JSON.stringify(post[field]);
        } else {
          updateData.$unset = updateData.$unset || {};
          updateData.$unset[field] = true;
          needsUpdate = needsUpdate || typeof post[field] !== 'undefined';
        }
      }

      if (needsUpdate) {
        bulk.find({ _id: post._id }).update(updateData);
      }
    }));

    if (bulk.length > 0) await bulk.execute();
  });
};
