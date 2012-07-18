"use strict";

/*global nodeca, _*/


// Temporary crutch
// ToDo added sections cache
function fetch_sections(env, callback) {
  var Section = nodeca.models.forum.Section;
  env.data.sections = {};

  Section.find().setOptions({lean: true }).exec(function(err, docs) {
    if (!err) {
      docs.forEach(function(section) {
        env.data.sections[section.id] = section;
      });
    }
    callback(err);
  });
}


nodeca.filters.before('forum', function(params, next){
  fetch_sections(this, next);
});
