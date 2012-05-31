"use strict";

/*global nodeca*/

var mongoose = nodeca.runtime.mongoose;
var Schema = mongoose.Schema;

var Thread = module.exports.Thread = new mongoose.Schema({

    title           : { type: String, required: true }
    // user-friendly id (autoincremented)
  , id              : { type: Number, required: true, min: 1, index: true }

    // prefix id/cache
  , prefix          : Schema.ObjectId
  , prefix_text     : String  // cache
  , prefix_style    : String  // cache

  , forum           : Schema.ObjectId
  , forum_id        : Number

  , post_count      : { type: Number, default: 0 }
  , attach_count    : { type: Number, default: 0 }
  , views_count     : { type: Number, default: 0 }

    // State (normal, closed, soft-deleted, hard-deleted, hellbanned,...)
    // constants should be defined globally
  , state           : { type: Number, required: true }
  , state_ext       : Number  // real state, if thread is sticky
                              // (general `state` is used for fast selects)
  , state_prev      : Number  // previous value, to rollback `delete`

    // First post info/cache
  , first_post      : Schema.ObjectId
  , first_post_id   : Number
  , first_user      : Schema.ObjectId
  , first_ts        : Date
    // Last post info/cache
  , last_post       : Schema.ObjectId
  , last_post_id    : Number
  , last_user       : Schema.ObjectId
  , last_ts         : Date

    // Tags
  , tags_id_list    : [Number]
  , tags_list       : [String]  // cache

    // "Similar" threads cache
  , similar         : [Schema.ObjectId]

    // SEO
  , keywords        : String

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

Thread.statics.fetchThredByIdList = function (id_list, callback) {
  var condition = {_id:{$in:id_list}};
  nodeca.models.forum.Thread.find(condition, function(err, docs){
    if (err) {
      callback(err);
      return;
    }
    var result = {};
    docs.forEach(function(item) {
      result[item._id.toString()] = item._doc;
    });
    callback(null, result);
  });
};

module.exports.__init__ = function __init__() {
  return mongoose.model('forum.Thread', Thread);
};
