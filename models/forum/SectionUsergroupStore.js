
'use strict';


var Mongoose = require('mongoose');
var Schema = Mongoose.Schema;

module.exports = function (N, collectionName) {

  var SectionUsergroupStore = new Schema({
      section_id : Schema.Types.ObjectId,

      //  data:
      //    usergroup1_id:
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
  SectionUsergroupStore.index({ section_id: 1 });

  //////////////////////////////////////////////////////////////////////////////


  N.wire.on('init:models', function emit_init_SectionUsergroupStore() {
    return N.wire.emit('init:models.' + collectionName, SectionUsergroupStore);
  });


  N.wire.on('init:models.' + collectionName, function init_model_SectionUsergroupStore(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });

  // Remove usergroup-related setting entries at `section_usergroup` store when
  // some usergroup itself is removed.
  N.wire.before('init:models.users.UserGroup', function setup_usergroup_tracking_for_usergroup_store(schema) {
    schema.post('remove', function (usergroup) {
      let store = N.settings.getStore('section_usergroup');

      if (!store) {
        N.logger.error('Settings store `section_usergroup` is not registered.');
        return;
      }

      store.removeUsergroup(usergroup._id).catch(err => {
        N.logger.error(`After ${usergroup._id} usergroup is removed, cannot remove related settings: ${err}`);
      });
    });
  });

  N.wire.before('init:models.forum.Section', function setup_section_tracking_for_usergroup_store(schema) {
    // When a section is created, add a store document for it
    //
    schema.pre('save', function (callback) {
      if (!this.isNew) {
        callback();
        return;
      }

      var store = new N.models.forum.SectionUsergroupStore({ section_id: this._id });
      store.save(callback);
    });

    // When a section is removed, delete a relevant store document
    //
    schema.post('remove', function (section) {
      N.models.forum.SectionUsergroupStore.remove({ section_id: section._id }, function (err) {
        if (err) {
          N.logger.error('After %s section is removed, cannot remove related settings: %s', section._id, err);
        }
      });
    });
  });
};
