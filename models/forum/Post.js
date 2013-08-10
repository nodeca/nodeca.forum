'use strict';


var Mongoose = require('mongoose');
var Schema   = Mongoose.Schema;


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
  });

  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  // Get posts with restriction by status & pagination
  // !!! Use _id instead of ts
  Post.index({
    topic: 1
  , state: 1
  , _id: 1
  });

  // Get user posts, with restriction by status & sections list
  Post.index({
    user: 1
  , state: 1
  , section: 1
  , _id: -1
  });


  N.wire.on("init:models", function emit_init_Post(__, callback) {
    N.wire.emit("init:models." + collectionName, Post, callback);
  });

  N.wire.on("init:models." + collectionName, function init_model_Post(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
