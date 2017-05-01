// Update a group
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id:    { format: 'mongo', required: true },
    name:   { type: 'string',  required: true },
    source: { format: 'mongo' }
  });


  N.wire.before(apiPath, async function check_duplicate_name(env) {
    let duplicate = await N.models.nntp.Group.findOne({ name: env.params.name }).lean(true);

    if (duplicate && String(duplicate._id) !== env.params._id) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_duplicate_name')
      };
    }
  });


  N.wire.on(apiPath, async function group_update(env) {
    let group = await N.models.nntp.Group.findById(env.params._id);

    if (!group) throw N.io.NOT_FOUND;

    Object.keys(env.params).forEach(key => {
      if (key !== '_id') { group.set(key, env.params[key]); }
    });

    await group.save();
  });
};
