"use strict";

/*global nodeca, _*/

module.exports = function (schema, options) {
  schema.statics.fetchPosts = function(env, options, callback) {
    env.response.data.posts = [];
    if (!_.isObject(env.data.users)) {
      env.data.users = {};
    }
    // ToDo get state conditions from env
    var fields = [
      '_id', 'id', 'attach_list', 'text', 'fmt', 'html', 'user', 'ts'
    ];
    this.find(options, fields, function(err, docs){
      if (err) {
        callback(err);
      }
      env.response.data.posts = docs.map(function(doc) {
        env.data.users[doc.user.toString()] = true;
        return doc.toObject();
      });

      callback();
    });
  };
};
