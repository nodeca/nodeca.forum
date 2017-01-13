// Generate sphinx docid for topics
//

'use strict';


module.exports = function search_docid_topic(N, topic_hid) {
  return N.shared.content_type.FORUM_TOPIC * Math.pow(2, 47) + // 5 bit
         topic_hid; // 47 bit
};
