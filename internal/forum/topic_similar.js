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
  N.wire.before(apiPath, async function fetch_cache(locals) {
    let cache = await N.models.forum.TopicSimilarCache.findOne()
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
  N.wire.on(apiPath, async function find_similar_topics(locals) {
    if (locals.cached) return;

    let topic = await N.models.forum.Topic.findOne()
                          .where('_id').equals(locals.topic_id)
                          .lean(true);

    if (!topic) throw new Error("Similar topics: can't find topic with id=" + locals.topic_id);

    // "sum(lcs*user_weight)*1000 + bm25" - formula for default ranking mode (SPH_RANK_PROXIMITY_BM25)
    // "interval(post_count,4)" - limit output to topics with 3+ replies
    //let ranker = '(sum(lcs*user_weight)*1000 + bm25) * interval(post_count,4)';
    let ranker = 'bm25 * interval(post_count,4)';

    let results = await N.search.execute(
      `
        SELECT object_id, WEIGHT() as weight
        FROM forum_topics
        WHERE MATCH(?)
              AND public=1
              AND WEIGHT() > 0
        ORDER BY WEIGHT() DESC
        LIMIT ?
        OPTION ranker=expr(?)

      `.replace(/\n\s*/mg, ' '),
      [ '"' + sphinx_escape(topic.title) + '"/1', DISPLAY_LIMIT + 1, ranker ]
    );

    locals.results = results.map(r => ({ topic_id: new ObjectId(r.object_id), weight: r.weight }))
                            .filter(r => String(r.topic_id) !== String(locals.topic_id))
                            .slice(0, DISPLAY_LIMIT);
  });


  // Write results to cache
  //
  N.wire.after(apiPath, async function write_cache(locals) {
    if (locals.cached) return;

    await N.models.forum.TopicSimilarCache.updateOne({
      topic: locals.topic_id
    }, {
      $set: {
        ts: new Date(),
        results: locals.results
      }
    }, { upsert: true });
  });
};
