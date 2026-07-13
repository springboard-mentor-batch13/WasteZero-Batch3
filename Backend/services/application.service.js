// Backend\services\application.service.js

const Application = require("../models/application.model");

const apply = (data) => {
  return Application.create(data);
};

const getApplications = (filter, skip, limit) => {
  return Application.find(filter)
    .populate("volunteer_id", "name email")
    .populate("opportunity_id")
    .skip(skip)
    .limit(limit);
};

const getApplicationById = (id) => {
  return Application.findById(id)
    .populate("volunteer_id", "name email")
    .populate("opportunity_id");
};

const updateStatus = (id, status) => {
  return Application.findByIdAndUpdate(
    id,
    { status },
    { new: true }
  );
};

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