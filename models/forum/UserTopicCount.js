// Keeping track of a number of topics made by a user in each section
//

'use strict';


const _        = require('lodash');
const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let UserTopicCount = new Schema({
    user:     Schema.ObjectId,
    value:    Schema.Types.Mixed, // section_id => Number
    value_hb: Schema.Types.Mixed  // section_id => Number
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find stats for a user
  UserTopicCount.index({ user: 1 });

  /*
   * Get stats object for a user
   *
   * Params:
   *
   *  - user_id (ObjectId or Array)
   *  - current_user_info (Object) - same as env.user_info
   *
   * Returns a Number (number of topics made in all sections visible by
   * current user, hb are counted only if user is hb).
   *
   * When there's no data available, it returns 0 and schedules
   * background recount.
   */
  UserTopicCount.statics.get = async function get(user_id, current_user_info) {
    let is_bulk = true;

    if (!Array.isArray(user_id)) {
      is_bulk = false;
      user_id = [ user_id ];
    }

    let data = _.keyBy(
      await N.models.forum.UserTopicCount.find()
                .where('user').in(user_id)
                .lean(true),
      'user'
    );

    let users_need_recount = [];
    let section_ids = await N.models.forum.Section.getVisibleSections(current_user_info.usergroups);

    let result = user_id.map(u => {
      let d = data[u];

      if (!d) {
        users_need_recount.push(u);
        return 0;
      }

      return section_ids
               .map(section_id => (d[current_user_info.hb ? 'value_hb' : 'value'] || {})[section_id] || 0)
               .reduce((a, b) => a + b, 0);
    });

    if (users_need_recount.length > 0) {
      await N.wire.emit('internal:users.activity.recount',
        users_need_recount.map(u => [ 'forum_topics', { user_id: u } ])
      );
    }

    return is_bulk ? result : result[0];
  };


  /*
   * Increment topic counter by 1 for a user in a single section
   *
   * Params:
   *
   *  - user_id (ObjectId)
   *  - options
   *     - section (ObjectId), required
   *     - is_hb (Boolean), required
   *
   * When there's no data available, it doesn't change data and schedules
   * background recount instead.
   */
  UserTopicCount.statics.inc = async function inc(user_id, { section_id, is_hb }) {
    let data = await N.models.forum.UserTopicCount.findOneAndUpdate(
      { user: user_id },
      {
        $inc: {
          [`value.${section_id}`]: is_hb ? 0 : 1,
          [`value_hb.${section_id}`]: 1
        }
      },
    );

    if (!data) {
      await N.wire.emit('internal:users.activity.recount', [ [ 'forum_topics', { user_id } ] ]);
    }
  };


  /*
   * Run background recount for user data
   *
   * Params (single query):
   *  - user_id (ObjectId)
   *  - section_id (ObjectId), optional
   *
   * Params (bulk query):
   *  - [
   *      [ user_id1, section_id1 ],
   *      [ user_id2, section_id2 ],
   *      ...
   *    ]
   *
   * Triggers background recount for user in a single section if section_id
   * is specified, or in all sections otherwise.
   */
  UserTopicCount.statics.recount = async function recount(user_id, section_id = null) {
    let bulk_data;

    if (Array.isArray(user_id)) {
      // support for bulk call, recount([ [ user1, section1 ], ... ]);
      bulk_data = user_id;
    } else {
      bulk_data = [ [ user_id, section_id ] ];
    }

    /* eslint-disable no-undefined */
    await N.wire.emit('internal:users.activity.recount', bulk_data.map(([ user_id, section_id ]) => ([
      'forum_topics',
      { user_id, section_id: (section_id || undefined) }
    ])));
  };


  N.wire.on('init:models', function emit_init_UserTopicCount() {
    return N.wire.emit('init:models.' + collectionName, UserTopicCount);
  });


  N.wire.on('init:models.' + collectionName, function init_model_UserTopicCount(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
