// Fetch images from remote servers and get their size
//
'use strict';


const message_images_fetch = require('nodeca.core/lib/app/message_images_fetch');


module.exports = function (N) {
  N.wire.on('init:jobs', function register_forum_post_images_fetch() {
    message_images_fetch(N, {
      task_name: 'forum_post_images_fetch',
      rebuild:   id => N.wire.emit('internal:forum.post_rebuild', id),
      find:      id => N.models.forum.Post.findById(id)
    });
  });
};
