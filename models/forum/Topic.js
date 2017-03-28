'use strict';


const _        = require('lodash');
const Promise  = require('bluebird');
const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, collectionName) {

  function set_content_type(name, value) {
    let duplicate = _.invert(_.get(N, 'shared.content_type', {}))[value];

    if (typeof duplicate !== 'undefined') {
      throw new Error(`Duplicate content type id=${value} for ${name} and ${duplicate}`);
    }

    _.set(N, 'shared.content_type.' + name, value);
  }

  set_content_type('FORUM_TOPIC', 2);

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
  statuses.LIST_VISIBLE   = [ statuses.OPEN, statuses.CLOSED, statuses.PINNED ];

  // List of `st` values with which the topic is can be deleted
  //
  statuses.LIST_DELETABLE = [ statuses.OPEN, statuses.CLOSED, statuses.PINNED, statuses.PENDING, statuses.HB ];

  // List of `st` values with which the topic is can be closed
  //
  statuses.LIST_CLOSEBLE  = [ statuses.OPEN, statuses.PINNED, statuses.HB ];


  let cache = {
    post_count:    { type: Number, 'default': 0 },

    // First post
    first_post:    Schema.ObjectId,
    first_user:    Schema.ObjectId,
    first_ts:      Date,
    // Last post
    last_post:     Schema.ObjectId,
    last_post_hid: Number,
    last_user:     Schema.ObjectId,
    last_ts:       Date
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
    last_post_counter: { type: Number, 'default': 0 },

    // Cache
    cache,
    cache_hb:       cache,

    views_count:    { type: Number, 'default': 0 }
  }, {
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


  // Update cache: last_post, last_post_hid, last_user, last_ts
  //
  // - topicID - id of topic to update
  //
  Topic.statics.updateCache = Promise.coroutine(function* (topicID) {
    let statuses = N.models.forum.Post.statuses;
    let updateData = {};

    // Find last post
    let post = yield N.models.forum.Post.findOne()
                        .where('topic').equals(topicID)
                        .or([ { st: statuses.VISIBLE }, { st: statuses.HB } ])
                        .sort('-hid')
                        .lean(true);

    updateData['cache_hb.last_post']     = post._id;
    updateData['cache_hb.last_post_hid'] = post.hid;
    updateData['cache_hb.last_user']     = post.user;
    updateData['cache_hb.last_ts']       = post.ts;

    updateData['cache.last_post']     = post._id;
    updateData['cache.last_post_hid'] = post.hid;
    updateData['cache.last_user']     = post.user;
    updateData['cache.last_ts']       = post.ts;

    // If last post hellbanned - find visible one
    if (post.st === statuses.HB) {
      // Find last visible post
      let post_visible = yield N.models.forum.Post.findOne()
                                  .where('topic').equals(topicID)
                                  .where('st').equals(statuses.VISIBLE)
                                  .sort('-hid')
                                  .lean(true);

      // topic might not have any visible posts if it's created by HB
      if (post_visible) {
        updateData['cache.last_post']     = post_visible._id;
        updateData['cache.last_post_hid'] = post_visible.hid;
        updateData['cache.last_user']     = post_visible.user;
        updateData['cache.last_ts']       = post_visible.ts;
      }
    }

    let count = yield Promise.map([ statuses.VISIBLE, statuses.HB ],
                          st => N.models.forum.Post
                                    .where('topic').equals(topicID)
                                    .where('st').equals(st)
                                    .count());

    // Visible post count
    updateData['cache.post_count'] = count[0];

    // Hellbanned post count
    updateData['cache_hb.post_count'] = count[0] + count[1];

    yield N.models.forum.Topic.update({ _id: topicID }, updateData);
  });


  N.wire.on('init:models', function emit_init_Topic() {
    return N.wire.emit('init:models.' + collectionName, Topic);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Topic(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
