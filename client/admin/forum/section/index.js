'use strict';


var _ = require('lodash');


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {
  // Make sections draggable (both section control and children).
  $('.section-control').draggable({
    handle: '.section-handle'
  , revert: 'invalid'
  , helper: 'clone'
  , opacity: 0.5
  , cursor: 'move'
  , start: function () {
      var $group = $(this).parent(); // Get whole .section-group

      $group.addClass('section-dragging');

      // Calculate element offset relative to upper edge of viewport.
      var screenOffsetTop = $(this).offset().top - window.scrollY;
  
      // Show all placeholders except useless (inner and surrounding).
      $('.section-placeholder')
        .not($group.find('.section-placeholder'))
        .not($group.prev('.section-placeholder'))
        .not($group.next('.section-placeholder'))
        .show();

      // After placeholders are shown, restore the offset to prevent jerk effect.
      window.scrollTo(window.scrollX, ($(this).offset().top - screenOffsetTop));
    }
  , stop: function () {
      $(this).parent().removeClass('section-dragging');
      $('.section-placeholder').hide();
    }
  });

  // Make all placeholders (hidden by default) droppable.
  $('.section-placeholder').droppable({
    accept: '.section-control'
  , hoverClass: 'section-placeholder-hover'
  , tolerance: 'pointer'
  , drop: function (event, ui) {
      // Data to update.
      var request = {
        _id:    ui.draggable.data('id')
      , parent: $(this).parents('.section-group:first').children('.section-control').data('id')
      };

      // Compute `display_order` depending on previous and next sibling sections.
      var prev = $(this).prev('.section-group').children('.section-control').data('displayOrder')
        , next = $(this).next('.section-group').children('.section-control').data('displayOrder');

      if ((null !== prev) && (null !== next)) {
        // Between other.
        request.display_order = (Number(prev) + Number(next)) / 2;

      } else if (null !== prev) {
        // After all.
        request.display_order = Number(prev) + 1;

      } else if (null !== next) {
        // Before all.
        request.display_order = Number(next) - 1;

      } else {
        // Single in current children list.
        request.display_order = 1;
      }

      // Move section and it's allied placeholder into new location.
      var $draggableGroup = ui.draggable.parent();

      $draggableGroup.prev('.section-placeholder').insertBefore(this);
      $draggableGroup.insertBefore(this);
      $draggableGroup.children('.section-control').data('displayOrder', request.display_order);

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
  var $control = $(event.currentTarget).parents('.section-control:first')
    , $group   = $control.parent() // .section-group
    , _id      = $control.data('id')
    , title    = $control.find('.section-title').text();

  if (!window.confirm(t('message_confim_section_delete', { title: title }))) {
    return;
  }

  N.io.rpc('admin.forum.section.destroy', { _id: _id }, function (err) {
    if (err && (N.io.CLIENT_ERROR === err.code) && !_.isEmpty(err.message)) {
      window.alert(err.message);
      return;
    }

    if (err) {
      return false; // Invoke standard error handling.
    }

    // Remove all destroyed elements from DOM.
    $group.prev('.section-placeholder').remove();
    $group.remove();
  });
});


N.wire.on('admin.forum.section.select_moderator', function section_select_moderator(event) {
  var sectionId = $(event.currentTarget).parents('.section-control:first').data('id');

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


N.wire.on('admin.forum.section.add_moderator', function section_add_moderator(event) {
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
