'use strict';


var _ = require('lodash');


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

      N.io.rpc('admin.forum.section.update_order', request, function (err) {
        if (err) {
          return false;
        }
      });
    }
  });
});


N.wire.before('admin.forum.section.destroy', function confirm_section_destroy(event, callback) {
  N.wire.emit(
    'admin.core.blocks.confirm',
    t('message_confim_section_delete', { title: $(event.target).data('title') }),
    callback
  );
});


N.wire.on('admin.forum.section.destroy', function section_destroy(event) {
  var $item = $(event.target)
   , $container = $item.closest('.aforum-index__slist-item');

  N.io.rpc('admin.forum.section.destroy', { _id: $item.data('id') }, function (err) {
    if (err && (N.io.CLIENT_ERROR === err.code) && !_.isEmpty(err.message)) {
      N.wire.emit('notify', { type: 'error', message: err.message });
      return;
    }

    if (err) {
      return false; // Invoke standard error handling.
    }

    // Remove all destroyed elements from DOM.
    $container.prev('._placeholder').remove();
    $container.remove();
  });
});


N.wire.on('admin.forum.section.select_moderator_nick', function section_select_moderator(event) {
  var sectionId = $(event.currentTarget).data('section_id');

  // Render dialog window.
  $moderatorSelectDialog = $(N.runtime.render('admin.forum.section.blocks.moderator_select_dialog', { section_id: sectionId }));

  if (!bloodhound) {
    bloodhound = new Bloodhound({
      remote: {
        // Hack to get nick in first param of transport call
        url: '%QUERY',
        transport: function (url, o, onSuccess, onError) {
          N.io.rpc('admin.core.user_lookup', { nick: url, strict: false }, function (err, res) {
            if (err) {
              onError();
              return;
            }
            onSuccess(res);
          });
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


N.wire.on('admin.forum.section.create_moderator', function section_add_moderator(form) {
  var nick = form.fields.nick;

  N.io.rpc('admin.core.user_lookup', { nick: nick, strict: true }, function (err, res) {
    if (err) {
      return false; // Invoke standard error handling.
    }

    if (_.isEmpty(res)) {
      N.wire.emit('notify', t('error_no_user_with_such_nick', { nick: nick }));
      return;
    }

    $moderatorSelectDialog.on('hidden.bs.modal', function () {
      N.wire.emit('navigate.to', {
        apiPath: 'admin.forum.moderator.edit'
        , params: {
          section_id: form.fields.section_id
          , user_id: res[0]._id
        }
      });
    }).modal('hide');
  });
});
