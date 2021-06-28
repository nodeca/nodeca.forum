// Fetch sections for subscriptions
//
'use strict';


const _                = require('lodash');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', async function subscriptions_fetch_sections(env) {
    let subs = env.data.subscriptions.filter(s => s.to_type === N.shared.content_type.FORUM_SECTION);

    // Fetch sections
    let sections = await N.models.forum.Section.find().where('_id').in(subs.map(s => s.to)).lean(true);


    // Check permissions subcall
    //
    let access_env = { params: { sections, user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.section', access_env);

    sections = sections.reduce((acc, section, i) => {
      if (access_env.data.access_read[i]) {
        acc.push(section);
      }

      return acc;
    }, []);


    // Sanitize sections
    sections = await sanitize_section(N, sections, env.user_info);
    sections = _.keyBy(sections, '_id');

    env.res.forum_sections = Object.assign(env.res.forum_sections || {}, sections);


    // Fill missed subscriptions (for deleted sections)
    //
    let missed = subs.filter(s => !sections[s.to]);

    env.data.missed_subscriptions = env.data.missed_subscriptions || [];
    env.data.missed_subscriptions = env.data.missed_subscriptions.concat(missed);
  });
};
