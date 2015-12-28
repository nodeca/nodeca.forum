'use strict';


var Mongoose = require('mongoose');
var Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  var statuses = {
    VISIBLE:      1,
    HB:           2, // hellbanned
    PENDING:      3, // reserved, not used now
    DELETED:      4,
    DELETED_HARD: 5
  };


  var Post = new Schema({
    topic           : Schema.ObjectId,
    hid             : Number,

    // Related post for replies
    to              : Schema.ObjectId,
    user            : Schema.ObjectId,
    legacy_nick     : String,  // only if user id is undefined, e.g. guests
    ts              : { type: Date, 'default': Date.now },  // timestamp
    ip              : String,  // ip address

    // Data for displaying "replied to" link
    to_user         : Schema.ObjectId,
    to_phid         : Number,

    // those are rarely used (only if it's a reply to a different topic)
    to_fhid         : Number,
    to_thid         : Number,

    html            : String,  // displayed HTML
    md              : String,  // markdown source

  // State (normal, closed, soft-deleted, hard-deleted, hellbanned,...)
  // constants should be defined globally
    st              : Number,
    ste             : Number,  // real state, if topic is sticky or hellbanned
                               // (general `state` is used for fast selects)

  // Aggregated votes count
    votes           : { type: Number, 'default': 0 },
    votes_hb        : { type: Number, 'default': 0 },

  // Bookmarks count
    bookmarks       : { type: Number, 'default': 0 },

    del_reason      : String,
    del_by          : Schema.ObjectId,
  // Previous state for deleted posts
    prev_st         : {
      st: Number,
      ste: Number
    },

    attach          : [ Schema.ObjectId ],  // all attachments

  // Post params
    params_ref      : Schema.ObjectId,

  // List of urls to accessible resources being used to build this post (snippets, etc.)
    imports         : [ String ],

  // List of users to fetch in order to properly display the post
    import_users    : [ Schema.ObjectId ],

  // Image sizes and attachment attributes with "url:" or "media:" prefix respectively
    image_info      : Schema.Types.Mixed,

  // Info to display post tail
    tail            : [ new Schema({ // explicit definition to remove `_id` field
      media_id: Schema.ObjectId,
      file_name: String,
      type: { type: Number }
    }, { _id: false }) ]
  },
  {
    versionKey : false
  });

  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  //  - get a post by topic + hid
  //  - get posts by hid range
  //
  Post.index({
    topic: 1,
    hid:   1,
    st:    1
  });

  // - count all posts before current (pagination)
  //
  Post.index({
    topic: 1,
    st:    1,
    hid:   1
  });

  // Set 'hid' for the new post.
  //
  Post.pre('save', function (callback) {
    if (!this.isNew) {
      callback();
      return;
    }

    var self = this;

    N.models.forum.Topic.findByIdAndUpdate(
        self.topic,
        { $inc: { last_post_hid: 1 } },
        { 'new': true },
        function (err, topic) {

      if (err) {
        callback(err);
        return;
      }

      self.hid = topic.last_post_hid;

      callback();
    });
  });


  // Remove empty "imports", "import_users", "image_info" fields
  //
  Post.pre('save', function (callback) {
    if (this.imports && this.imports.length === 0) {
      /*eslint-disable no-undefined*/
      this.imports = undefined;
    }

    if (this.import_users && this.import_users.length === 0) {
      /*eslint-disable no-undefined*/
      this.import_users = undefined;
    }

    if (this.image_info && Object.keys(this.image_info).length === 0) {
      /*eslint-disable no-undefined*/
      this.image_info = undefined;
    }

    callback();
  });


  // Store parser options separately and save reference to them
  //
  Post.pre('save', function (callback) {
    var self = this;

    N.models.core.MessageParams.setParams(self.params, function (err, id) {
      if (err) {
        callback(err);
        return;
      }

      self.params = undefined;
      self.params_ref = id;

      callback();
    });
  });


  // Export statuses
  //
  Post.statics.statuses = statuses;


  N.wire.on('init:models', function emit_init_Post(__, callback) {
    N.wire.emit('init:models.' + collectionName, Post, callback);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Post(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
