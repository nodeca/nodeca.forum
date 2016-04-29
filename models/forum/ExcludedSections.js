// Storage for list of sections excluded by user
//
'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let ExcludedSections = new Schema({

      // _id of user
      user: Schema.ObjectId,

      // array of excluded sections
      excluded_sections: [ Schema.ObjectId ]
    },
    {
      versionKey: false
    });


  ////////////////////////////////////////////////////////////////////////////////
  // Indexes

  ExcludedSections.index({ user: 1 });


  N.wire.on('init:models', function emit_init_ExcludedSections() {
    return N.wire.emit('init:models.' + collectionName, ExcludedSections);
  });

  N.wire.on('init:models.' + collectionName, function init_model_ExcludedSections(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
