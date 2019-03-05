// History of the edits made for forum posts
//

'use strict';


const _              = require('lodash');
const Mongoose       = require('mongoose');
const Schema         = Mongoose.Schema;

// If same user edits the same post within 5 minutes, all changes
// made within that period will be squashed into one diff.
const HISTORY_GRACE_PERIOD = 5 * 60 * 1000;


let roles = {
  USER:      1,
  MODERATOR: 2,
  TASK:      3
};


module.exports = function (N, collectionName) {

  // list of properties we want to track
  let topicSchema = {
    title:      String,
    section:    Schema.ObjectId,
    st:         Number,
    ste:        Number,
    del_reason: String,
    del_by:     Schema.ObjectId,
    prev_st: {
      st:  Number,
      ste: Number
    }
  };

  let postSchema = {
    md:         String,
    st:         Number,
    ste:        Number,
    del_reason: String,
    del_by:     Schema.ObjectId,
    prev_st: {
      st:  Number,
      ste: Number
    },
    params_ref: Schema.ObjectId
  };


  let PostHistory = new Schema({
    // post id
    post: Schema.ObjectId,

    // metadata
    user: Schema.ObjectId,
    ts:   { type: Date, 'default': Date.now },
    ip:   String,
    role: Number,

    // old information before changes were made;
    // topic_data is only available for 1st post in each topic, null otherwise
    topic_data: topicSchema,
    post_data:  postSchema
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find history for a particular post
  PostHistory.index({ post: 1, _id: 1 });


  // Export roles
  //
  PostHistory.statics.roles = roles;


  // Helper used to pick data from arbitrary object in accordance with provided schema
  //
  function getDataBySchema(data, schema) {
    // convert mongoose object to plain js object
    if (typeof data.toJSON === 'function') data = data.toJSON();

    // get all listed properties
    return _.pick(data, Object.keys(schema));
  }


  /*
   * Add a new history entry
   *
   * Params:
   *
   * - changes (Array)    - each item is an object describing changes to a single post
   *   - old_topic (Object) - topic version before updates (1st post only)
   *   - old_post  (Object) - post version before updates
   *   - new_topic (Object) - topic version after updates (1st post only)
   *   - new_post  (Object) - post version after updates
   * - meta (Object)      - metadata for this change
   *   - user (ObjectId)    - who made those changes
   *   - role (Number)      - under what permission set this change was made
   *   - ip   (String)      - ip address (optional, default: 127.0.0.1)
   *   - ts   (Date)        - time of change (optional, default: now)
   *
   * This function collapses changes if they are made:
   *  - by the same user
   *  - with the same role
   *  - within short period of time (grace period)
   *
   * In order to do this, it fetches previous version recorded in history
   * and compares all three:
   *  - "new" (latest revision) - from params, post after changes are made
   *  - "old" (2nd latest)      - from params, post before changes are made
   *  - "prev" (3rd latest)     - from latest found history entry
   *
   * There are four possible outcomes for each change:
   *
   * 1. It can be added as a new history entry
   *    - if "new-old" and "old-prev" changes aren't collapsible
   * 2. It can update previous history entry
   *    - if "new-old" and "old-prev" are collapsible, and "new"!="prev"
   * 3. It can remove previous history entry
   *    - if "new-old" and "old-prev" are collapsible, and "new"="prev"
   * 4. Nothing is added, nothing is removed
   *    - if "new-old" has no changes (submitted posts are identical)
   */
  PostHistory.statics.add = async function addHistory(changes, meta) {
    if (!Array.isArray(changes)) changes = [ changes ];

    meta = Object.assign({}, meta);
    if (!meta.ts) meta.ts = new Date();
    if (!meta.ip) meta.ip = '127.0.0.1'; // for TASK

    //
    // Fetch first post of each topic if it isn't passed in params,
    // it's used for topic-only changes (pin, close, etc.)
    //
    let incomplete_topic_ids = _.map(changes.filter(c => !c.old_post && !c.new_post), 'new_topic._id');

    if (incomplete_topic_ids.length > 0) {
      let first_posts = _.keyBy(
        await N.models.forum.Post.find()
                  .where('topic').in(incomplete_topic_ids)
                  .where('hid').equals(1)
                  .lean(true),
        'topic'
      );

      for (let c of changes) {
        if (!c.old_post && !c.new_post) {
          c.old_post = c.new_post = first_posts[c.new_topic._id];
        }
      }
    }

    //
    // Select all history ids first, used for:
    //  - selecting last history entry
    //  - counting number of changes later
    //
    // (this fetches large numbers of smaller documents, index only)
    //
    let history_ids = await N.models.forum.PostHistory.find()
                                .where('post').in(_.map(changes, 'new_post._id'))
                                .select('post _id')
                                .sort('_id')
                                .lean(true);

    //
    // Find number of history entries per post, and last change id for each post
    //
    let history = {};

    for (let { new_post } of changes) {
      history[new_post._id] = { count: 0, last: null };
    }

    for (let { post, _id } of history_ids) {
      history[post].count++;
      history[post].last = _id;
    }

    //
    // Fetch last history record for each post
    //
    // (this fetches small numbers of large documents, entire history entries)
    //
    let last_history_entry = _.keyBy(
      await N.models.forum.PostHistory.find()
                .where('_id').in(_.map(Object.values(history), 'last').filter(Boolean))
                .lean(true),
      'post'
    );

    let bulk_history = N.models.forum.PostHistory.collection.initializeUnorderedBulkOp();

    /* eslint-disable no-undefined */
    for (let { old_post, new_post, old_topic, new_topic } of changes) {
      let prev = last_history_entry[new_post._id];
      let old_topic_data = new_post.hid <= 1 ? getDataBySchema(old_topic, topicSchema) : undefined;
      let old_post_data = getDataBySchema(old_post, postSchema);
      let old_data_str = JSON.stringify([ old_topic_data, old_post_data ]);
      let new_topic_data = new_post.hid <= 1 ? getDataBySchema(new_topic, topicSchema) : undefined;
      let new_post_data = getDataBySchema(new_post, postSchema);
      let new_data_str = JSON.stringify([ new_topic_data, new_post_data ]);

      // stop if no changes were made (shouldn't normally happen)
      if (old_data_str === new_data_str) continue;

      //
      // Merge changes if the same user edits the same post within grace period,
      // so the conditions are:
      //
      //  - previous history entry exists
      //  - user is the same
      //  - role is the same
      //  - ts is within last 5 minutes
      //
      if (prev &&
          String(prev.user) === String(meta.user) &&
          prev.role === meta.role &&
          prev.ts > meta.ts - HISTORY_GRACE_PERIOD && prev.ts <= meta.ts) {

        let prev_topic_data = new_post.hid <= 1 ? getDataBySchema(prev.topic_data, topicSchema) : undefined;
        let prev_post_data = getDataBySchema(prev.post_data, postSchema); // sort keys
        let prev_data_str = JSON.stringify([ prev_topic_data, prev_post_data ]);

        if (prev_data_str === new_data_str) {
          //
          // Remove last history entry when user reverts changes
          //
          history[new_post._id].count--;
          bulk_history.find({ _id: prev._id }).remove();
          continue;
        }

        //
        // Merge changes into existing history entry
        //
        // we do not need to do anything here:
        //  - meta (ip, ts) is kept from older entry
        //  - data (previous state before changes) is kept from older entry
        //
        continue;
      }

      //
      // Do not record a change made within grace period of post creation,
      // so the conditions are:
      //
      //  - previous history doesn't exist
      //  - user is the same as post author
      //  - role is USER (assume all new posts are created as user)
      //  - post creation time is within last 5 minutes
      //
      if (!prev &&
          String(new_post.user) === String(meta.user) &&
          meta.role === N.models.forum.PostHistory.roles.USER &&
          new_post.ts > meta.ts - HISTORY_GRACE_PERIOD && new_post.ts <= meta.ts) {
        continue;
      }

      //
      // Add new history entry
      //
      history[new_post._id].count++;

      bulk_history.insert({
        post:       new_post._id,
        user:       meta.user,
        ts:         meta.ts,
        ip:         meta.ip,
        role:       meta.role,
        topic_data: old_topic_data,
        post_data:  old_post_data
      });
    }

    if (bulk_history.length > 0) await bulk_history.execute();

    let bulk = N.models.forum.Post.collection.initializeUnorderedBulkOp();

    for (let { new_post } of changes) {
      bulk.find({ _id: new_post._id }).update({
        $set: {
          last_edit_ts: meta.ts,
          edit_count: history[new_post._id].count
        }
      });
    }

    if (bulk.length > 0) await bulk.execute();
  };


  N.wire.on('init:models', function emit_init_PostHistory() {
    return N.wire.emit('init:models.' + collectionName, PostHistory);
  });


  N.wire.on('init:models.' + collectionName, function init_model_PostHistory(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
