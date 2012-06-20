"use strict";

/*global nodeca*/

var NLib = require('nlib');

var _ = NLib.Vendor.Underscore;

var mongoose = nodeca.runtime.mongoose;
var Schema = mongoose.Schema;

var cache =  {

    parent_id             : Number
  , parent_id_list        : [Number]
  , child_id_list         : [Number]

  , moderators_id_list    : [String]

  , counters              : {
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
  , hb_counters           : {
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
  , display_order   : { type: Number, default: 0 }

    // user-friendly id (autoincremented)
  , id              : { type: Number, required: true, min: 1, index: true }

    // Sections tree paths/cache
  , parent          : Schema.ObjectId
  , parent_list     : [Schema.ObjectId]
  , child_list      : [Schema.ObjectId]

  , moderators_list   : [Schema.ObjectId]

    // If set, section works as redirect link
  , redirect        : String

    // Options
  , is_category     : { type: Boolean, default: false } // subforum or category
  , is_enabled      : { type: Boolean, default: true }  // hiden inactive
  , is_archive      : { type: Boolean, default: false } // read-only archive
  , is_searcheable  : { type: Boolean, default: true }
  , is_voteable     : { type: Boolean, default: true }
  , is_counted      : { type: Boolean, default: true }  // inc user's counter, when posted here

    // Topic prefixes
  , is_prefix_required  : { type: Boolean, default: false }
  , prefix_groups   : [Schema.ObjectId] // allowed groups of prefixes


    // Filters
  , excludable      : Boolean
  , closed_ui_show         : { type: Boolean, default: false }
  , closed_hide_by_default : { type: Boolean, default: false }

    // Cache
  , cache           : cache

}, { strict: true });

Section.statics.fetchSections = function (options, callback) {
  if (callback === undefined){
    callback = options;
    options = {};
  }
  this.find(options, function(err, result){
    callback(err, result);
  });
};

module.exports.__init__ = function __init__() {
  return mongoose.model('forum.Section', Section);
};
