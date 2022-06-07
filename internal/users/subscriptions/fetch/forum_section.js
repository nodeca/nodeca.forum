// Fetch sections for subscriptions
//
// In:
//
//  - params.user_info
//  - params.subscriptions
//  - params.count_only
//
// Out:
//
//  - count
//  - items
//  - missed_subscriptions - list of subscriptions for deleted topics
//                           (those subscriptions will be deleted later)
//  - res   - misc data (specific to template, merged with env.res)
//
'use strict';


const _                = require('lodash');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function subscriptions_fetch_sections(locals) {
    let subs = locals.params.subscriptions.filter(s => s.to_type === N.shared.content_type.FORUM_SECTION);

    locals.count = subs.length;
    locals.res = {};
    if (!locals.count || locals.params.count_only) return;

    // Fetch sections
    let sections = await N.models.forum.Section.find().where('_id').in(subs.map(s => s.to)).lean(true);


    // Check permissions subcall
    //
    let access_env = { params: { sections, user_info: locals.params.user_info } };

    await N.wire.emit('internal:forum.access.section', access_env);

    sections = sections.reduce((acc, section, i) => {
      if (access_env.data.access_read[i]) {
        acc.push(section);
      }

      return acc;
    }, []);


    // Sanitize sections
    sections = await sanitize_section(N, sections, locals.params.user_info);
    sections = _.keyBy(sections, '_id');

    locals.res.forum_sections = Object.assign(locals.res.forum_sections || {}, sections);
    locals.items = subs;


    // Fill missed subscriptions (for deleted sections)
    //
    let missed = subs.filter(s => !sections[s.to]);

    locals.missed_subscriptions = locals.missed_subscriptions || [];
    locals.missed_subscriptions = locals.missed_subscriptions.concat(missed);
  });
};
