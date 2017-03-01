// Get a list of similar topics
//
// In:
//
//  - locals.topic
//
// Out:
//
//  - locals.results (Array)
//     - topic  (ObjectId)
//     - weight (Number)
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
                          .where('topic').equals(locals.topic)
                          .lean(true);

    if (cache) locals.results = cache.results;
  });


  // Execute sphinxql query to find similar topics
  //
  N.wire.on(apiPath, function* find_similar_topics(locals) {
    let topic = yield N.models.forum.Topic.findOne()
                          .where('_id').equals(locals.topic)
                          .lean(true);

    if (!topic) throw new Error("Similar topics: can't find topic with id=" + locals.topic);

    let results = yield N.search.execute(
      `
        SELECT object_id, WEIGHT() as weight
        FROM forum_topics
        WHERE MATCH(?) AND public=1 AND post_count > 4
        LIMIT ?

      `.replace(/\n\s*/mg, ' '),
      [ '"' + sphinx_escape(topic.title) + '"/1', DISPLAY_LIMIT + 1 ]
    );

    locals.results = results.map(r => ({ topic: new ObjectId(r.object_id), weight: r.weight }))
                            .filter(r => String(r.topic) !== String(locals.topic))
                            .slice(0, DISPLAY_LIMIT);
  });

  // TODO: write results to cache
};
