// Search in section
//

'use strict';

const _              = require('lodash');
const bkv            = require('bkv').shared();
const ScrollableList = require('nodeca.core/lib/app/scrollable_list');

const OPTIONS_STORE_KEY = 'search_form_expanded';

// List of the used key names in query string
const query_fields = [ 'hid', 'query', 'type', 'sort', 'period' ];

// - search_params:
//   - hid:              section hid
//   - query:            search query
//   - type:             search type (forum_posts, forum_topics, etc.)
//   - sort:             sort type (`weight` or `ts`)
//   - period:           period in days
//
let search_params = null;
let scrollable_list = null;

function load(start, direction) {
  if (direction !== 'bottom') return null;
  if (!search_params || !search_params.query) return null;

  return N.io.rpc('search.forum_section.results', Object.assign({}, search_params, {
    skip:   start,
    limit:  N.runtime.page_data.items_per_page
  })).then(res => {
    return {
      $html: $(N.runtime.render('search.blocks.' + res.type, res)),
      locals: res,
      offset: start,
      reached_end: res.reached_end
    };
  }).catch(err => {
    N.wire.emit('error', err);
  });
}


N.wire.on('navigate.done:' + module.apiPath, async function form_init() {
  const expanded = await bkv.get(OPTIONS_STORE_KEY);
  if (expanded) $('#search_options').addClass('show');
});

// Execute search if it's defined in query
//
N.wire.on('navigate.done:' + module.apiPath, function page_init(data) {
  search_params = _.pick(data.params.$query, query_fields);

  // Don't set cursor on input - too many side effects on mobiles
  /*// Set cursor to input
  $('.search-form__query')
    .one('focus', function () {
      this.selectionStart = this.selectionEnd = 10000;
    })
    .focus();*/

  // Load results if possible
  if (search_params.query) {
    N.io.rpc('search.forum_section.results', Object.assign({}, search_params, {
      skip:   0,
      limit:  N.runtime.page_data.items_per_page
    })).then(res => {
      res.tabs.forEach(tab => {
        tab.link = N.router.linkTo('search.forum_section', {
          $query: Object.assign({}, search_params, { type: tab.type })
        });
      });

      return N.wire.emit('navigate.content_update', {
        $: $(N.runtime.render(module.apiPath + '.results', res)),
        locals: res,
        $replace: $('.search-results')
      }).then(() => {
        scrollable_list = new ScrollableList({
          N,
          list_selector:               '.search-results__list',
          item_selector:               '.search-result',
          placeholder_bottom_selector: '.search-results__loading-next',
          get_content_id:              item => $(item).data('offset'),
          load,
          reached_top:                 true,
          reached_bottom:              res.reached_end
        });
      });
    }).catch(err => {
      N.wire.emit('error', err);
    });
  }
});


N.wire.on('navigate.exit:' + module.apiPath, function page_teardown() {
  if (scrollable_list) scrollable_list.destroy();
  scrollable_list = null;
  search_params = null;
});


// Toggle form options
//
N.wire.on(module.apiPath + ':search_options', async function do_options() {
  let expanded = !$('#search_options').hasClass('show');

  if (expanded) $('#search_options').collapse('show');
  else $('#search_options').collapse('hide');

  await bkv.set(OPTIONS_STORE_KEY, expanded);
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
