"use strict";

/*global nodeca*/

var mongoose = nodeca.runtime.mongoose;
var Schema = mongoose.Schema;

var cache = {
    real    : {
        prefix_text     : String
      , prefix_style    : String

      , tags_list       : [String]
      , seo_desc        : String

      , post_count      : { type: Number, default: 0 }
      , attach_count    : { type: Number, default: 0 }
      , views_count     : { type: Number, default: 0 }

        // First post
      , first_post      : Schema.ObjectId
      , first_post_id   : Number
      , first_user      : Schema.ObjectId
      , first_ts        : Date
        // Last post
      , last_post       : Schema.ObjectId
      , last_post_id    : Number
      , last_user       : Schema.ObjectId
      , last_ts         : Date
  }
  , hb    : {
        prefix_text     : String
      , prefix_style    : String

      , tags_list       : [String]
      , seo_desc        : String

      , post_count      : { type: Number, default: 0 }
      , attach_count    : { type: Number, default: 0 }
      , views_count     : { type: Number, default: 0 }

        // First post
      , first_post      : Schema.ObjectId
      , first_post_id   : Number
      , first_user      : Schema.ObjectId
      , first_ts        : Date
        // Last post
      , last_post       : Schema.ObjectId
      , last_post_id    : Number
      , last_user       : Schema.ObjectId
      , last_ts         : Date
  }

};

var Thread = module.exports.Thread = new mongoose.Schema({

    title           : { type: String, required: true }
    // user-friendly id (autoincremented)
  , id              : { type: Number, required: true, min: 1, index: true }

    // prefix id/cache
  , prefix          : Schema.ObjectId

  , forum           : Schema.ObjectId
  , forum_id        : Number

    // State (normal, closed, soft-deleted, hard-deleted, hellbanned,...)
    // constants should be defined globally
  , state           : { type: Number, required: true }
  , state_ext       : Number  // real state, if thread is sticky
                              // (general `state` is used for fast selects)
  , state_prev      : Number  // previous value, to rollback `delete`

    // Tags
  , tags_id_list    : [Number]

    // "Similar" threads cache
  , similar         : [Schema.ObjectId]

    // SEO
  , keywords        : String

    // Cache
  , cache           : cache

}, { strict: true });

// Indexes
////////////////////////////////////////////////////////////////////////////////

// Main one, used for threads list
Thread.index({
    forum: 1
  , state: 1
  , prefix: 1     // remove, if no prefixes needed
  , _id: -1
});

// Get user threads, with restriction by status & forums list
Thread.index({
    first_user: 1
  , state: 1
  , forum: 1
  , _id: -1
});

Thread.statics.fetchThredsByRealIdList = function (id_list, callback) {
  var condition = {_id:{$in:id_list}};
  this.find(condition, function(err, docs){
    if (err) {
      callback(err);
      return;
    }
    var result = {};
    docs.forEach(function(item) {
      result[item._id.toString()] = item.toObject();
    });
    callback(err, result);
  });
};

Thread.plugin(require('./thread/_fetch'));

module.exports.__init__ = function __init__() {
  return mongoose.model('forum.Thread', Thread);
};
