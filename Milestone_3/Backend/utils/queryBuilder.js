// Backend/utils/queryBuilder.js

const buildQuery = (req) => {
  // Pagination
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  // Prevent users from requesting an extremely large number of records
  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || 10, 1),
    100
  );

  const skip = (page - 1) * limit;

  // Sorting
  const allowedSortFields = [
    "createdAt",
    "updatedAt",
    "status"
  ];

  const sortField = allowedSortFields.includes(req.query.sort)
    ? req.query.sort
    : "createdAt";

  const sortOrder = req.query.order === "asc" ? 1 : -1;

  return {
    page,
    limit,
    skip,
    sort: {
      [sortField]: sortOrder,
    },
  };
};

module.exports = buildQuery;