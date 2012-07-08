"use strict";

/*global nodeca, _*/
var NLib = require('nlib');

var Async = NLib.Vendor.Async;

module.exports = function (schema, options) {
  schema.statics.fetchPosts = function(options, iterator, callback) {
    if (!_.isFunction(iterator)) {
      iterator = function(doc, cb) {cb();};
    }
    var result = [];
    // ToDo get state conditions from env
    this.find(options, function(err, docs){
      if (err) {
        callback(err);
        return;
      }
      Async.forEach(docs, function(doc, next) {
        doc = doc._doc;
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
        result.push(post);
        iterator(post, next);
      }, function() {
        callback(err, result);
      });
    });
  };
};
