// Thread & post statuses

exports.thread = {
  OPEN:         0,
  CLOSED:       1,
  PENDING:      2,
  DELETED:      3,
  DELETED_HARD: 4,
  OPEN_HB:      5, // hellbanned (open)
  CLOSED_HB:    6, // hellbanned (closed)
}

exports.post = {
  VISIBLE:      0,
  HB:           1, // hellbanned
  PENDING:      2,
  DELETED:      3,
  DELETED_HARD: 4,
}