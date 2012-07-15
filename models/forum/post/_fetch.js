"use strict";

/*global nodeca, _*/
var NLib = require('nlib');

var Async = NLib.Vendor.Async;

module.exports = function (schema, options) {
  schema.statics.fetchPosts = function(env, options, callback) {
    env.response.data.posts = [];
    var users = [];
    // ToDo get state conditions from env
    var fields = [
      '_id', 'id', 'attach_list', 'text', 'fmt', 'html', 'user', 'ts'
    ];
    this.find(options, fields, function(err, docs){
      if (err) {
        callback(err);
        return;
      }
      env.response.data.posts = docs.map(function(doc) {
        users.push(doc.user);
        return doc.toObject({ getters: true });
      });

      env.data.users = env.data.users ? env.data.users.concat(users) : users;
      callback();
    });
  };
};
