// Show edit form for a group
//

'use strict';

const _  = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { format: 'mongo', required: true }
  });


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


  N.wire.on(apiPath, async function group_edit(env) {
    let group = await N.models.nntp.Group.findById(env.params._id).lean(true);

    if (!group) throw N.io.NOT_FOUND;

    env.res.current_group = group;
    env.res.nntp_sources = env.data.nntp_sources;

    env.res.head.title = env.t('title', { name: group.name });
  });
};
