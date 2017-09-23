// Subscribe section
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    env.data.section = await N.models.forum.Section
                                .findOne({ hid: env.params.section_hid })
                                .lean(true);

    if (!env.data.section) throw N.io.NOT_FOUND;
  });


  // Subcall forum.access.section
  //
  N.wire.before(apiPath, async function subcall_section(env) {
    var access_env = { params: { sections: env.data.section, user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.section', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Return a list of section moderators
  //
  N.wire.on(apiPath, async function get_moderators(env) {
    let SectionModeratorStore = N.settings.getStore('section_moderator');

    if (!SectionModeratorStore) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `section_moderator` is not registered.'
      };
    }

    env.res.moderators = (await SectionModeratorStore.getModeratorsInfo(env.data.section._id))
                             .filter(moderator => moderator.visible)
                             .map(moderator => moderator._id);

    env.data.users = (env.data.users || []).concat(env.res.moderators);
  });
};
