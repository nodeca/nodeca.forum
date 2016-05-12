// Fetch sections for subscriptions
//
'use strict';


const _                = require('lodash');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', function* subscriptions_fetch_sections(env) {
    let subs = _.filter(env.data.subscriptions, { to_type: N.models.users.Subscription.to_types.FORUM_SECTION });

    // Fetch sections
    let sections = yield N.models.forum.Section.find().where('_id').in(_.map(subs, 'to')).lean(true);


    // Check permissions subcall
    //
    let access_env = { params: { sections, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.section', access_env);

    sections = sections.reduce((acc, section, i) => {
      if (access_env.data.access_read[i]) {
        acc.push(section);
      }

      return acc;
    }, []);


    // Sanitize sections
    sections = yield sanitize_section(N, sections, env.user_info);
    sections = _.keyBy(sections, '_id');

    env.res.forum_sections = _.assign(env.res.forum_sections || {}, sections);


    // Fill missed subscriptions (for deleted sections)
    //
    let missed = _.filter(subs, s => !sections[s.to]);

    env.data.missed_subscriptions = env.data.missed_subscriptions || [];
    env.data.missed_subscriptions = env.data.missed_subscriptions.concat(missed);
  });
};
