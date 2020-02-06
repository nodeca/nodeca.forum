// Cache of topics for "similar topics" block
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, collectionName) {

  let TopicSimilarCache = new Schema({
    topic:    Schema.ObjectId,
    ts:       { type: Date, default: Date.now },
    results:  [ { topic_id: Schema.ObjectId, weight: Number } ]
  }, {
    versionKey : false
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////

  TopicSimilarCache.index({ topic: 1 });

  N.wire.on('init:models', function emit_init_TopicSimilarCache() {
    return N.wire.emit('init:models.' + collectionName, TopicSimilarCache);
  });

  N.wire.on('init:models.' + collectionName, function init_model_TopicSimilarCache(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
