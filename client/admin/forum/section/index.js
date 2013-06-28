'use strict';


N.wire.on('navigate.done:' + module.apiPath, function () {
  // Make sections draggable (both section control and children).
  $('.section-group').draggable({
    handle: '.section-handle'
  , revert: 'invalid'
  , helper: 'clone'
  , opacity: 0.5
  , cursor: 'move'
  , start: function () {
      var $this = $(this);

      $this.addClass('section-dragging');

      // To scroll window:
      // - WebKit-based browsers and the quirks mode use `body` element.
      // - Other browsers use `html` element.
      var screenOffsetTop;
  
      // Calculate element offset relative to upper edge of viewport.
      if (document.documentElement.scrollTop) {
        screenOffsetTop = $this.offset().top - document.documentElement.scrollTop;
      } else if (document.body.scrollTop) {
        screenOffsetTop = $this.offset().top - document.body.scrollTop;
      }

      // Show all placeholders except useless (inner and surrounding).
      $('.section-placeholder')
        .not($this.find('.section-placeholder'))
        .not($this.prev('.section-placeholder'))
        .not($this.next('.section-placeholder'))
        .show();

      // After placeholders are shown, restore the offset to prevent jerk effect.
      if (document.documentElement.scrollTop) {
        document.documentElement.scrollTop = $this.offset().top - screenOffsetTop;
      } else if (document.body.scrollTop) {
        document.body.scrollTop = $this.offset().top - screenOffsetTop;
      }
    }
  , stop: function () {
      $(this).removeClass('section-dragging');
      $('.section-placeholder').hide();
    }
  });

  // Make all placeholders (hidden by default) droppable.
  $('.section-placeholder').droppable({
    accept: '.section-group'
  , hoverClass: 'section-placeholder-hover'
  , tolerance: 'pointer'
  , drop: function (event, ui) {
      // Move section and it's allied placeholder into new location.
      ui.draggable.prev().filter('.section-placeholder').insertBefore(this);
      ui.draggable.insertBefore(this);
    }
  });
});
