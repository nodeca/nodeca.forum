"use strict";

/*global nodeca, _*/

module.exports = function (schema, options) {
  schema.statics.fetchThreads = function(env, options, callback) {
    env.response.data.threads = [];
    if (!_.isObject(env.data.users)) {
      env.data.users = {};
    }

    var fields = [
      '_id', 'id', 'title', 'prefix', 'forum_id'
    ];
    // ToDo real vs hb
    fields.push('cache.real');

    // ToDo get state conditions from env
    this.find(options, fields, function(err, docs){
      if (err) {
        callback(err);
        return;
      }
      env.response.data.threads = docs.map(function(doc) {
        env.data.users[doc.cache.real.first_user.toString()] = true;
        env.data.users[doc.cache.real.last_user.toString()] = true;
        return doc.toObject();
      });
      callback();
    });
  };
};
