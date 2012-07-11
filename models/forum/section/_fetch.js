"use strict";

/*global nodeca, _*/
var NLib = require('nlib');

var Async = NLib.Vendor.Async;

module.exports = function (schema, options) {
  schema.statics.fetchSections = function(env, options, callback) {

    var result = env.response.data.sections = [];
    var users = env.data.users = env.data.users ? env.data.users : [];

    // ToDo get state conditions from env
    this.find(options, function(err, docs){
      if (err) {
        callback(err);
        return;
      }

      Async.forEach(docs, function(doc, next) {
        doc = doc.toObject();

        if (doc.parent) {
          doc.parent = doc.parent.toString();
        }
        else {
          doc.parent = null;
        }
        var moderators = doc.moderator_list.map(function(user) {
          return user.toString();
        });

        if (doc.cache.real.last_user) {
          doc.cache.real.last_user = doc.cache.real.last_user.toString();
        }
        else {
          doc.cache.real.last_user = null;
        }

        // ToDo replace real for hb users
        var section = {
          _id:              doc._id.toString(),
          id:               doc.id,
          title:            doc.title,
          description:      doc.description,
          parent:           doc.parent,
          parent_id_list:   doc.parent_id_list,
          redirect:         doc.redirect,
          moderators:       moderators,
          thread_count:     doc.cache.real.thread_count,
          post_count:       doc.cache.real.post_count,
          display_order:    doc.display_order,
          last_thread: {
            forum_id:       doc.id,
            title:          doc.cache.real.last_thread_title,
            id:             doc.cache.real.last_thread_id,
            post_id:        doc.cache.real.last_post_id,
            user:           doc.cache.real.last_user,
            ts:             doc.cache.real.last_ts
          }
        };

        if (moderators && _.isArray(moderators)) {
          moderators.forEach(function(user) {
            users.push(user);
          });
        }
        if (section.last_thread.user) {
          users.push(section.last_thread.user);
        }

        result.push(section);
        next();
      }, function(err){
        env.data.sections = result.slice();
        callback(err);
      });
    });
  };
};
