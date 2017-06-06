// Popup dialog to show post history
//
'use strict';


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


// Input: array of last post states (text, attachments, author, timestamp)
//
// Output: array of diff descriptions (user, timestamp, html diff)
//
function build_diff(history) {
  const { diff, diff_line } = require('nodeca.core/client/vendor/diff/diff');

  let result = [];

  let initial_src = get_source(history[0]);
  let text_diff = diff(initial_src, initial_src);
  let title_diff;

  if (typeof history[0].title !== 'undefined') {
    title_diff = diff_line(history[0].title, history[0].title);
  }

  // Get first version for this post (no actual diff)
  result.push({
    user:       history[0].user,
    ts:         history[0].ts,
    text_diff,
    title_diff
  });

  for (let revision = 0; revision < history.length - 1; revision++) {
    let old_post = history[revision];
    let new_post = history[revision + 1];
    let title_diff;

    if (typeof old_post.title !== 'undefined' || typeof new_post.title !== 'undefined') {
      if (old_post.title !== new_post.title) {
        title_diff = diff_line(old_post.title, new_post.title);
      }
    }

    let old_src = get_source(old_post);
    let new_src = get_source(new_post);
    let text_diff;

    if (old_src !== new_src) {
      text_diff = diff(get_source(old_post), get_source(new_post));
    }

    result.push({
      user:       new_post.user,
      ts:         new_post.ts,
      text_diff,
      title_diff
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
