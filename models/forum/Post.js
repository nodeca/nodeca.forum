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
  , ts              : { type: Date, required: true, 'default': function(){ return new Date(); } }    // timestamp

  , ip              : String  // ip address

  , text            : { type: String, required: true }

  // Text format. Possible values:
  //  `md`  - markdown
  //  `vb`  - vBulletin bbcode
  //  `txt` - clear text, with line breaks
  //  `ts`  - textile
  , fmt             : String
  , html            : String  // Optional, rendered text, if needed
                              // (some formats are rendered on the fly)

  // State (normal, closed, soft-deleted, hard-deleted, hellbanned,...)
  // constants should be defined globally
  , st              : { type: Number, required: true }
  , ste             : Number  // real state, if topic is sticky or hellbanned
                              // (general `state` is used for fast selects)

  , attach_list     : [Schema.ObjectId]
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
