// Backend/validations/application.validation.js

const { body, validationResult } = require("express-validator");
const { sendError } = require("../utils/apiResponse");

// Validation for applying to an opportunity
const applyValidation = [
  body("opportunity_id")
    .notEmpty()
    .withMessage("Opportunity ID is required")
    .isMongoId()
    .withMessage("Invalid Opportunity ID"),
];

// Validation for updating application status
const updateStatusValidation = [
  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(["accepted", "rejected"])
    .withMessage("Status must be accepted or rejected"),
];

// Common validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return sendError(
      res,
      "Validation failed",
      400,
      errors.array()
    );
  }

  next();
};

module.exports = {
  applyValidation,
  updateStatusValidation,
  validate,
};