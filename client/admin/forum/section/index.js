'use strict';


const _          = require('lodash');
const Bloodhound = require('typeahead.js/dist/bloodhound.js');


let $moderatorSelectDialog;
let bloodhound;


require('jqtree');


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {

  $('.aforum-index__scontent').tree({
    data: N.runtime.page_data.sections,
    autoOpen: true,
    dragAndDrop: true,
    onCreateLi(section, $li) {
      $li
        .addClass('aforum-index__slist-item')
        .find('.jqtree-element')
        .html(N.runtime.render('admin.forum.section.blocks.sections_tree_item', {
          section,
          users: N.runtime.page_data.users
        }));
    }
  }).on('tree.move', event => {
    // Wait next tick to ensure node update
    setTimeout(() => {
      let node = event.move_info.moved_node;

      let request = {
        _id: node._id,
        parent: node.parent._id || null,
        sibling_order: node.parent.children.map(child => child._id)
      };

      N.io.rpc('admin.forum.section.update_order', request).catch(err => N.wire.emit('error', err));
    }, 0);
  });
});


N.wire.before('admin.forum.section.destroy', function confirm_section_destroy(data) {
  return N.wire.emit(
    'admin.core.blocks.confirm',
    t('message_confim_section_delete', { title: data.$this.data('title') })
  );
});


N.wire.on('admin.forum.section.destroy', function section_destroy(data) {
  let $container = data.$this.closest('.aforum-index__slist-item');

  return N.io.rpc('admin.forum.section.destroy', { _id: data.$this.data('id') })
    .then(() => {
      // Remove all destroyed elements from DOM.
      $container.prev('._placeholder').remove();
      $container.remove();
    })
    .catch(err => N.wire.emit('notify', { type: 'error', message: err.message }));
});


N.wire.on('admin.forum.section.select_moderator_nick', function section_select_moderator(data) {
  let sectionId = data.$this.data('section_id');

  // Render dialog window.
  $moderatorSelectDialog = $(N.runtime.render('admin.forum.section.blocks.moderator_select_dialog', {
    section_id: sectionId
  }));

  if (!bloodhound) {
    bloodhound = new Bloodhound({
      remote: {
        // Hack to get nick in first param of transport call
        url: '%QUERY',
        wildcard: '%QUERY',
        // Reroute request to rpc
        transport(req, onSuccess, onError) {
          N.io.rpc('admin.core.user_lookup', { nick: req.url, strict: false })
            .then(onSuccess)
            .catch(onError);
        }
      },
      datumTokenizer(d) {
        return Bloodhound.tokenizers.whitespace(d.nick);
      },
      queryTokenizer: Bloodhound.tokenizers.whitespace
    });
    bloodhound.initialize();
  }

  $moderatorSelectDialog.find('input[name=nick]').typeahead(
    {
      highlight: true
    },
    {
      source: bloodhound.ttAdapter(),
      display: 'nick',
      templates: {
        suggestion(user) {
          return '<div>' + _.escape(user.name) + '</div>';
        }
      }
    }
  );

  $moderatorSelectDialog.on('shown.bs.modal', function () {
    $(this).find('input[name=nick]').focus();
  });

  $moderatorSelectDialog.on('hidden.bs.modal', function () {
    $(this).remove();
  });

  // Show dialog.
  $moderatorSelectDialog.appendTo('#content').modal({ backdrop: false });
});


N.wire.on('admin.forum.section.create_moderator', function section_add_moderator(data) {
  let nick = data.fields.nick;

  return N.io.rpc('admin.core.user_lookup', { nick, strict: true }).then(res => {
    if (_.isEmpty(res)) {
      N.wire.emit('notify', t('error_no_user_with_such_nick', { nick }));
      return;
    }

    $moderatorSelectDialog.on('hidden.bs.modal', () => {
      N.wire.emit('navigate.to', {
        apiPath: 'admin.forum.moderator.edit',
        params: {
          section_id: data.fields.section_id,
          user_id: res[0]._id
        }
      });
    }).modal('hide');
  });
});
