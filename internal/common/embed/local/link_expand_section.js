// Replace link to section with its title
//

'use strict';


var render = require('nodeca.core/lib/system/render/common');


module.exports = function (N) {

  N.wire.on('internal:common.embed.local', async function embed_section(data) {
    if (data.html) return;

    if (data.type !== 'inline') return;

    var match = N.router.matchAll(data.url).reduce((acc, match) => {
      if (match.meta.methods.get === 'forum.section') return match;
      return acc;
    }, null);

    if (!match) return;

    let section = await N.models.forum.Section
                            .findOne({ hid: match.params.hid })
                            .lean(true);
    if (section) {
      data.html = render(N, 'common.blocks.markup.internal_link', {
        href:    data.url,
        content: section.title
      }, {});
    }
  });
};
