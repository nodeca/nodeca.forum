// Attachment info object used to display post tail
//
// Used in:
//  - Post
//  - PostHistory
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


let AttachmentInfo = new Schema({ // explicit definition to remove `_id` field
  media_id:  Schema.ObjectId,
  file_name: String,
  type:      { type: Number }
}, { _id: false });


module.exports = AttachmentInfo;
