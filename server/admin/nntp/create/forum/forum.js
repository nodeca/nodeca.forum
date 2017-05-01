// Show creation form for new group
//

'use strict';

const _  = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  N.wire.before(apiPath, async function collect_nntp_sources(env) {
    env.data.nntp_sources = [];

    let section_tree = await N.models.forum.Section.getChildren();

    let sections_by_id = _.keyBy(await N.models.forum.Section.find().select('_id title').lean(true), '_id');

    for (let section_info of section_tree) {
      env.data.nntp_sources.push({
        _id:   section_info._id,
        title: sections_by_id[section_info._id].title,
        level: section_info.level
      });
    }
  });


  N.wire.on(apiPath, function group_new(env) {
    env.res.nntp_sources = env.data.nntp_sources;

    env.res.head.title = env.t('title');
  });
};
