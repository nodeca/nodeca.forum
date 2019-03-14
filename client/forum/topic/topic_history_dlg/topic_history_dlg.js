// Popup dialog to show topic history
//
'use strict';


const topicStatuses = '$$ JSON.stringify(N.models.forum.Topic.statuses) $$';

let $dialog;


// Load dependencies
//
N.wire.before(module.apiPath, function load_deps() {
  return N.loader.loadAssets('vendor.diff');
});


function has_status(status_set, st) {
  return status_set.st === st || status_set.ste === st;
}


// Detect changes in topic statuses
//
// Input:
//  - old_topic - topic object before changes
//  - new_topic - topic object after changes
//
// Output: an array of actions that turn old_topic into new_topic
//
// Example: if old_topic={st:OPEN}, new_topic={st:CLOSED}
// means user has closed this topic
//
// Because subsequent changes are merged, it may output multiple actions,
// e.g. if old_topic={st:OPEN}, new_topic={st:PINNED,ste:CLOSED},
// actions should be pin and close
//
// If either old or new state is deleted, we also need to check prev_st
// for that state to account for merges, e.g.
// old_topic={st:OPEN}, new_topic={st:DELETED,prev_st:{st:CLOSED}} means
// that topic was first closed than deleted
//
// In some cases only prev_st may be changed, e.g.
// old_topic={st:DELETED,prev_st:{st:OPEN}}, new_topic={st:DELETED,prev_st:{st:CLOSED}},
// so we assume that user restored, closed, then deleted topic
//
// It is also possible that st, ste and prev_st are all the same,
// but del_reason is changed (so topic was restored then deleted with a different reason).
//
function get_status_actions(new_topic, old_topic = {}) {
  let old_st = { st: old_topic.st, ste: old_topic.ste };
  let new_st = { st: new_topic.st, ste: new_topic.ste };
  let old_is_deleted = false;
  let new_is_deleted = false;
  let result = [];

  if (has_status(old_st, topicStatuses.DELETED) || has_status(old_st, topicStatuses.DELETED_HARD)) {
    old_st = old_topic.prev_st;
    old_is_deleted = true;
  }

  if (has_status(new_st, topicStatuses.DELETED) || has_status(new_st, topicStatuses.DELETED_HARD)) {
    new_st = new_topic.prev_st;
    new_is_deleted = true;
  }

  if (!has_status(old_st, topicStatuses.PINNED) && has_status(new_st, topicStatuses.PINNED)) {
    result.push([ 'pin' ]);
  }

  if (!has_status(old_st, topicStatuses.CLOSED) && has_status(new_st, topicStatuses.CLOSED)) {
    result.push([ 'close' ]);
  }

  if (has_status(old_st, topicStatuses.PINNED) && !has_status(new_st, topicStatuses.PINNED)) {
    result.push([ 'unpin' ]);
  }

  if (has_status(old_st, topicStatuses.CLOSED) && !has_status(new_st, topicStatuses.CLOSED)) {
    result.push([ 'open' ]);
  }

  if (old_is_deleted || new_is_deleted) {
    if (old_topic.st !== new_topic.st || old_topic.del_reason !== new_topic.del_reason || result.length > 0) {
      if (old_is_deleted) {
        result.unshift([ 'undelete' ]);
      }

      if (new_is_deleted) {
        /* eslint-disable max-depth */
        if (new_topic.st === topicStatuses.DELETED_HARD) {
          result.push([ 'hard_delete', new_topic.del_reason ]);
        } else {
          result.push([ 'delete', new_topic.del_reason ]);
        }
      }
    }
  }

  return result;
}


// Input: array of last post states (post, author, timestamp, etc.)
//
// Output: array of diff descriptions (user, timestamp, html diff, etc.)
//
function build_diff(history) {
  const { diff_line } = require('nodeca.core/client/vendor/diff/diff');

  let result = [];
  let title_diff = diff_line(history[0].topic.title, history[0].topic.title);

  //
  // Detect changes in topic or post statuses squashed with first changeset
  // (e.g. topic deleted by author immediately after it's created)
  //
  let actions = [];

  actions = actions.concat(get_status_actions(history[0].topic));

  // Get first version for this post (no actual diff)
  result.push({
    user:       history[0].meta.user,
    ts:         history[0].meta.ts,
    role:       history[0].meta.role,
    title_diff,
    actions
  });

  for (let revision = 0; revision < history.length - 1; revision++) {
    let old_revision = history[revision];
    let new_revision = history[revision + 1];
    let title_diff;

    if (old_revision.topic.title !== new_revision.topic.title) {
      title_diff = diff_line(old_revision.topic.title, new_revision.topic.title);
    }

    let actions = [];

    if (old_revision.topic.section !== new_revision.topic.section) {
      actions.push([ 'move', old_revision.topic.section, new_revision.topic.section ]);
    }

    actions = actions.concat(get_status_actions(new_revision.topic, old_revision.topic));

    result.push({
      user:       new_revision.meta.user,
      ts:         new_revision.meta.ts,
      role:       new_revision.meta.role,
      title_diff,
      actions
    });
  }

  return result;
}


// Init dialog
//
N.wire.on(module.apiPath, function show_post_history_dlg(params) {
  params.entries = build_diff(params.history);

  $dialog = $(N.runtime.render(module.apiPath, params));
  $('body').append($dialog);

  return new Promise(resolve => {
    $dialog
      .on('shown.bs.modal', function () {
        $dialog.find('.btn-secondary').focus();
      })
      .on('hidden.bs.modal', function () {
        // When dialog closes - remove it from body and free resources.
        $dialog.remove();
        $dialog = null;
        resolve();
      })
      .modal('show');
  });
});


// Close dialog on sudden page exit (if user click back button in browser)
//
N.wire.on('navigate.exit', function teardown_page() {
  if ($dialog) {
    $dialog.modal('hide');
  }
});
