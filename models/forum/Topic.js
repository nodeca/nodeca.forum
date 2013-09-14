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
  , hid             : { type: Number, min: 1, index: true }

  , section           : Schema.ObjectId

    // State (normal, closed, soft-deleted, hard-deleted, hellbanned,...)
    // constants should be defined globally
  , st              : { type: Number, required: true }
  , ste             : Number  // real state, if topic is sticky or hellbanned
                              // (general `state` is used for fast selects
    // Cache
  , cache           : cache

  , views_count     : { type: Number, 'default': 0 }
  },
  {
    versionKey : false
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  // topics list, ordered by last post (normal/hellbanned)
  //
  // FIXME:
  // see http://blog.mongolab.com/2012/06/cardinal-ins/ for field order details
  // revisit after 2.6.0 https://jira.mongodb.org/browse/SERVER-3310
  //
  Topic.index({
    section:  1
  , 'cache.real.last_ts' : -1
  , st:       1
  , _id:      1
  });

  Topic.index({
    section:  1
  , 'cache.real.last_ts' : -1
  , st:       1
  , _id:      1
  });

  // Pinned topics fetch (good cardinality, don't add timestamp to index)
  Topic.index({
    section:  1
  , st:       1
  });


  ////////////////////////////////////////////////////////////////////////////////

  // Set 'hid' for the new topic.
  // This hook should always be the last one to avoid counter increment on error
  Topic.pre('save', function (callback) {
    if (!this.isNew) {
      callback();
      return;
    }

    var self = this;
    N.models.core.Increment.next('topic', function(err, value) {
      if (err) {
        callback(err);
        return;
      }

      self.hid = value;
      callback();
    });
  });

  N.wire.on("init:models", function emit_init_Topic(__, callback) {
    N.wire.emit("init:models." + collectionName, Topic, callback);
  });

  N.wire.on("init:models." + collectionName, function init_model_Topic(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
