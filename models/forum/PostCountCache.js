// Cache for `N.models.forum.Post.count()`

'use strict';


var Mongoose = require('mongoose');
var Schema = Mongoose.Schema;
var _        = require('lodash');
var async    = require('async');
var thenify  = require('thenify');


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


  // Get cached count
  //
  // - src (ObjectId) - source _id
  // - version (Number) - optional, incremental src version, default 0
  // - hid (Number) - required position
  // - hb (Boolean) - user hellbanned status
  // - callback (Function) - `function (err, cnt)`
  //
  PostCountCache.statics.getCount = thenify.withCallback(function (src, version, hid, hb, callback) {

    // Get post count.
    //
    // We don't use `$in` because it is slow. Parallel requests with strict equality is faster.
    //
    function countFn(hid, cut_from, callback) {
      var Post = N.models.forum.Post;

      // Posts with this statuses are counted on page (others are shown, but not counted)
      var countable_statuses = [ Post.statuses.VISIBLE ];

      // For hellbanned users - count hellbanned posts too
      if (hb) {
        countable_statuses.push(Post.statuses.HB);
      }

      var result = 0;

      async.each(countable_statuses, function (st, next) {
        Post.find()
            .where('topic').equals(src)
            .where('st').equals(st)
            .where('hid').lt(hid)
            .where('hid').gte(cut_from)
            .count(function (err, cnt) {

          if (err) {
            next(err);
            return;
          }

          result += cnt;
          next();
        });

      }, function (err) {
        callback(err, result);
      });
    }

    var cached_hid = hid - hid % CACHE_STEP_SIZE;

    // Use direct count for small numbers
    if (cached_hid === 0) {
      countFn(hid, 0, callback);
      return;
    }

    // Fetch cache record
    N.models.forum.PostCountCache.findOne({ src: src })
        .lean(true)
        .exec(function (err, cache) {

      if (err) {
        callback(err);
        return;
      }

      var path = [ 'data', (version || 0), (hb ? 'hb' : 'normal'), cached_hid ].join('.');

      // If cache does not exists - use direct count and rebuild cache mark
      if (_.has(cache, path)) {

        // If required hid equals to cached one - return cached value
        if (hid === cached_hid) {
          callback(null, _.get(cache, path));
          return;
        }

        // Get count between cached hid and required one
        countFn(hid, cached_hid, function (err, cnt) {
          if (err) {
            callback(err);
            return;
          }

          callback(null, cnt + _.get(cache, path));
        });
        return;
      }

      // If no cache
      countFn(cached_hid, 0, function (err, cached_hid_value) {
        if (err) {
          callback(err);
          return;
        }

        var update = { $set: { src: src } };

        update.$set[path] = cached_hid_value;

        // Remove all previous version keys if exists
        Object.keys((cache || {}).data || {}).forEach(function (cache_version) {
          if (cache_version < (version || 0)) {
            update.$unset = update.$unset || {};
            update.$unset['data.' + cache_version] = '';
          }
        });

        // Update cache record
        N.models.forum.PostCountCache.update({ src: src }, update, { upsert: true })
            .exec(function (err) {

          if (err) {
            callback(err);
            return;
          }

          // Get count between cached hid and required hid
          countFn(hid, cached_hid, function (err, cnt) {
            if (err) {
              callback(err);
              return;
            }

            callback(null, cnt + cached_hid_value);
          });
        });
      });
    });
  });


  N.wire.on('init:models', function emit_init_PostCountCache(__, callback) {
    N.wire.emit('init:models.' + collectionName, PostCountCache, callback);
  });


  N.wire.on('init:models.' + collectionName, function init_model_PostCountCache(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
