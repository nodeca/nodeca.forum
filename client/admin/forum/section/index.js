'use strict';


var _ = require('lodash');


var MODERATOR_NICK_LOOKUP_DELAY = 500;


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

  var $moderatorSelect = $('#moderator_select');

  // Initizlize modal.
  $moderatorSelect.modal({ show: false });

  $moderatorSelect.on('show', function () {
    $(this).data('sectionId', ''); // Reset section id.
    $(this).find('input[name=nick]').val(''); // Clear input field.
  });

  $moderatorSelect.on('shown', function () {
    $(this).find('input[name=nick]').focus();
  });

  $moderatorSelect.find('input[name=nick]').typeahead({
    minLength: 2
  , source: _.debounce(function (query, process) {
      var self = this;

      N.io.rpc('admin.core.user_lookup', { nick: query }, function (err, response) {
        if (err) {
          return false; // Invoke standard error handling.
        }

        self.lastSourceData = {};

        _.forEach(response.data.users, function (user) {
          self.lastSourceData[user.nick] = user;
        });

        process(_.pluck(response.data.users, 'nick'));
      });
    }, MODERATOR_NICK_LOOKUP_DELAY)
  , matcher: function () {
      // Server method only returns appropriate users.
      return true;
    }
  , highlighter: function (item) {
      // Show full name in popup list.
      return this.lastSourceData[item]._uname;
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
  var $sectionControl  = $(event.currentTarget).parents('.section-control:first')
    , $moderatorSelect = $('#moderator_select');

  $moderatorSelect.modal('show');
  $moderatorSelect.data('sectionId', $sectionControl.data('id'));
});


N.wire.on('admin.forum.section.add_moderator', function section_add_moderator(event) {
  var $moderatorSelect = $(event.currentTarget)
    , nick             = $moderatorSelect.find('input[name=nick]').val();

  N.io.rpc('admin.core.user_lookup', { nick: nick, strict: true }, function (err, response) {
    if (err) {
      return false; // Invoke standard error handling.
    }

    if (_.isEmpty(response.data.users)) {
      N.wire.emit('notify', t('error_no_user_with_such_nick', { nick: nick }));
      return;
    }

    $moderatorSelect.modal('hide');

    N.wire.emit('navigate.to', {
      apiPath: 'admin.forum.moderator.edit'
    , params: {
        section_id: $moderatorSelect.data('sectionId')
      , user_id:    response.data.users[0]._id
      }
    });
  });
});
