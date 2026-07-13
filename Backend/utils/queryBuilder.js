// Backend\utils\queryBuilder.js

const buildQuery = (req) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit) || 10, 1);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

module.exports = buildQuery;