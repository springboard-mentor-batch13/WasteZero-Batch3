// Backend/services/application.service.js

const Application = require('../models/application.model');

const apply = (data) => {
  return Application.create(data);
};


const getApplications = (filter, skip, limit, sort) => {
  return Application.find(filter)
    .populate('volunteer_id', 'name email username')   // username added for Contact Volunteer
    .populate('opportunity_id', 'title location status date ngo_id')  // Key fields only
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
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