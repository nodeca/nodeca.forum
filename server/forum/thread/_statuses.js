// Thread & post statuses

// Thread statuses are optimized for paged fetches & indexes
// Some statises can have extended info in additionsl field:
//
// - PINNED, HB - status_ext contains OPEN/CLOSED/PENDING state
//
exports.thread = {
  OPEN:         0,
  CLOSED:       1,
  PINNED:       2,
  PENDING:      3,
  DELETED:      4,
  DELETED_HARD: 5,
  HB:           6 // hellbanned
};

exports.post = {
  VISIBLE:      0,
  HB:           1, // hellbanned
  PENDING:      2,
  DELETED:      3,
  DELETED_HARD: 4,
};