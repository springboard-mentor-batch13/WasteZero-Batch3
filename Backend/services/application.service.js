// Backend/services/application.service.js

const Application = require("../models/application.model");

/**
 * Apply for an opportunity
 */
const apply = (data) => {
  return Application.create(data);
};

/**
 * Get applications with pagination and sorting
 */
const getApplications = (filter, skip, limit, sort) => {
  return Application.find(filter)
    .populate("volunteer_id", "name email")
    .populate("opportunity_id")
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

/**
 * Get application by ID
 */
const getApplicationById = (id) => {
  return Application.findById(id)
    .populate("volunteer_id", "name email")
    .populate("opportunity_id");
};

/**
 * Update application status
 */
const updateStatus = (id, status) => {
  return Application.findByIdAndUpdate(
    id,
    { status },
    { new: true }
  );
};

/**
 * Withdraw application
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