'use strict';


const Mongoose = require('mongoose');
const memoize  = require('promise-memoize');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  function set_content_type(name, value) {
    N.shared = N.shared || {};
    N.shared.content_type = N.shared.content_type || {};

    let duplicate = Object.entries(N.shared.content_type).find(([ , v ]) => v === value)?.[0];

    if (typeof duplicate !== 'undefined') {
      throw new Error(`Duplicate content type id=${value} for ${name} and ${duplicate}`);
    }

    N.shared.content_type[name] = value;
  }

  set_content_type('FORUM_SECTION', 3);

  let cache = {
    topic_count:      { type: Number, default: 0 },
    post_count:       { type: Number, default: 0 },

    last_post:        Schema.ObjectId,
    last_topic:       Schema.ObjectId,
    last_topic_hid:   Number,
    last_topic_title: String,
    last_user:        Schema.ObjectId,
    last_ts:          Date
  };

  let Section = new Schema({
    title:            String,
    description:      String,
    display_order:    Number,

    // user-friendly id (autoincremented)
    hid:              { type: Number, index: true },

    // Sections tree paths/cache
    parent:           Schema.ObjectId,

    // Options
    is_category:      { type: Boolean, default: false }, // subsection or category
    is_enabled:       { type: Boolean, default: true },  // hiden inactive
    is_writable:      { type: Boolean, default: true },  // read-only archive
    is_searchable:    { type: Boolean, default: true },
    is_votable:       { type: Boolean, default: true },
    is_counted:       { type: Boolean, default: true },  // inc user's counter, when posted here
    is_excludable:    { type: Boolean, default: true },

    // Topic prefixes
    is_prefix_required: { type: Boolean, default: false },
    prefix_groups:    [ Schema.ObjectId ], // allowed groups of prefixes

    // Cache
    cache,
    cache_hb:         cache
  }, {
    versionKey : false
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  // build section tree structure in `getSectionsTree` (see below)
  Section.index({
    display_order: 1,
    _id: -1
  });


  // Hooks
  ////////////////////////////////////////////////////////////////////////////////

  // Compute `parent_list` and `level` fields before save.
  //
  Section.pre('save', function () {
    // Record modified state of `parent` field for post hook.
    // Always assume true for unsaved models.
    this.__isParentModified__ = this.isModified('parent') || this.isNew;
  });

  // Remove empty "parent" field
  //
  Section.pre('save', function () {
    /*eslint-disable no-undefined*/
    if (this.parent === null) this.parent = undefined;
  });

  // Set 'hid' for the new section.
  // This hook should always be the last one to avoid counter increment on error
  Section.pre('save', async function () {
    if (!this.isNew) return;

    // hid is already defined when this section was created, used in vbconvert;
    // it's caller responsibility to increase Increment accordingly
    if (this.hid) return;

    this.hid = await N.models.core.Increment.next('section');
  });

  // Update all inherited settings (permissions) for subsections.
  //
  async function __update_inherited(id) {
    let SectionUsergroupStore = N.settings.getStore('section_usergroup');

    if (SectionUsergroupStore) {
      await SectionUsergroupStore.updateInherited(id);
    } else {
      N.logger.error('Settings store `section_usergroup` is not registered.');
    }

    let SectionModeratorStore = N.settings.getStore('section_moderator');

    if (SectionModeratorStore) {
      await SectionModeratorStore.updateInherited(id);
    } else {
      N.logger.error('Settings store `section_moderator` is not registered.');
    }
  }

  Section.post('save', function (section) {
    // Nothing to do if parent is not changed.
    if (!section.__isParentModified__) {
      return;
    }

    __update_inherited(section._id).catch(err => N.logger.error(err));
  });


  N.wire.on('init:models', function emit_init_Section() {
    return N.wire.emit('init:models.' + collectionName, Section);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Section(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });


  // Get sections tree, returns hash of nested trees for sections. Structure:
  //
  // _id:
  //   - _id - section `_id`
  //   - parent - link to parent section object
  //   - children[ { _id, parent, children[...] } ]
  //
  let getSectionsTree = memoize(() =>
    N.models.forum.Section
        .find()
        .sort('display_order')
        .select('_id parent is_enabled is_excludable')
        .lean(true)
        .exec()
        .then(sections => {

          // create hash of trees for each section
          let result = {};

          for (let s of sections) result[s._id] = Object.assign({ children: [] }, s);

          // root is a special fake `section` that contains array of the root-level sections
          let root = { children: [], is_enabled: true, is_excludable: false };

          for (let s of Object.values(result)) {
            s.parent = s.parent ? result[s.parent] : root;
            s.parent.children.push(s);
          }

          result.root = root;

          return result;
        }),
    { maxAge: 60000 }
  );


  // Returns list of parent _id-s for given section `_id`
  //
  Section.statics.getParentList = function (sectionID) {
    return getSectionsTree().then(sections => {
      let parentList = [];
      let current = sections[sectionID].parent;

      while (current?._id) {
        parentList.unshift(current._id);
        current = current.parent;
      }

      return parentList;
    });
  };


  // Returns list of child sections, including subsections until the given deepness.
  // Also, sets `level` property for found sections
  //
  // - getChildren((section, deepness)
  // - getChildren(deepness) - for root (on index page)
  // - getChildren() - for all
  //
  // result:
  //
  // - [ {_id, parent, children, is_enabled, is_excluded, level} ]
  //
  Section.statics.getChildren = function (sectionID, deepness) {

    if (arguments.length === 1) {
      deepness = sectionID;
      sectionID = null;
    }

    let children = [];

    function fillChildren(section, curDeepness, maxDeepness) {

      if (maxDeepness >= 0 && curDeepness >= maxDeepness) {
        return;
      }

      section.children.forEach(childSection => {
        children.push(Object.assign({ level: curDeepness }, childSection));
        fillChildren(childSection, curDeepness + 1, maxDeepness);
      });
    }

    return getSectionsTree().then(sections => {
      let storedSection = sections[sectionID || 'root'];

      fillChildren(storedSection, 0, deepness);
      return children;
    });
  };


  // Returns list of all sections user can view
  //
  // Used in:
  //  - N.models.forum.UserTopicCount
  //  - N.models.forum.UserPostCount
  //
  Section.statics.getVisibleSections = memoize(function (g_ids) {
    return getSectionsTree().then(sections => {
      sections = Object.keys(sections).filter(id => id !== 'root');

      let access_env = { params: { sections, user_info: { usergroups: g_ids } } };

      return N.wire.emit('internal:forum.access.section', access_env).then(() =>
        sections.filter((section, i) => access_env.data.access_read[i])
      );
    });
  }, { maxAge: 60000 });


  // Provide a possibility to clear section tree cache (used in seeds)
  //
  Section.statics.getChildren.clear = () => getSectionsTree.clear();


  // Update `last_post`, `last_topic`, `last_user`, `last_ts`, `post_count`,
  // `topic_count` fields in the section cache.
  //
  Section.statics.updateCache = require('./lib/_update_section_cache')(N);
};
