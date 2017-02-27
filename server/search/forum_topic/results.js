// RPC method used to fetch results and render tabs
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // TODO
    additionalProperties: true
  });


  N.wire.on(apiPath, function search_execute(env) {
    // TODO
    env.res.results = [];
    env.res.reached_end = true;
  });
};
