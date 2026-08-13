// Backend/services/application.service.js

const Application = require('../models/application.model');

const apply = (data) => {
  return Application.create(data);
};


/**
 * Returns both the page of applications and the total matching count, so
 * callers can report page/total/totalPages the same way every other
 * paginated list endpoint in this codebase does (getMyApplications, admin
 * getUsers, report browse* helpers, etc).
 */
const getApplications = async (filter, skip, limit, sort) => {
  const [applications, total] = await Promise.all([
    Application.find(filter)
      .populate('volunteer_id', 'name email username')   // username added for Contact Volunteer
      .populate('opportunity_id', 'title location status date ngo_id')  // Key fields only
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Application.countDocuments(filter),
  ]);

  return { applications, total };
};

/**
 * Get application by ID (pre-fetched and populated by role.middleware).
 * Controller reads req.application directly — this method retained for
 * any direct service calls outside the middleware pipeline.
 */
const getApplicationById = (id) => {
  return Application.findById(id)
    .populate('volunteer_id', 'name email username')
    .populate('opportunity_id');
};


/**
 * Update application status (accept / reject).
 * NOT lean — findByIdAndUpdate returns the updated document for the response.
 */
const updateStatus = (id, status) => {
  return Application.findByIdAndUpdate(
    id,
    { status },
    { new: true }
  );
};

/**
 * Withdraw (delete) an application.
 */
const withdraw = (id) => {
  return Application.findByIdAndDelete(id);
};

module.exports = {
  apply,
  getApplications,
  getApplicationById,
  updateStatus,
  withdraw,
};