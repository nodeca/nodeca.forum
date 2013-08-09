'use strict';


var _ = require('lodash');


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {

  // Make sections draggable (both section control and children).
  $('._section').draggable({
    handle: '._sorter'
  , appendTo: '._container'
  , revert: false
  , helper: 'clone'
  , opacity: 0.5
  , cursor: 'move'
  , start: function () {
      var $container = $(this).parent(); // Get whole parent (ul) of selected item (li)

      // Calculate element offset relative to upper edge of viewport.
      var screenOffsetTop = $(this).offset().top - window.scrollY;

      $container.addClass('_dragged');

      // Show all placeholders except useless (inner and surrounding).
      $('._placeholder')
        .not($container.find('._placeholder'))
        .not($container.prev('._placeholder'))
        .not($container.next('._placeholder'))
        .show();

      // After placeholders are shown, restore the offset to prevent jerk effect.
      window.scrollTo(window.scrollX, ($(this).offset().top - screenOffsetTop));
    }
  , stop: function () {
      $(this).parent().removeClass('_dragged');
      $('._placeholder').hide();
    }
  });

  // Make all placeholders (hidden by default) droppable.
  $('._placeholder').droppable({
    accept: '._section'
  , hoverClass: '_hovered'
  , tolerance: 'pointer'
  , drop: function (event, ui) {
      // Data to update.
      var request = {
        _id:    ui.draggable.data('id')
      , parent: $(this).closest('._section-container').children('._section').data('id')
      };

      // Compute `display_order` depending on previous and next sibling sections.
      var prev = $(this).prev('._section-container').children('._section').data('displayOrder')
        , next = $(this).next('._section-container').children('._section').data('displayOrder')
        , displayOrder;

      if ((null !== prev) && (null !== next)) {
        // Between other.
        displayOrder = (Number(prev) + Number(next)) / 2;

      } else if (null !== prev) {
        // After all.
        displayOrder = Number(prev) + 1;

      } else if (null !== next) {
        // Before all.
        displayOrder = Number(next) - 1;

      } else {
        // Single in current children list.
        displayOrder = 1;
      }

      // Move section and it's allied placeholder into new location.
      var $draggableGroup = ui.draggable.parent();

      $draggableGroup.prev('._placeholder').insertBefore(this);
      $draggableGroup.insertBefore(this);
      $draggableGroup.children('._section').data('displayOrder', displayOrder);

      request.display_order = displayOrder;

      // Send save request.
      N.io.rpc('admin.forum.section.update', request, function (err) {
        if (err) {
          return false; // Invoke standard error handling.
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

  require('users.nick_typeahead')($dialog.find('input[name=nick]'));

  $dialog.on('shown', function () {
    $(this).find('input[name=nick]').focus();
  });

  $dialog.on('hidden', function () {
    $(this).remove();
  });

  // Show dialog.
  $dialog.appendTo('#content').modal();
});


N.wire.on('admin.forum.section.create_moderator', function section_add_moderator(event) {
  var $dialog = $(event.currentTarget)
    , nick    = $dialog.find('input[name=nick]').val();

  N.io.rpc('admin.core.user_lookup', { nick: nick, strict: true }, function (err, response) {
    if (err) {
      return false; // Invoke standard error handling.
    }

    if (_.isEmpty(response.data.users)) {
      N.wire.emit('notify', t('error_no_user_with_such_nick', { nick: nick }));
      return;
    }

    $dialog.modal('hide');

    N.wire.emit('navigate.to', {
      apiPath: 'admin.forum.moderator.edit'
    , params: {
        section_id: $dialog.find('input[name=section_id]').val()
      , user_id:    response.data.users[0]._id
      }
    });
  });
});
