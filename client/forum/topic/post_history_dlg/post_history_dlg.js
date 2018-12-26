// Popup dialog to show post history
//
'use strict';


const _             = require('lodash');
const topicStatuses = '$$ JSON.stringify(N.models.forum.Topic.statuses) $$';
const postStatuses  = '$$ JSON.stringify(N.models.forum.Post.statuses) $$';

let $dialog;


// Load dependencies
//
N.wire.before(module.apiPath, function load_deps() {
  return N.loader.loadAssets('vendor.diff');
});


// Concatenate post and attachment info into diffable string
//
function get_source(post) {
  let result = post.md;

  // make sure source ends with newline
  result = result.replace(/\n?$/, '\n');

  // add attachments
  if (post.tail.length) {
    result += '\n';
    result += post.tail.map(function (item) {
      return '![](' + N.router.linkTo('core.gridfs', { bucket: item.media_id }) + ')';
    }).join('\n');
    result += '\n';
  }

  return result;
}


// Detect changes in topic statuses
//
function get_topic_status_actions(old_statuses, new_statuses, new_revision) {
  let added_st = _.difference(new_statuses, old_statuses).map(st => {
    switch (st) {
      case topicStatuses.DELETED:
        return [ 'topic_delete', new_revision.topic.del_reason ];

      case topicStatuses.DELETED_HARD:
        return [ 'topic_hard_delete', new_revision.topic.del_reason ];

      case topicStatuses.PINNED:
        return [ 'topic_pin' ];

      case topicStatuses.CLOSED:
        return [ 'topic_close' ];

      default: // no message
        return null;
    }
  });

  let removed_st = _.difference(old_statuses, new_statuses).map(st => {
    switch (st) {
      case topicStatuses.DELETED:
      case topicStatuses.DELETED_HARD:
        return [ 'topic_undelete' ];

      case topicStatuses.PINNED:
        return [ 'topic_unpin' ];

      case topicStatuses.CLOSED:
        return [ 'topic_open' ];

      default: // no message
        return null;
    }
  });

  return added_st.concat(removed_st).filter(Boolean);
}


// Detect changes in post statuses
//
function get_post_status_actions(old_statuses, new_statuses, new_revision) {
  let added_st = _.difference(new_statuses, old_statuses).map(st => {
    switch (st) {
      case postStatuses.DELETED:
        return [ 'post_delete', new_revision.post.del_reason ];

      case postStatuses.DELETED_HARD:
        return [ 'post_hard_delete', new_revision.post.del_reason ];

      default: // no message
        return null;
    }
  });

  let removed_st = _.difference(old_statuses, new_statuses).map(st => {
    switch (st) {
      case postStatuses.DELETED:
      case postStatuses.DELETED_HARD:
        return [ 'post_undelete' ];

      default: // no message
        return null;
    }
  });

  return added_st.concat(removed_st).filter(Boolean);
}


// Input: array of last post states (text, attachments, author, timestamp)
//
// Output: array of diff descriptions (user, timestamp, html diff)
//
function build_diff(history) {
  const { diff, diff_line } = require('nodeca.core/client/vendor/diff/diff');

  let result = [];

  let initial_src = get_source(history[0].post);
  let text_diff = diff(initial_src, initial_src);
  let title_diff;

  if (history[0].topic) {
    title_diff = diff_line(history[0].topic.title, history[0].topic.title);
  }

  //
  // Detect changes in topic or post statuses squashed with first changeset
  // (e.g. topic deleted by author immediately after it's created)
  //
  let actions = [];

  if (history[0].topic) {
    let new_topic_statuses = [
      history[0].topic.st,
      history[0].topic.ste,
      history[0].topic.prev_st && history[0].topic.prev_st.st,
      history[0].topic.prev_st && history[0].topic.prev_st.ste
    ].filter(st => !_.isNil(st));

    actions = actions.concat(get_topic_status_actions([], new_topic_statuses, history[0]));
  }

  let new_post_statuses = [
    history[0].post.st,
    history[0].post.ste,
    history[0].post.prev_st && history[0].post.prev_st.st,
    history[0].post.prev_st && history[0].post.prev_st.ste
  ].filter(st => !_.isNil(st));

  actions = actions.concat(get_post_status_actions([], new_post_statuses, history[0]));

  // Get first version for this post (no actual diff)
  result.push({
    user:       history[0].meta.user,
    ts:         history[0].meta.ts,
    role:       history[0].meta.role,
    text_diff,
    title_diff,
    actions
  });

  for (let revision = 0; revision < history.length - 1; revision++) {
    let old_revision = history[revision];
    let new_revision = history[revision + 1];
    let title_diff;

    if (old_revision.topic && new_revision.topic && old_revision.topic.title !== new_revision.topic.title) {
      title_diff = diff_line(old_revision.topic.title, new_revision.topic.title);
    }

    let old_src = get_source(old_revision.post);
    let new_src = get_source(new_revision.post);
    let text_diff;

    if (old_src !== new_src) {
      text_diff = diff(old_src, new_src);
    }

    let actions = [];

    if (old_revision.topic && new_revision.topic) {
      if (old_revision.topic.section !== new_revision.topic.section) {
        actions.push([ 'topic_move', old_revision.topic.section, new_revision.topic.section ]);
      }

      let old_topic_statuses = [
        old_revision.topic.st,
        old_revision.topic.ste,
        old_revision.topic.prev_st && old_revision.topic.prev_st.st,
        old_revision.topic.prev_st && old_revision.topic.prev_st.ste
      ].filter(st => !_.isNil(st));

      let new_topic_statuses = [
        new_revision.topic.st,
        new_revision.topic.ste,
        new_revision.topic.prev_st && new_revision.topic.prev_st.st,
        new_revision.topic.prev_st && new_revision.topic.prev_st.ste
      ].filter(st => !_.isNil(st));

      actions = actions.concat(get_topic_status_actions(old_topic_statuses, new_topic_statuses, new_revision));

      // user restores deleted topic and deletes it again with different reason
      /* eslint-disable max-depth */
      if (old_revision.topic.st === new_revision.topic.st) {
        if (new_revision.topic.st === topicStatuses.DELETED || new_revision.topic.st === topicStatuses.DELETED_HARD) {
          if (new_revision.topic.del_reason !== old_revision.topic.del_reason) {
            actions.push([ 'topic_undelete' ]);
            actions.push([ 'topic_delete', new_revision.topic.del_reason ]);
          }
        }
      }
    }

    let old_post_statuses = [
      old_revision.post.st,
      old_revision.post.ste,
      old_revision.post.prev_st && old_revision.post.prev_st.st,
      old_revision.post.prev_st && old_revision.post.prev_st.ste
    ].filter(st => !_.isNil(st));

    let new_post_statuses = [
      new_revision.post.st,
      new_revision.post.ste,
      new_revision.post.prev_st && new_revision.post.prev_st.st,
      new_revision.post.prev_st && new_revision.post.prev_st.ste
    ].filter(st => !_.isNil(st));

    actions = actions.concat(get_post_status_actions(old_post_statuses, new_post_statuses, new_revision));

    // user restores deleted post and deletes it again with different reason
    if (old_revision.post.st === new_revision.post.st) {
      if (new_revision.post.st === postStatuses.DELETED || new_revision.post.st === postStatuses.DELETED_HARD) {
        if (new_revision.post.del_reason !== old_revision.post.del_reason) {
          actions.push([ 'post_undelete' ]);
          actions.push([ 'post_delete', new_revision.post.del_reason ]);
        }
      }
    }

    result.push({
      user:       new_revision.meta.user,
      ts:         new_revision.meta.ts,
      role:       new_revision.meta.role,
      text_diff,
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
