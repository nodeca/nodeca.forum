'use strict';


var Mongoose = require('mongoose');
var Schema   = Mongoose.Schema;

// topic and post statuses
var statuses = require('../../server/forum/_lib/statuses.js');

module.exports = function (N, collectionName) {

  var Post = new Schema({
    topic          : Schema.ObjectId

    // Related post for replies
  , to              : Schema.ObjectId
  , user            : Schema.ObjectId
  , ts              : { type: Date, 'default': Date.now }    // timestamp
  , ip              : String  // ip address

  , html            : String  // displayed HTML
  , md              : String  // markdown source

  // State (normal, closed, soft-deleted, hard-deleted, hellbanned,...)
  // constants should be defined globally
  , st              : Number
  , ste             : Number  // real state, if topic is sticky or hellbanned
                              // (general `state` is used for fast selects)

  // All post attachments
  , attach_refs     : [ Schema.ObjectId ]  // all attachments

  // Attachments on tail of post
  , attach_tail     : [ {
      file_id: Schema.ObjectId,
      file_name: String,
      type: { type: String, enum: [ 'image', 'binary' ] }
    } ]
  },
  {
    versionKey : false
  });

  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  // Get posts ids range for page XX and get posts for page XX
  // !!! Use _id for sort order
  Post.index({
    topic: 1
  , st: 1
  , _id: 1
  });

  // Hide hellbanned info for regular users for security reasons.
  // This method works with raw object.
  //
  // options:
  //
  // - `keep_statuses` (boolean) - when true, don't merge `st` and `ste` into one. Default - false.
  Post.statics.sanitize = function sanitize(post, options) {
    options = options || {};

    // sanitize statuses
    if (post.st === statuses.post.HB) {
      if (!options.keep_statuses) {
        post.st = post.ste;
        delete post.ste;
      }
    }
  };

  N.wire.on('init:models', function emit_init_Post(__, callback) {
    N.wire.emit('init:models.' + collectionName, Post, callback);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Post(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
