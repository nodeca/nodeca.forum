// Reference to discussion topic about abuse report
//
'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let AbuseReportRef = new Schema({
    // _id of reported content
    src:  Schema.ObjectId,

    // Report discussion topic
    dest: Schema.ObjectId
  }, {
    versionKey: false
  });


  ////////////////////////////////////////////////////////////////////////////////
  // Indexes

  // Used `internal:forum.abuse_report`. Get abuse report discussion _id by src.
  AbuseReportRef.index({ src: 1 });


  N.wire.on('init:models', function emit_init_AbuseReportRef() {
    return N.wire.emit('init:models.' + collectionName, AbuseReportRef);
  });

  N.wire.on('init:models.' + collectionName, function init_model_AbuseReportRef(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
