'use strict';


var _          = require('lodash');
var Bloodhound = window.Bloodhound;

var $moderatorSelectDialog;
var bloodhound;


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {

  $('._sortable_tree').nestedSortable({
    listType: 'ul',
    forcePlaceholderSize: true,
    items: '._sortable_tree_item',
    placeholder: 'aforum-index__section-placeholder',
    opacity: 0.6,
    revert: 250,
    tabSize: 25,
    doNotClear: true,
    isTree: true,
    expandOnHover: 700,
    stop: function(event, ui) {

      var request = {
        _id:           ui.item.data('id')
      , parent:        ui.item.parents('._sortable_tree_item').data('id')
      , sibling_order: _.map(ui.item.parent().children('._sortable_tree_item'), function(child) {
          // calculate new data order for each sibling of the current sections
          return $(child).data('id');
        })
      };

      N.io.rpc('admin.forum.section.update_order', request);
    }
  });
});


N.wire.before('admin.forum.section.destroy', function confirm_section_destroy(data, callback) {
  N.wire.emit(
    'admin.core.blocks.confirm',
    t('message_confim_section_delete', { title: data.$this.data('title') }),
    callback
  );
});


N.wire.on('admin.forum.section.destroy', function section_destroy(data) {
  var $container = data.$this.closest('.aforum-index__slist-item');

  N.io.rpc('admin.forum.section.destroy', { _id: data.$this.data('id') })
    .done(function () {
      // Remove all destroyed elements from DOM.
      $container.prev('._placeholder').remove();
      $container.remove();
    })
    .fail(function (err) {
      N.wire.emit('notify', { type: 'error', message: err.message });
    });
});


N.wire.on('admin.forum.section.select_moderator_nick', function section_select_moderator(data) {
  var sectionId = data.$this.data('section_id');

  // Render dialog window.
  $moderatorSelectDialog = $(N.runtime.render('admin.forum.section.blocks.moderator_select_dialog', {
    section_id: sectionId
  }));

  if (!bloodhound) {
    bloodhound = new Bloodhound({
      remote: {
        // Hack to get nick in first param of transport call
        url: '%QUERY',
        transport: function (url, o, onSuccess, onError) {
          N.io.rpc('admin.core.user_lookup', { nick: url, strict: false }).done(onSuccess).fail(onError);
        }
      },
      datumTokenizer: function(d) {
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
      displayKey: 'nick',
      templates: {
        suggestion: function (user) {
          return user.name;
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
  var nick = data.fields.nick;

  N.io.rpc('admin.core.user_lookup', { nick: nick, strict: true }).done(function (res) {
    if (_.isEmpty(res)) {
      N.wire.emit('notify', t('error_no_user_with_such_nick', { nick: nick }));
      return;
    }

    $moderatorSelectDialog.on('hidden.bs.modal', function () {
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
