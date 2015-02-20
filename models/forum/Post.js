'use strict';


var Mongoose = require('mongoose');
var Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  var statuses = {
    VISIBLE:      1,
    HB:           2, // hellbanned
    PENDING:      3,
    DELETED:      4,
    DELETED_HARD: 5
  };


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

  // Aggregated votes count
  , votes           : { type: Number, default: 0 }

  // Bookmarks count
  , bookmarks       : { type: Number, default: 0 }

  , del_reason      : String
  , del_by          : Schema.ObjectId
  // Previous state for deleted posts
  , prev_st         : {
      st: Number,
      ste: Number
    }

  , attach     : [ Schema.ObjectId ]  // all attachments

  // Post params
  , params          : [ Schema.Types.Mixed ]

  // Info to build post tail
  , tail     : [ new Schema({ // explicit definition to remove `_id` field
      media_id: Schema.ObjectId,
      file_name: String,
      type: { type: Number }
    }, { _id: false }) ]
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


  // Export statuses
  //
  Post.statics.statuses = statuses;

  // Hide hellbanned info for regular users for security reasons.
  // This method works with raw object.
  //
  // options:
  //
  // - `keep_statuses` (boolean) - when true, don't merge `st` and `ste` into one. Default - false.
  Post.statics.sanitize = function sanitize(post, options) {
    options = options || {};

    // sanitize statuses
    if (post.st === statuses.HB) {
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
