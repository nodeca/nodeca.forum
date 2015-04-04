// Updates a parent and display order of section, also refreshes display orders of sibling sections.
//
// NOTE: This method is used for section/index page.


'use strict';


var _ = require('lodash');
var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id:            { format: 'mongo',          required: true },
    parent:         { type: [ 'null', 'string' ], required: true },
    sibling_order:  { type: 'array',            required: false }
  });

  // set parent and display order to sections
  //
  N.wire.on(apiPath, function section_update(env, callback) {

    N.models.forum.Section
      .findById(env.params._id)
      .select('parent display_order')
      .exec(function (err, section) {

      if (err) {
        callback(err);
        return;
      }

      section.parent = env.params.parent;
      section.save(callback);
    });
  });

  // set display order to sibling sections
  //
  N.wire.after(apiPath, function update_display_orders(env, callback) {

    var _ids = env.params.sibling_order;

    // create hash table for _ids, where array index means display order
    var siblingOrder = {};
    _.forEach(_ids, function (value, index) {
      siblingOrder[value] = index;
    });

    N.models.forum.Section
      .find({ _id: { $in: _ids } })
      .select('display_order')
      .exec(function (err, sections) {

      if (err) {
        callback(err);
        return;
      }

      // for each sibling find proper section and set `display_order` to it
      async.each(sections, function (section, cb) {
        section.display_order = siblingOrder[section._id];
        section.save(cb);

      }, callback);
    });
  });
};
