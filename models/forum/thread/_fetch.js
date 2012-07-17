"use strict";

/*global nodeca, _*/

module.exports = function (schema, options) {
  schema.statics.fetchThreads = function(env, query, callback) {
    env.response.data.threads = [];
    if (!_.isArray(env.data.users)) {
      env.data.users = [];
    }

    var fields = [
      '_id', 'id', 'title', 'prefix', 'forum_id'
    ];
    // ToDo real vs hb
    fields.push('cache.real');

    // ToDo get state conditions from env
    this.find(query).select(fields.join(' ')).setOptions({lean: true }).exec(function(err, docs){
      if (err) {
        callback(err);
        return;
      }
      env.response.data.threads = docs.map(function(doc) {
        env.data.users.push(doc.cache.real.first_user);
        env.data.users.push(doc.cache.real.last_user);
        return doc;
      });
      callback();
    });
  };
};
