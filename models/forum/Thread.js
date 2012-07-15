"use strict";

/*global nodeca*/

var mongoose = nodeca.runtime.mongoose;
var Schema = mongoose.Schema;

function idToStr(value) {
  return !!value ? value.toString() : null;
}

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
      , first_post      : { type: Schema.ObjectId, get: idToStr}
      , first_post_id   : Number
      , first_user      : { type: Schema.ObjectId, get: idToStr}
      , first_ts        : Date
        // Last post
      , last_post       : { type: Schema.ObjectId, get: idToStr}
      , last_post_id    : Number
      , last_user       : { type: Schema.ObjectId, get: idToStr}
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
      , first_post      : { type: Schema.ObjectId, get: idToStr}
      , first_post_id   : Number
      , first_user      : { type: Schema.ObjectId, get: idToStr}
      , first_ts        : Date
        // Last post
      , last_post       : { type: Schema.ObjectId, get: idToStr}
      , last_post_id    : Number
      , last_user       : { type: Schema.ObjectId, get: idToStr}
      , last_ts         : Date
  }

};


var Thread = module.exports.Thread = new mongoose.Schema({
  _id               : { type: Schema.ObjectId, auto: true, get: idToStr}

  , title           : { type: String, required: true }
    // user-friendly id (autoincremented)
  , id              : { type: Number, required: true, min: 1, index: true }

    // prefix id/cache
  , prefix          : { type: Schema.ObjectId, get: idToStr}

  , forum           : { type: Schema.ObjectId, get: idToStr}
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
  , similar         : [{ type: Schema.ObjectId, get: idToStr}]

    // SEO
  , keywords        : String

    // Cache
  , cache           : cache

}, { strict: true });

Thread.virtual('seo_desc').get(function () {
  return this.cache.real.seo_desc;
});

Thread.virtual('post_count').get(function () {
  return this.cache.real.post_count;
});

Thread.virtual('views_count').get(function () {
  return this.cache.real.views_count;
});


Thread.virtual('first_post').get(function() {
  return {
    id:     this.cache.real.first_post_id,
    user:   this.cache.real.first_user,
    ts:     this.cache.real.first_ts
  };
});

Thread.virtual('last_post').get(function() {
  return {
    id:     this.cache.real.last_post_id,
    user:   this.cache.real.last_user,
    ts:     this.cache.real.last_ts
  };
});


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

Thread.plugin(require('./thread/_fetch'));

module.exports.__init__ = function __init__() {
  return mongoose.model('forum.Thread', Thread);
};
