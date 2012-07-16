"use strict";

/*global nodeca, _*/


// Temporary crutch
// ToDo added sections cache
function fetch_sections(env, callback) {
  var Section = nodeca.models.forum.Section;
  env.data.sections = {};

  Section.find({}, function(err, docs) {
    if (!err) {
      docs.forEach(function(section) {
        env.data.sections[section.id] = section.toObject();
      });
    }
    callback(err);
  });
}


// fetch_sections fired before each controllers in forum/admin.forum
nodeca.filters.before('admin.forum', function(params, next){
  fetch_sections(this, next);
});

nodeca.filters.before('forum', function(params, next){
  fetch_sections(this, next);
});
