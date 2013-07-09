'use strict';


var Mongoose = require('mongoose');
var Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  var Post = new Schema({
    // user-friendly id (autoincremented)
    id              : { type: Number, required: true, min: 1, index: true }

  , thread          : Schema.ObjectId
  , thread_id       : Number
  , forum           : Schema.ObjectId
  , forum_id        : Number

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
  , state           : { type: Number, required: true }
  , state_ext       : Number  // real state, if thread is sticky
                              // (general `state` is used for fast selects)
  , state_prev      : Number  // previous value, to rollback `delete`

  , attach_list     : [Schema.ObjectId]
  });

  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  // Get posts with restriction by status & pagination
  // !!! Use _id instead of ts
  Post.index({
    thread: 1
  , state: 1
  , _id: 1
  });

  // Get user posts, with restriction by status & forums list
  Post.index({
    user: 1
  , state: 1
  , forum: 1
  , _id: -1
  });


  N.wire.on("init:models", function emit_init_Post(__, callback) {
    N.wire.emit("init:models." + collectionName, Post, callback);
  });

  N.wire.on("init:models." + collectionName, function init_model_Post(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
