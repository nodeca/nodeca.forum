// Get a post from the database, rebuild it and write it back to the database
//

'use strict';


var _ = require('lodash');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, function rebuild_post(post_id, callback) {

    N.models.forum.Post.findById(post_id).exec(function (err, post) {
      if (err) {
        callback(err);
        return;
      }

      if (!post) {
        callback();
        return;
      }

      N.models.core.MessageParams.getParams(post.params_ref, function (err, params) {
        if (err) {
          callback(err);
          return;
        }

        N.parse({
          text:         post.md,
          attachments:  post.attach,
          options:      params,
          imports:      post.imports,
          import_users: post.import_users,
          image_info:   post.image_info
        }, function (err, result) {

          if (err) {
            callback(err);
            return;
          }

          var updateData = {
            tail:    result.tail,
            html:    result.html
          };

          [ 'imports', 'import_users', 'image_info' ].forEach(function (field) {
            if (!_.isEmpty(result[field])) {
              updateData[field] = result[field];
            } else {
              updateData.$unset = updateData.$unset || {};
              updateData.$unset[field] = true;
            }
          });

          N.models.forum.Post.update({ _id: post._id }, updateData, callback);
        });
      });
    });
  });
};
