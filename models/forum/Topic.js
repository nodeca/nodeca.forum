'use strict';


var Mongoose = require('mongoose');
var Schema = Mongoose.Schema;


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, collectionName) {

  var cache = {

    real: {
      post_count      : { type: Number, 'default': 0 }
    , attach_count    : { type: Number, 'default': 0 }

      // First post
    , first_post      : Schema.ObjectId
    , first_user      : Schema.ObjectId
    , first_ts        : Date
      // Last post
    , last_post       : Schema.ObjectId
    , last_user       : Schema.ObjectId
    , last_ts         : Date
    }

  , hb: {
      post_count      : { type: Number, 'default': 0 }
    , attach_count    : { type: Number, 'default': 0 }

      // First post
    , first_post      : Schema.ObjectId
    , first_user      : Schema.ObjectId
    , first_ts        : Date
      // Last post
    , last_post       : Schema.ObjectId
    , last_user       : Schema.ObjectId
    , last_ts         : Date
    }
  };


  var Topic = new Schema({
    title           : { type: String, required: true }
    // user-friendly id (autoincremented)
  , hid             : { type: Number, required: true, min: 1, index: true }

    // prefix id/cache
  , prefix          : Schema.ObjectId

  , section           : Schema.ObjectId

    // State (normal, closed, soft-deleted, hard-deleted, hellbanned,...)
    // constants should be defined globally
  , st              : { type: Number, required: true }
  , ste             : Number  // real state, if topic is sticky or hellbanned
                              // (general `state` is used for fast selects)

    // Tags
  , tags_id_list    : [Number]

    // "Similar" topics cache
  , similar         : [Schema.ObjectId]

    // Cache
  , cache           : cache


  , tags            : [String]
  , views_count     : { type: Number, 'default': 0 }
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  // Main one, used for topics list
  Topic.index({
    section: 1
  , state: 1
  , prefix: 1     // remove, if no prefixes needed
  , _id: -1
  });

  // Get user topics, with restriction by status & sections list
  Topic.index({
    first_user: 1
  , state: 1
  , section: 1
  , _id: -1
  });


  N.wire.on("init:models", function emit_init_Topic(__, callback) {
    N.wire.emit("init:models." + collectionName, Topic, callback);
  });

  N.wire.on("init:models." + collectionName, function init_model_Topic(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
