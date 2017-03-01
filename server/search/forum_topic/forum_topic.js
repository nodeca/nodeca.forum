// Forum topic search placeholder page, shows search input only;
// it doesn't return any results to prevent heavy load from bots
//

'use strict';

const sort_types   = [ 'date', 'rel' ];
const period_types = [ '0', '7', '30', '365' ];


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    $query: {
      type: 'object',
      required: true,
      properties: {
        hid:    { type: 'string', required: true },
        query:  { type: 'string' },
        sort:   { 'enum': sort_types },
        period: { 'enum': period_types }
      }
    }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function* fetch_topic(env) {
    let topic = yield N.models.forum.Topic
                          .findOne({ hid: Number(env.params.$query.hid) })
                          .lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Check if user can view this topic
  //
  N.wire.before(apiPath, function* check_access(env) {
    let access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  N.wire.on(apiPath, function search_general(env) {
    env.res.head.title = env.t('title');
    env.res.head.robots = 'noindex,nofollow';

    env.res.query  = env.params.$query.query;
    env.res.sort   = env.params.$query.sort;
    env.res.period = env.params.$query.period;
    env.res.hid    = Number(env.params.$query.hid);

    // there are no tabs for search inside topic,
    // so only one content type possible
    env.res.type = 'forum_posts';

    env.res.sort_types    = sort_types;
    env.res.period_types  = period_types;

    // an amount of search results loaded at once,
    // it is expected to be overriden for different content types
    env.res.items_per_page = 40;

    env.res.filter_title = env.data.topic.title;
  });
};
