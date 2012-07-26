"use strict";

/*global nodeca*/

var NLib = require('nlib');

var _ = NLib.Vendor.Underscore;

var mongoose = nodeca.runtime.mongoose;
var Schema = mongoose.Schema;

var cache =  {
    real                  : {
        thread_count      : { type: Number, default: 0 }
      , post_count        : { type: Number, default: 0 }

      , last_post         : Schema.ObjectId
      , last_post_id      : Number
      , last_thread       : Schema.ObjectId
      , last_thread_id    : Number
      , last_thread_title : String
      , last_user         : Schema.ObjectId
      , last_ts           : Date
  }
  , hb                    : {
        thread_count      : { type: Number, default: 0 }
      , post_count        : { type: Number, default: 0 }

      , last_post         : Schema.ObjectId
      , last_post_id      : Number
      , last_thread       : Schema.ObjectId
      , last_thread_id    : Number
      , last_thread_title : String
      , last_user         : Schema.ObjectId
      , last_ts           : Date
  }

};

var Section = module.exports.Section = new mongoose.Schema({

    title           : { type: String, required: true }
  , description     : String
  , display_order   : Number

    // user-friendly id (autoincremented)
  , id              : { type: Number, required: true, min: 1, index: true }

    // Sections tree paths/cache
  , parent          : Schema.ObjectId
  , parent_id             : Number
  , parent_list     : [Schema.ObjectId]
  , parent_id_list        : [Number]

  , level           : { type: Number, default: 0 }

  , moderator_id_list    : [Number]
  , moderator_list   : [Schema.ObjectId]


    // Options
  , is_category     : { type: Boolean, default: false } // subforum or category
  , is_enabled      : { type: Boolean, default: true }  // hiden inactive
  , is_writeble     : { type: Boolean, default: true} // read-only archive
  , is_searcheable  : { type: Boolean, default: true }
  , is_voteable     : { type: Boolean, default: true }
  , is_counted      : { type: Boolean, default: true }  // inc user's counter, when posted here
  , is_excludable   : { type: Boolean, default: true}

    // Topic prefixes
  , is_prefix_required  : { type: Boolean, default: false }
  , prefix_groups   : [Schema.ObjectId] // allowed groups of prefixes

    // Cache
  , cache           : cache

}, { strict: true });


// build tree on index page
Section.index({
    level: 1
  , display_order: 1
  , _id: -1
});

// build tree in forum page
Section.index({
    level: 1
  , parent_list: 1
  , display_order: 1
  , _id: -1
});

module.exports.__init__ = function __init__() {
  return mongoose.model('forum.Section', Section);
};
