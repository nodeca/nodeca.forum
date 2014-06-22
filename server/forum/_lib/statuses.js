// Topic & post statuses

// Topic statuses are optimized for paged fetches & indexes
// Some statises can have extended info in additionsl field:
//
// - PINNED, HB - status_ext contains OPEN/CLOSED/PENDING state
//
exports.topic = {
  OPEN:         1,
  CLOSED:       2,
  PINNED:       3,
  PENDING:      4,
  DELETED:      5,
  DELETED_HARD: 6,
  HB:           7 // hellbanned
};

exports.post = {
  VISIBLE:      1,
  HB:           2, // hellbanned
  PENDING:      3,
  DELETED:      4,
  DELETED_HARD: 5
};
