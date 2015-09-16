// Generate snippets for forum posts
//

'use strict';


var $      = require('nodeca.core/lib/parser/cheequery');
var render = require('nodeca.core/lib/system/render/common');


module.exports = function (N) {

  var MAX_TEXT_LENGTH = 500;

  // Convert html content to a short snippet
  //
  //  1. remove all top-level block tags except paragraphs (block quotes, video players, etc.)
  //  2. merge all paragraphs into one
  //  3. replace images with their alt tags
  //  4. limit the total text length of the resulting paragraph (not counting tags)
  //
  function shorten(html) {
    var source = $('<div>').html(html);
    var result = $('<div>');
    var length = 0;
    var ellipsis = false;

    // remove all child elements above MAX_TEXT_LENGTH limit
    function limit_length(node) {
      node.contents().each(function () {
        if (length >= MAX_TEXT_LENGTH) {
          if (!ellipsis) {
            ellipsis = true;
            $(this).replaceWith('…');
          } else {
            $(this).remove();
          }

          return;
        }

        if (this.type === 'text') {
          length += this.data.length;

          if (length > MAX_TEXT_LENGTH) {
            this.data = this.data.slice(0, MAX_TEXT_LENGTH - length) + '…';
            ellipsis = true;
          }
        } else if (this.type === 'tag') {
          limit_length($(this));
        } else {
          $(this).remove(); // comment?
        }
      });
    }

    source.children('p').each(function () {
      if (length >= MAX_TEXT_LENGTH) {
        if (!ellipsis) {
          ellipsis = true;
          result.append('…');
        }
        return;
      }

      // replace images/attachments with placeholders
      $(this).find('.image, .attach').each(function () {
        $(this).replaceWith('<span>[image]</span>');
      });

      // cut any text after MAX_TEXT_LENGTH characters
      limit_length($(this));

      // add the paragraph contents to the result
      result.append($(this).contents()).append(' ');
    });


    return result.html();
  }

  function fetch_data(params, callback) {

    N.models.forum.Topic.findOne({ hid: params.topic_hid })
        .lean(true)
        .exec(function (err, topic) {

      if (err) {
        callback(err);
        return;
      }

      if (!topic) {
        callback();
        return;
      }

      N.models.forum.Post.findOne({ topic: topic._id, hid: params.post_hid })
          .lean(true).exec(function (err, post) {

        if (err) {
          callback(err);
          return;
        }

        if (!post) {
          callback();
          return;
        }

        N.models.users.User.findOne({ _id: post.user, exists: true })
            .lean(true).exec(function (err, user) {

          if (err) {
            callback(err);
            return;
          }

          callback(null, {
            user:  user,
            post:  post,
            topic: topic
          });
        });
      });
    });

  }


  N.wire.on('internal:common.embed.local', function embed_post(data, callback) {
    if (data.html) {
      callback();
      return;
    }

    var match = N.router.matchAll(data.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.topic' && match.params.post_hid ? match : acc;
    }, null);

    if (!match) {
      callback();
      return;
    }

    fetch_data(match.params, function (err, result) {

      if (err) {
        callback(err);
        return;
      }

      if (result) {
        var locals = {
          href:   N.router.linkTo('forum.topic', match.params),
          topic:  result.topic,
          post:   result.post,
          user:   result.user
        };

        if (data.type === 'block') {
          locals.html = shorten(result.post.html);

          data.html = render(N, 'common.blocks.markup.quote', locals, {});

        } else if (data.type === 'inline') {
          // preserve inline link exactly as it was (keep hash tags, etc.)
          locals.href = data.url;

          data.html = render(N, 'common.blocks.markup.forum_post_link', locals, {});
        }
      }

      callback();
    });
  });
};
