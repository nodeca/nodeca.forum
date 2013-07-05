'use strict';

var storageId = 'forum_drafts';

var storageLimit = 10;

var _ = require('lodash');

/*
 * {
 *   type: string,
 *   id: string,
 *   ts: number, // update time
 *   data: mixed // data
 * }
 */

function DraftStorage() {}

DraftStorage.prototype.find = function (id, type) {
  var drafts = JSON.parse(localStorage.getItem(storageId) || '[]');

  drafts = _.filter(drafts, function (entry) {
    return type === entry.type && id === entry.id;
  });

  return drafts.length ? drafts[0].data : null;
};

DraftStorage.prototype.save = function (id, type, data) {
  var drafts = JSON.parse(localStorage.getItem(storageId) || '[]');

  drafts = _.filter(drafts, function (entry) {
    return !(type === entry.type && id === entry.id);
  });

  if (drafts.length >= storageLimit) {
    var older_entry = _.reduce(drafts, function(older_entry, entry){
      return entry.ts < older_entry.ts ? entry : older_entry;
    });
    drafts = _.filter(drafts, function (entry) {
      return !(older_entry.type === entry.type && older_entry.id === entry.id);
    });
  }

  drafts.push({
    type: type,
    id: id,
    ts: new Date().getTime(),
    data: data
  });

  localStorage.setItem(storageId, JSON.stringify(drafts));
};

DraftStorage.prototype.remove = function (id, type) {
  var drafts = JSON.parse(localStorage.getItem(storageId) || '[]');

  drafts = _.filter(drafts, function (entry) {
    return !(type === entry.type && id === entry.id);
  });

  localStorage.setItem(storageId, JSON.stringify(drafts));
};

module.exports = DraftStorage;
