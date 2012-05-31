"use strict";

/*global nodeca*/

var NLib = require('nlib');

var Async = NLib.Vendor.Async;

module.exports = function (params, next) {
  next();
};

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

nodeca.filters.before('@', function (params, next) {
  var data = this.response.data;

  Async.series([
    function(callback) {
      Section.fetchCategories(function (err, sections) {
        if (!err) {
          data.sections = sections;
        }
        callback(err);
      });
    },
    function(callback) {
      var last_thread_list = _.flatten(data.sections.map(function(category){
        return category.child_list.map(function(forum){
          return forum.last_thread.toString();
        });
      }));
      Thread.fetchThredByIdList(last_thread_list, function(err, threads) {
        if (!err) {
          data.sections.forEach(function(category) {
            category.child_list.forEach(function(forum) {
              forum.last_thread = threads[forum.last_thread];
            });
          });
        }
        console.dir(_.first(data.sections));
        callback(err);
      });
    }
  ], next);
});
