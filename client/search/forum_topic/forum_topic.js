// Search in topic
//

'use strict';

const _    = require('lodash');
const bag  = require('bagjs')({ prefix: 'nodeca' });

// A delay after failed xhr request (delay between successful requests
// is set with affix `throttle` argument)
//
// For example, suppose user continuously scrolls. If server is up, each
// subsequent request will be sent each 100 ms. If server goes down, the
// interval between request initiations goes up to 2000 ms.
//
const LOAD_AFTER_ERROR = 2000;

const OPTIONS_STORE_KEY = 'search_form_expanded';

// List of the used key names in query string
const query_fields = [ 'hid', 'query', 'type', 'sort', 'period' ];

// - search:
//   - hid:              topic hid
//   - query:            search query
//   - type:             search type (forum_posts, forum_topics, etc.)
//   - sort:             sort type (`weight` or `ts`)
//   - period:           period in days
// - reached_end:        true if no more results exist below last loaded result
// - next_loading_start: time when current xhr request for the next page is started
// - bottom_marker:      offset of the last loaded result
//
let pageState = {};

N.wire.on('navigate.done:' + module.apiPath, function form_init() {
  return bag.get(OPTIONS_STORE_KEY).then(expanded => {
    if (expanded) $('#search_options').addClass('show');
  });
});

// Execute search if it's defined in query
//
N.wire.on('navigate.done:' + module.apiPath, function page_init(data) {
  let parsed = data.params.$query;

  pageState.search             = _.pick(parsed, query_fields);
  pageState.reached_end        = false;
  pageState.next_loading_start = 0;
  pageState.bottom_marker      = 0;

  // Don't set cursor on input - too many side effects on mobiles
  /*// Set cursor to input
  $('.search-form__query')
    .one('focus', function () {
      this.selectionStart = this.selectionEnd = 10000;
    })
    .focus();*/

  // Load results if possible
  if (pageState.search.query) {
    pageState.next_loading_start = Date.now();

    let items_per_page = N.runtime.page_data.items_per_page;

    N.io.rpc('search.forum_topic.results', _.assign({}, pageState.search, {
      skip:   0,
      limit:  items_per_page
    })).then(function (res) {
      pageState.bottom_marker += items_per_page;
      pageState.reached_end = res.reached_end;

      // reset lock
      pageState.next_loading_start = 0;

      return N.wire.emit('navigate.update', {
        $: $(N.runtime.render(module.apiPath + '.results', res)),
        locals: res,
        $replace: $('.search-results')
      });
    }).catch(err => {
      N.wire.emit('error', err);
    });
  }
});


// Toggle form options
//
N.wire.on(module.apiPath + ':search_options', function do_options() {
  return bag.get(OPTIONS_STORE_KEY).then(expanded => {
    expanded = !expanded;

    if (expanded) $('#search_options').collapse('show');
    else $('#search_options').collapse('hide');

    return bag.set(OPTIONS_STORE_KEY, expanded);
  });
});


// Perform search after user clicks on "search" button
//
N.wire.on(module.apiPath + ':search', function do_search(data) {
  // Do nothing on empty field. Useful when user change
  // options with empty query
  if (!data.fields.query.length) return;

  return N.wire.emit('navigate.to', {
    apiPath: module.apiPath,
    params: { $query: _.pick(data.fields, query_fields) }
  });
});


// Fetch more results when user scrolls down
//
N.wire.on(module.apiPath + ':load_next', function load_next() {
  if (!pageState.search.query) return;
  if (pageState.reached_end) return;

  let now = Date.now();

  // `next_loading_start` is the last request start time, which is reset to 0 on success
  //
  // Thus, successful requests can restart immediately, but failed ones
  // will have to wait `LOAD_AFTER_ERROR` ms.
  //
  if (Math.abs(pageState.next_loading_start - now) < LOAD_AFTER_ERROR) return;

  pageState.next_loading_start = now;

  let items_per_page = N.runtime.page_data.items_per_page;

  N.io.rpc('search.forum_topic.results', _.assign({}, pageState.search, {
    skip:   pageState.bottom_marker,
    limit:  items_per_page
  })).then(function (res) {
    pageState.reached_end = res.reached_end;

    // if last search result is loaded, hide bottom placeholder
    if (pageState.reached_end) {
      $('.search-results__loading-next').addClass('hidden-xs-up');
    }

    pageState.bottom_marker += items_per_page;

    // reset lock
    pageState.next_loading_start = 0;

    if (!res.results.length) return;

    return N.wire.emit('navigate.update', {
      $: $(N.runtime.render(module.apiPath + '.' + res.type, res)),
      locals: res,
      $after: $('.search-results__list > :last')
    });
  }).catch(err => {
    N.wire.emit('error', err);
  });
});
