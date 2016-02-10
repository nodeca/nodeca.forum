'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;
const co       = require('co');


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, collectionName) {

  // Topic statuses are optimized for paged fetches & indexes
  // Some statises can have extended info in additionsl field:
  //
  // - PINNED, HB - status_ext contains OPEN/CLOSED/PENDING state
  //
  let statuses = {
    OPEN:         1,
    CLOSED:       2,
    PINNED:       3,
    PENDING:      4,
    DELETED:      5,
    DELETED_HARD: 6,
    HB:           7 // hellbanned
  };

  // List of `st` values with which the topic is considered publicly visible
  //
  statuses.LIST_VISIBLE = [ statuses.OPEN, statuses.CLOSED, statuses.PINNED ];


  let cache = {
    post_count:   { type: Number, 'default': 0 },
    attach_count: { type: Number, 'default': 0 },

    // First post
    first_post:   Schema.ObjectId,
    first_user:   Schema.ObjectId,
    first_ts:     Date,
    // Last post
    last_post:    Schema.ObjectId,
    last_user:    Schema.ObjectId,
    last_ts:      Date
  };

  let Topic = new Schema({
    title:          String,
    // user-friendly id (autoincremented)
    hid:            Number,

    section:        Schema.ObjectId,

    // Incremented when remove post from topic
    version:        Number,

    // State (normal, closed, soft-deleted, hard-deleted, hellbanned,...)
    // constants should be defined globally
    st:             Number,
    ste:            Number,   // real state, if topic is sticky or hellbanned
                              // (general `state` is used for fast selects
    del_reason:     String,
    del_by:         Schema.ObjectId,
    // Previous state for deleted topics
    prev_st: {
      st:   Number,
      ste:  Number
    },

    // Last assigned hid to the posts in this topic,
    // used to determine hid of a new post
    last_post_hid:  { type: Number, 'default': 0 },

    // Cache
    cache,
    cache_hb:       cache,

    views_count:    { type: Number, 'default': 0 }
  },
  {
    versionKey : false
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  // 1. count an amount of topics before the current one
  // 2. select topics before/after current one
  // 3. select previous/next page
  // 4. fetch all pinned topics
  //
  // We use separate indices for normal and hellbanned users.
  //
  // _id and hid are added only to avoid full document scan
  //
  Topic.index({ section: 1, st: 1, 'cache.last_post':    -1, _id: 1 });
  Topic.index({ section: 1, st: 1, 'cache_hb.last_post': -1, _id: 1 });

  // lookup _id by hid (for routing)
  Topic.index({ hid: 1 });


  ////////////////////////////////////////////////////////////////////////////////

  // Export statuses
  //
  Topic.statics.statuses = statuses;


  // Set 'hid' for the new topic.
  // This hook should always be the last one to avoid counter increment on error
  Topic.pre('save', function (callback) {
    if (!this.isNew) {
      callback();
      return;
    }

    if (this.hid) {
      // hid is already defined when this topic was created, used in vbconvert;
      // it's caller responsibility to increase Increment accordingly
      callback();
      return;
    }

    N.models.core.Increment.next('topic', (err, value) => {
      if (err) {
        callback(err);
        return;
      }

      this.hid = value;
      callback();
    });
  });


  // Update cache last_post, last_user, last_ts
  //
  // - topicID  - id of topic to update
  // - full     - update 'cache' even if last post is hellbanned
  //
  Topic.statics.updateCache = co.wrap(function* (topicID, full) {
    let Post = N.models.forum.Post;
    let updateData = {};

    let post = yield N.models.forum.Post
      .findOne({ topic: topicID, $or: [ { st: Post.statuses.VISIBLE }, { st: Post.statuses.HB } ] })
      .sort('-_id')
      .select('_id user ts st');

    if (post.st === Post.statuses.VISIBLE) {
      updateData['cache.last_post'] = post._id;
      updateData['cache.last_user'] = post.user;
      updateData['cache.last_ts'] = post.ts;
    }

    updateData['cache_hb.last_post'] = post._id;
    updateData['cache_hb.last_user'] = post.user;
    updateData['cache_hb.last_ts'] = post.ts;

    if (!full || post.st === Post.statuses.VISIBLE) {
      yield N.models.forum.Topic.update({ _id: topicID }, updateData);
      return;
    }

    post = yield N.models.forum.Post
      .findOne({ topic: topicID, st: Post.statuses.VISIBLE })
      .sort('-_id')
      .select('_id user ts');

    updateData['cache.last_post'] = post._id;
    updateData['cache.last_user'] = post.user;
    updateData['cache.last_ts'] = post.ts;

    yield N.models.forum.Topic.update({ _id: topicID }, updateData);
  });


  N.wire.on('init:models', function emit_init_Topic() {
    return N.wire.emit('init:models.' + collectionName, Topic);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Topic(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
