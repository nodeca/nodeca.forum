'use strict';


const _        = require('lodash');
const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  function set_content_type(name, value) {
    let duplicate = _.invert(_.get(N, 'shared.content_type', {}))[value];

    if (typeof duplicate !== 'undefined') {
      throw new Error(`Duplicate content type id=${value} for ${name} and ${duplicate}`);
    }

    _.set(N, 'shared.content_type.' + name, value);
  }

  set_content_type('FORUM_POST', 1);

  let statuses = {
    VISIBLE:      1,
    HB:           2, // hellbanned
    PENDING:      3, // reserved, not used now
    DELETED:      4,
    DELETED_HARD: 5
  };


  statuses.LIST_DELETABLE = [ statuses.VISIBLE, statuses.HB, statuses.PENDING ];


  let Post = new Schema({
    topic           : Schema.ObjectId,
    section         : Schema.ObjectId,
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

  // Info to display post tail
    tail            : [ new Schema({ // explicit definition to remove `_id` field
      media_id: Schema.ObjectId,
      file_name: String,
      type: { type: Number }
    }, { _id: false }) ]
  }, {
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

  // - get posts in a section sorting by date
  // - get last N posts in a section
  //
  Post.index({
    section: 1,
    _id:     1
  });

  // Set 'hid' for the new post.
  //
  Post.pre('save', function (callback) {
    if (!this.isNew) {
      callback();
      return;
    }

    let self = this;

    N.models.forum.Topic.findByIdAndUpdate(
      self.topic,
      { $inc: { last_post_counter: 1 } },
      { 'new': true },
      (err, topic) => {
        if (err) {
          callback(err);
          return;
        }

        self.hid = topic.last_post_counter;

        callback();
      }
    );
  });


  // Remove empty "imports" and "import_users" fields
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

    callback();
  });


  // Store parser options separately and save reference to them
  //
  Post.pre('save', function (callback) {
    let self = this;

    N.models.core.MessageParams.setParams(self.params)
      .then(id => {
        self.params = undefined;
        self.params_ref = id;
      })
      .asCallback(callback);
  });


  // Export statuses
  //
  Post.statics.statuses = statuses;


  N.wire.on('init:models', function emit_init_Post() {
    return N.wire.emit('init:models.' + collectionName, Post);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Post(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
