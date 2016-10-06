// Updates a parent and display order of section, also refreshes display orders of sibling sections.
//
// NOTE: This method is used for section/index page.


'use strict';


const _       = require('lodash');
const Promise = require('bluebird');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id:            { format: 'mongo',          required: true },
    parent:         { type: [ 'null', 'string' ], required: true },
    sibling_order:  { type: 'array',            required: false }
  });

  // set parent and display order to sections
  //
  N.wire.on(apiPath, function* section_update(env) {

    let section = yield N.models.forum.Section
                            .findById(env.params._id)
                            .select('parent display_order');

    section.parent = env.params.parent;
    yield section.save();
  });


  // set display order to sibling sections
  //
  N.wire.after(apiPath, function* update_display_orders(env) {

    var _ids = env.params.sibling_order;

    // create hash table for _ids, where array index means display order
    var siblingOrder = {};

    _.forEach(_ids, (value, index) => { siblingOrder[value] = index; });

    let sections = yield N.models.forum.Section
                            .find({ _id: { $in: _ids } })
                            .select('display_order');

    // for each sibling find proper section and set `display_order` to it
    sections.forEach(section => { section.display_order = siblingOrder[section._id]; });

    yield Promise.map(sections, section => section.save());
  });
};
