// Cache for `N.models.forum.Post.countDocuments()`

'use strict';


const _        = require('lodash');
const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


// Step between cached hids. Value should be big enough to:
//
// - improve count performance (between cached and required hids)
// - avoid frequency cache hits misses
//
const CACHE_STEP_SIZE = 100;


module.exports = function (N, collectionName) {

  var PostCountCache = new Schema({
    // Source _id
    src: Schema.ObjectId,

    // Hash: version -> normal|hb -> hid -> count
    data: Object
  }, {
    versionKey: false
  });


  ////////////////////////////////////////////////////////////////////////////////
  // Indexes

  PostCountCache.index({ src: 1 });


  // Helper. Get visible post count.
  //
  // We don't use `$in` because it is slow. Parallel requests with strict equality is faster.
  //
  async function countFn(src, hid, cut_from, with_hb) {
    var Post = N.models.forum.Post;

    // Posts with this statuses are counted on page (others are shown, but not counted)
    var countable_statuses = [ Post.statuses.VISIBLE ];

    // For hellbanned users - count hellbanned posts too
    if (with_hb) {
      countable_statuses.push(Post.statuses.HB);
    }

    let counters = await Promise.all(
      countable_statuses.map(st =>
        Post.find()
            .where('topic').equals(src)
            .where('st').equals(st)
            .where('hid').lt(hid)
            .where('hid').gte(cut_from)
            .countDocuments()
      )
    );

    return counters.reduce((a, b) => a + b, 0);
  }


  // Get cached count
  //
  // - src (ObjectId) - source _id
  // - version (Number) - optional, incremental src version, default 0
  // - hid (Number) - required position
  // - hb (Boolean) - user hellbanned status
  // - callback (Function) - `function (err, cnt)`
  //
  PostCountCache.statics.getCount = async function (src, version, hid, hb) {

    var cached_hid = hid - hid % CACHE_STEP_SIZE;

    // Use direct count for small numbers
    if (cached_hid === 0) {
      return await countFn(src, hid, 0, hb);
    }

    // Fetch cache record
    let cache = await N.models.forum.PostCountCache
                          .findOne({ src })
                          .lean(true);

    let path = [ 'data', (version || 0), (hb ? 'hb' : 'normal'), cached_hid ].join('.');

    // Has cache - use it
    if (_.has(cache, path)) {

      // If required hid equals to cached one - return cached value
      if (hid === cached_hid) {
        return _.get(cache, path);
      }

      // Get count between cached hid and required one
      let cnt = await countFn(src, hid, cached_hid, hb);

      return cnt + _.get(cache, path);
    }

    // If cache does not exists - use direct count and rebuild cache mark
    let cached_hid_value = await countFn(src, cached_hid, 0, hb);

    let update = { $set: { src } };

    update.$set[path] = cached_hid_value;

    // Remove all previous version keys if exists
    Object.keys((cache || {}).data || {}).forEach(cache_version => {
      if (cache_version < (version || 0)) {
        update.$unset = update.$unset || {};
        update.$unset['data.' + cache_version] = '';
      }
    });

    // Update cache record
    await N.models.forum.PostCountCache
              .updateOne({ src }, update, { upsert: true });

    // Get count between cached hid and required hid
    let cnt = await countFn(src, hid, cached_hid, hb);

    return cnt + cached_hid_value;
  };


  N.wire.on('init:models', function emit_init_PostCountCache() {
    return N.wire.emit('init:models.' + collectionName, PostCountCache);
  });


  N.wire.on('init:models.' + collectionName, function init_model_PostCountCache(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
