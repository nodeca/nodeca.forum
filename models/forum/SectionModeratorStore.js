
'use strict';


var Mongoose = require('mongoose');
var Schema = Mongoose.Schema;

module.exports = function (N, collectionName) {

  var SectionModeratorStore = new Schema({
      section_id : Schema.Types.ObjectId,

      //  data:
      //    user1_id:
      //      setting1_key:
      //        value: Mixed
      //        own: Boolean
      //
      data       : { type: Schema.Types.Mixed, 'default': {} }
    },
    {
      versionKey: false
    });

  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // Needed in the store
  SectionModeratorStore.index({ section_id: 1 });

  //////////////////////////////////////////////////////////////////////////////


  N.wire.on('init:models', function emit_init_SectionModeratorStore(__, callback) {
    N.wire.emit('init:models.' + collectionName, SectionModeratorStore, callback);
  });


  N.wire.on('init:models.' + collectionName, function init_model_SectionModeratorStore(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
