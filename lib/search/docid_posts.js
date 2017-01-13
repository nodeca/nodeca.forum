// Generate sphinx docid for posts
//

'use strict';


module.exports = function search_docid_post(N, topic_hid, post_hid) {
  return N.shared.content_type.FORUM_POST * Math.pow(2, 47) + // 5 bit
         topic_hid * Math.pow(2, 20) + // 27 bit
         post_hid; // 20 bit
};
