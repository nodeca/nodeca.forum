'use strict';


var _ = require('lodash');


N.wire.on('navigate.done:' + module.apiPath, function () {
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
      // Move section and it's allied placeholder into new location.
      ui.draggable.parent().prev().filter('.section-placeholder').insertBefore(this);
      ui.draggable.parent().insertBefore(this);

      var self   = this
        , _id    = ui.draggable.data('id')
        , parent = $(this).parents('.section-group:first').children('.section-control').data('id');

      N.io.rpc('admin.forum.section.update', { _id: _id, parent: parent }, function (err) {
        if (err) {
          return false; // Invoke standard error handling.
        }

        _.forEach($(self).siblings('.section-group'), function (section, index) {
          N.io.rpc('admin.forum.section.update', {
            _id: $(section).children('.section-control').data('id')
          , display_order: index
          });
        });
      });
    }
  });
});
