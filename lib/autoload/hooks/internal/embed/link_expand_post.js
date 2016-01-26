// Generate snippets for forum posts
//

'use strict';


var _        = require('lodash');
var $        = require('nodeca.core/lib/parser/cheequery');
var render   = require('nodeca.core/lib/system/render/common');
var beautify = require('nodeca.core/lib/parser/beautify_url');


module.exports = function (N) {

  var MAX_TEXT_LENGTH = 500;

  // replacement for image in post snippets
  var attachTpl = _.template('<a class="icon icon-picture attach-collapsed" ' +
    'href="<%- href %>"></a>');
  var imageTpl = _.template('<a class="icon icon-picture image-collapsed" ' +
    'href="<%- href %>" target="_blank" rel="nofollow"></a>');

  // replacement for media players
  var blockLinkTpl = _.template('<p><a class="link link-ext" href="<%- href %>" target="_blank" rel="nofollow">' +
    '<%- content %></a></p>');

  // Convert html content to a short snippet
  //
  //  1. remove all top-level block tags except paragraphs (block quotes, video players, etc.)
  //  2. merge all paragraphs into one
  //  3. replace images with their alt tags
  //  4. limit the total text length of the resulting paragraph (not counting tags)
  //
  function shorten(html) {
    var ast = $('<div>').html(html);
    var length = 0;
    var ellipsis = false;

    // remove all tags except whitelisted
    function remove_tags(node) {
      node.children().each(function () {
        var element = $(this);

        remove_tags(element);

        // whitelist all tags that we want to keep
        if (!element.filter('a, em, strong, s, .emoji').length) {
          element.replaceWith(element.contents());
        }
      });
    }

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

    // remove all quotes and post snippets
    ast.find('.quote').each(function () {
      $(this).remove();
    });

    // replace images/attachments with placeholders
    ast.find('.image, .attach').each(function () {
      var template = $(this).hasClass('attach') ? attachTpl : imageTpl;

      $(this).replaceWith(template({ href: $(this).data('nd-orig') }));
    });

    // replace media players with their urls
    ast.find('.ez-block').each(function () {
      $(this).replaceWith(blockLinkTpl({
        href:    $(this).data('nd-orig'),
        content: beautify($(this).data('nd-orig'), 50)
      }));
    });

    // remove all tags except whitelisted (a, em, del, etc.)
    remove_tags(ast);

    // cut any text after MAX_TEXT_LENGTH characters
    limit_length(ast);

    return ast.html();
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

          callback(null, { user, post, topic });
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
