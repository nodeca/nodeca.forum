"use strict";

/*global nodeca, _*/
var NLib = require('nlib');

var Async = NLib.Vendor.Async;

module.exports = function (schema, options) {
  schema.statics.fetchPosts = function(env, options, callback) {
    var posts = env.response.data.posts = [];
    var users = env.data.users = env.data.users ? env.data.users : [];
    // ToDo get state conditions from env
    this.find(options, function(err, docs){
      if (err) {
        callback(err);
        return;
      }
      Async.forEach(docs, function(doc, next) {
        doc = doc.toObject();
        var post = {
          _id:              doc._id.toString(),
          id:               doc.id,
          attach_list:      doc.attach_list,
          text:             doc.text,
          fmt:              doc.fmt,
          html:             doc.html,
          user:             doc.user,
          ts:               doc.ts
        };
        users.push(post.user);
        posts.push(post);
        next();
      }, callback);
    });
  };
};
