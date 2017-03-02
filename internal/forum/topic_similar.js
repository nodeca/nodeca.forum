// Get a list of similar topics
//
// In:
//
//  - locals.topic_id
//
// Out:
//
//  - locals.results (Array)
//     - topic_id (ObjectId)
//     - weight   (Number)
//

'use strict';


const ObjectId      = require('mongoose').Types.ObjectId;
const sphinx_escape = require('nodeca.search').escape;

const DISPLAY_LIMIT = 5;


module.exports = function (N, apiPath) {

  // Check if results are already available from cache
  //
  N.wire.before(apiPath, function* fetch_cache(locals) {
    let cache = yield N.models.forum.TopicSimilarCache.findOne()
                          .where('topic').equals(locals.topic_id)
                          .lean(true);

    if (cache) {
      // don't use results older than a week
      let timediff = Date.now() - cache.ts.valueOf();

      if (timediff > 0 && timediff < 7 * 24 * 60 * 60 * 1000) {
        locals.results = cache.results;
        locals.cached  = true;
      }
    }
  });


  // Execute sphinxql query to find similar topics
  //
  N.wire.on(apiPath, function* find_similar_topics(locals) {
    if (locals.cached) return;

    let topic = yield N.models.forum.Topic.findOne()
                          .where('_id').equals(locals.topic_id)
                          .lean(true);

    if (!topic) throw new Error("Similar topics: can't find topic with id=" + locals.topic_id);

    let results = yield N.search.execute(
      `
        SELECT object_id, WEIGHT() as weight
        FROM forum_topics
        WHERE MATCH(?) AND public=1 AND post_count > 4
        LIMIT ?

      `.replace(/\n\s*/mg, ' '),
      [ '"' + sphinx_escape(topic.title) + '"/1', DISPLAY_LIMIT + 1 ]
    );

    locals.results = results.map(r => ({ topic_id: new ObjectId(r.object_id), weight: r.weight }))
                            .filter(r => String(r.topic_id) !== String(locals.topic_id))
                            .slice(0, DISPLAY_LIMIT);
  });


  // Write results to cache
  //
  N.wire.after(apiPath, function* write_cache(locals) {
    if (locals.cached) return;

    yield N.models.forum.TopicSimilarCache.update({
      topic: locals.topic_id
    }, {
      $set: {
        ts: new Date(),
        results: locals.results
      }
    }, { upsert: true });
  });
};
