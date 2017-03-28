'use strict';


var Mongoose = require('mongoose');
var Schema   = Mongoose.Schema;

module.exports = function (N, collectionName) {

  var PostBookmark = new Schema({
    user:    Schema.ObjectId,
    post_id: Schema.ObjectId
  }, {
    versionKey : false
  });

  ////////////////////////////////////////////////////////////////////////////////
  // Indexes

  // Used in post list. Get posts bookmarks for user.
  PostBookmark.index({ user: 1, post_id: 1 });


  N.wire.on('init:models', function emit_init_PostBookmark() {
    return N.wire.emit('init:models.' + collectionName, PostBookmark);
  });

  N.wire.on('init:models.' + collectionName, function init_model_PostBookmark(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
