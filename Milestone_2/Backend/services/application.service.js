// Backend/services/application.service.js

const Application = require('../models/application.model');

/**
 * Apply for an opportunity
 * Creates a new Application document.
 * NOT lean — we need the returned Mongoose document for response.
 */
const apply = (data) => {
  return Application.create(data);
};

/**
 * Get applications with pagination, sorting, and population.
 * Uses .lean() — read-only list, no document methods needed.
 * Selective field projections on populate to avoid over-fetching.
 */
const getApplications = (filter, skip, limit, sort) => {
  return Application.find(filter)
    .populate('volunteer_id', 'name email')   // Only name + email needed in review list
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
    .populate('volunteer_id', 'name email')
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