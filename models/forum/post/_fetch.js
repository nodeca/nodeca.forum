"use strict";

/*global nodeca, _*/

module.exports = function (schema, options) {
  schema.statics.fetchPosts = function(env, query, callback) {
    env.response.data.posts = [];
    if (!_.isArray(env.data.users)) {
      env.data.users = [];
    }
    // ToDo get state conditions from env
    var fields = [
      '_id', 'id', 'attach_list', 'text', 'fmt', 'html', 'user', 'ts'
    ];
    this.find(query).select(fields.join(' ')).setOptions({lean: true }).exec(function(err, docs){
      if (err) {
        callback(err);
      }
      env.response.data.posts = docs.map(function(doc) {
        env.data.users.push(doc.user);
        return doc;
      });

      callback();
    });
  };
};
