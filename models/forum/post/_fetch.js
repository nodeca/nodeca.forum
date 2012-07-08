"use strict";

/*global nodeca, _*/
var NLib = require('nlib');

var Async = NLib.Vendor.Async;

module.exports = function (schema, options) {
  schema.statics.fetchPosts = function(options, iterator, callback) {
    if (!_.isFunction(iterator)) {
      iterator = function(doc, cb) {cb()};
    }
    var result = [];
    // ToDo get state conditions from env
    this.find(options, function(err, docs){
      if (err) {
        callback(err);
        return;
      }
      Async.forEach(docs, function(doc, next) {
        var post = doc._doc;
        post._id = post._id.toString();
      
        result.push({
          _id:              post._id,
          id:               post.id,
          attach_list:      post.attach_list,
          text:             post.text,
          fmt:              post.fmt,
          html:             post.html,
          user:             post.user,
          ts:               post.ts
        });
        iterator(doc, next);
      }, function() {
        callback(err, result);
      });
    });
  };
};
