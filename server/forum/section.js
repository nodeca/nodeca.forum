"use strict";

/*global nodeca*/

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

var forum_breadcrumbs = require('../../lib/widgets/breadcrumbs.js').forum;


nodeca.filters.before('@', function (params, next) {
  // ToDo fetch users
  next();
});

nodeca.filters.before('@', function (params, next) {
  var data = this.data;

  // ToDo add sorting and pagination
  Thread.fetchThredsByForumId(params.id, function (err, threads) {
    data.threads = threads;
    next(err);
  });
});

module.exports = function (params, next) {
  var data = this.response.data;

  // ToDo hb users check
  var thread_count = this.data.sections[params.id].cache.counters.thread_count;
  data.forum = {
    id: params.id,
    title: this.data.sections[params.id].title,
    thread_count: thread_count
  };

  data.threads = this.data.threads.map(function(thread) {
    // ToDo check permissions
    var doc = thread._doc;
    doc._id = doc._id.toString();
    return {
      _id:              doc._id,
      id:               doc.id,
      title:            doc.title,
      prefix:           doc.prefix,
      forum_id:         doc.cache.forum_id,
      post_count:       doc.cache.counters.post_count,
      views_count:      doc.cache.counters.views_count,

      first_post: {
        first_post_id:  doc.cache.counters.first_post_id,
        first_user:     doc.cache.counters.first_user,
        first_ts:       doc.cache.counters.first_ts

      },
      last_post: {
        last_post_id:   doc.cache.counters.last_post_id,
        last_user:      doc.cache.counters.last_user,
        last_ts:        doc.cache.counters.last_ts
      }
    };

  });
  next();
};


nodeca.filters.after('@', function (params, next) {
  var data = this.data;

  var parents = [];
  var forum = this.data.sections[params.id];
  forum.cache.parent_id_list.forEach(function(parent) {
    parents.push(data.sections[parent]);
  });

  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this, parents);
  next();
});
