'use strict';


var _ = require('lodash');


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {

  $('._sortable_tree').nestedSortable({
    listType: 'ul',
    forcePlaceholderSize: true,
    items: '._sortable_tree_item',
    opacity: 0.6,
    revert: 250,
    tabSize: 25,
    doNotClear: true,
    protectRoot: true,
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


N.wire.on('admin.forum.section.destroy', function section_destroy(event) {
  var $item = $(event.currentTarget)
   , $container = $item.closest('._section-container');

  if (!window.confirm(t('message_confim_section_delete', { title: $item.data('title') }))) {
    return;
  }

  N.io.rpc('admin.forum.section.destroy', { _id: $item.data('id') }, function (err) {
    if (err && (N.io.CLIENT_ERROR === err.code) && !_.isEmpty(err.message)) {
      window.alert(err.message);
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
  var $dialog = $(N.runtime.render('admin.forum.section.blocks.moderator_select_dialog', { section_id: sectionId }));

  $dialog.find('input[name=nick]').typeahead({
    valueKey: 'nick',
    remote: N.runtime.router.linkTo('admin.core.user_lookup') + '?nick=%QUERY',
    template: function(user) {
      // Shows full name with entered text highlighting
      var pattern = $dialog.find('input[name=nick]').val();
      return '<p>' + user.name.replace('(' + pattern, '(<strong>' + pattern + '</strong>') + '</p>';
    }
  });

  $dialog.on('shown.bs.modal', function () {
    $(this).find('input[name=nick]').focus();
  });

  $dialog.on('hidden.bs.modal', function () {
    $(this).remove();
  });

  // Show dialog.
  $dialog.appendTo('#content').modal();
});


N.wire.on('admin.forum.section.create_moderator', function section_add_moderator(event) {
  var $dialog = $(event.currentTarget)
    , nick    = $dialog.find('input[name=nick]').val();

  N.io.rpc('admin.core.user_lookup', { nick: nick, strict: true }, function (err, res) {
    if (err) {
      return false; // Invoke standard error handling.
    }

    if (_.isEmpty(res)) {
      N.wire.emit('notify', t('error_no_user_with_such_nick', { nick: nick }));
      return;
    }

    $dialog.modal('hide');

    N.wire.emit('navigate.to', {
      apiPath: 'admin.forum.moderator.edit'
    , params: {
        section_id: $dialog.find('input[name=section_id]').val()
      , user_id:    res[0]._id
      }
    });
  });
});
