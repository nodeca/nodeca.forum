// Generate sphinx docid for sections
//

'use strict';


module.exports = function search_docid_topic(N, topic_hid) {
  return N.shared.content_type.FORUM_SECTION * Math.pow(2, 47) + // 5 bit
         topic_hid; // 47 bit
};
