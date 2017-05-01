// Create new group
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    name:   { type: 'string', required: true },
    source: { format: 'mongo' }
  });


  N.wire.before(apiPath, async function check_duplicate_name(env) {
    let duplicate = await N.models.nntp.Group.findOne({ name: env.params.name }).lean(true);

    if (duplicate) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_duplicate_name')
      };
    }
  });


  N.wire.on(apiPath, async function group_create(env) {
    let group = new N.models.nntp.Group({
      name:   env.params.name,
      source: env.params.source,
      type:   'forum'
    });

    await group.save();
  });
};
