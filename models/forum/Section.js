"use strict";

/*global nodeca*/

var NLib = require('nlib');

var _ = NLib.Vendor.Underscore;

var mongoose = nodeca.runtime.mongoose;
var Schema = mongoose.Schema;

var Section = module.exports.Section = new mongoose.Schema({

    title           : { type: String, required: true }
  , description     : String
  , display_order   : { type: Number, default: 0 }

  , thread_count    : { type: Number, default: 0 }

    // user-friendly id (autoincremented)
  , id              : { type: Number, required: true, min: 1, index: true }

    // Sections tree paths/cache
  , parent          : Schema.ObjectId
  , parent_id       : Number
  , parent_list     : [Schema.ObjectId]
  , parent_id_list  : [Number]
  , child_list      : [Schema.ObjectId]
  , child_id_list   : [Number]

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

    // Last post info/cache
  , last_post       : Schema.ObjectId
  , last_post_id    : Number
  , last_thread     : Schema.ObjectId
  , last_thread_id  : Number
  , last_user       : Schema.ObjectId
  , last_ts         : Date

    // Filters
  , excludable      : Boolean
  , closed_ui_show         : { type: Boolean, default: false }
  , closed_hide_by_default : { type: Boolean, default: false }

}, { strict: true });

Section.statics.fetchCategories = function (root, callback) {
  var model = this;
  var conditions = {};

  if (callback === undefined){
    callback = root;
    root = null;
  }
  else {
    conditions = {parent_id: root};
  }

  var result = [];
  model.find({parent_id: root}, function(err, category_list){
    if (err) {
      callback(err, result);
    }
    var category_id_list = category_list.map(function(category) {
      return category._id.toString();
    });
    
    model.find({parent:{$in:category_id_list}}, function(err, forum_list){
      if (!err) {
        category_list.forEach(function(item) {
          var category = item._doc;

          var child_list = forum_list.filter(function(forum){
            return forum.parent.toString() === category._id.toString();
          });
          
          category.child_list = child_list.map(function(forum) {
            return forum._doc;
          });
          result.push(category);
        });
      }
      callback(err, result);
    });
    
    //model.find(
  });
};

module.exports.__init__ = function __init__() {
  return mongoose.model('forum.Section', Section);
};
