"use strict";

/*global nodeca, _*/
var NLib = require('nlib');

var Async = NLib.Vendor.Async;

module.exports = function (schema, options) {
  schema.statics.fetchThreads = function(env, options, callback) {
    var result = env.response.data.threads = [];
    var users = env.data.users = env.data.users ? env.data.users : [];
    // ToDo get state conditions from env
    this.find(options, function(err, docs){
      if (err) {
        callback(err);
        return;
      }
      Async.forEach(docs, function(doc, next) {
        doc = doc.toObject();
        var thread = {
          _id:              doc._id.toString(),
          id:               doc.id,
          title:            doc.title,
          prefix:           doc.prefix,
          forum_id:         doc.forum_id,
          post_count:       doc.cache.real.post_count,
          views_count:      doc.cache.real.views_count,

          first_post: {
            id:             doc.cache.real.first_post_id,
            user:           doc.cache.real.first_user.toString(),
            ts:             doc.cache.real.first_ts
          },
          last_post: {
            id:             doc.cache.real.last_post_id,
            user:           doc.cache.real.last_user.toString(),
            ts:             doc.cache.real.last_ts
          }

        };
        users.push(thread.first_post.user);
        users.push(thread.last_post.user);
        result.push(thread);
        next();
      }, callback);
    });
  };
};
