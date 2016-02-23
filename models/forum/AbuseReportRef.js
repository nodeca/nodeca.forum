// Reference to discussion topic about abuse report
//
'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let AbuseReportRef = new Schema({

      // _id of reported content
      src_id: Schema.ObjectId,

      // Report discussion topic
      dest_id: Schema.ObjectId
    },
    {
      versionKey: false
    });


  ////////////////////////////////////////////////////////////////////////////////
  // Indexes

  // Used `internal:forum.abuse_report`. Get abuse report discussion _id by src_id.
  AbuseReportRef.index({ src_id: 1 });


  N.wire.on('init:models', function emit_init_AbuseReportRef() {
    return N.wire.emit('init:models.' + collectionName, AbuseReportRef);
  });

  N.wire.on('init:models.' + collectionName, function init_model_AbuseReportRef(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
