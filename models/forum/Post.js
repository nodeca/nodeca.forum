"use strict";

/*global nodeca*/

var mongoose = nodeca.runtime.mongoose;
var Schema = mongoose.Schema;

var cache = {
    thread_id       : Number
  , forum_id        : Number

  , counters        : {
      attach_count    : { type: Number, default: 0 }
  }
};

var Post = module.exports.Post = new mongoose.Schema({

    // user-friendly id (autoincremented)
    id              : { type: Number, required: true, min: 1, index: true }

  , thread          : Schema.ObjectId
  , forum           : Schema.ObjectId

  , user            : Schema.ObjectId
  , ts              : Date    // timestamp

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

  // Options
  , is_smiles_off   : Boolean
  , is_autolinks_off  : Boolean

  // Infractions/Reports
  , has_infraction  : Boolean // true is post have infractions
  , report          : Schema.ObjectId // ID of thread with reports

  , attach_list     : [Schema.ObjectId]

  , cache           : cache

}, { strict: true });

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

Post.statics.fetchPostsByThread = function( thread_id, callback) {
  this.find({thread:thread_id}, callback);
};

module.exports.__init__ = function __init__() {
  return mongoose.model('forum.Post', Post);
};
