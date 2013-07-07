// Simple key/value drafts store API. Use localstore for persistance
//

'use strict';

var _ = require('lodash');

var storageKey = 'drafts';
var storageLimit = 10;

////////////////////////////////////////////////////////////////////////////////
// Safe localstore interface helpers

var store = {};

store.exists = _.memoize(function () {
  try {
    localStorage.setItem('__ls_test__','__ls_test__');
    localStorage.removeItem('__ls_test__');
    return true;

  } catch (e) {
    return false;
  }
});

store.remove = function (key) {
  if (!store.exists()) { return; }
  localStorage.removeItem(key);
};

store.set = function (key, value) {
  if (!store.exists()) { return; }
  if (value === undefined) { return store.remove(key); }
  localStorage.setItem(key, JSON.stringify(value));
};

store.get = function (key) {
  if (!store.exists()) { return undefined; }
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) {
    return undefined;
  }
};

////////////////////////////////////////////////////////////////////////////////
// Drafts interface

var draft = {};

draft.find = function (id) {
  var drafts = store.get(storageKey);

  if (!_.isArray(drafts)) { drafts = []; }

  var result = _.find(drafts, function (entry) { return id === entry.id; }) || {};

  return result.data;
};

draft.save = function (id, data) {
  var drafts = store.get(storageKey);

  if (!_.isArray(drafts)) { drafts = []; }

  // Remove existing draft if exists
  drafts = _.filter(drafts, function (entry) { return id !== entry.id; });

  // Cut head (remove oldest elements)
  drafts.splice(0, drafts.length - storageLimit);

  drafts.push({
    id: id,
    data: data
  });

  store.set(storageKey, drafts);
};

draft.remove = function (id) { store.remove(id); };

module.exports = draft;
