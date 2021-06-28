// Register 'forum_sections' special setting values fetcher.
// Allows to use `values: forum_sections` in setting definitions.
//
'use strict';


module.exports = function (N) {

  N.wire.before('init:settings', function settings_forum_sections_fetcher_setup() {

    // Fill items recursive
    //
    function fill_items(sections, parent, depth){
      parent = parent || null;
      depth = depth || 0;

      let items = [];

      sections.filter(section => String(section.parent || null) === String(parent)).forEach(section => {
        let name = `| ${'-'.repeat(depth)} ${section.title}`;

        items.push({ value: section._id, name });
        items = items.concat(fill_items(sections, section._id, depth + 1));
      });

      return items;
    }


    N.settings.customizers.forum_sections = function fetch_forum_sections() {
      return N.models.forum.Section.find()
                .sort('display_order')
                .select('_id title parent')
                .lean(true)
                .then(sections => fill_items(sections))
                .then(items => {
                  items.unshift({ value: '', name: '-' });
                  return items;
                });
    };
  });
};
