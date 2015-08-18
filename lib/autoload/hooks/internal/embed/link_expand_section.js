// Replace link to section with its title
//

'use strict';


var render = require('nodeca.core/lib/system/render/common');


module.exports = function (N) {

  N.wire.on('internal:common.embed.local', function embed_section(data, callback) {
    if (data.html) {
      callback();
      return;
    }

    if (data.type !== 'inline') {
      callback();
      return;
    }

    var match = N.router.matchAll(data.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.section' ? match : acc;
    }, null);

    if (!match) {
      callback();
      return;
    }

    N.models.forum.Section.findOne({ hid: match.params.hid })
        .lean(true)
        .exec(function (err, section) {

      if (err) {
        callback(err);
        return;
      }

      if (section) {
        data.html = render(N, 'common.blocks.markup.internal_link', {
          href:    data.url,
          content: section.title
        }, {});
      }

      callback();
    });
  });
};
