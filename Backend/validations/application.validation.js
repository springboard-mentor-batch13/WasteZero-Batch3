// Backend\validations\application.validation.js

const { body, validationResult } = require("express-validator");

const applyValidation = [
  body("opportunity_id")
    .notEmpty()
    .withMessage("Opportunity ID is required")
    .isMongoId()
    .withMessage("Invalid Opportunity ID"),
];

const updateStatusValidation = [
  body("status")
    .isIn(["accepted", "rejected"])
    .withMessage("Status must be accepted or rejected"),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  next();
};

module.exports = {
  applyValidation,
  updateStatusValidation,
  validate,
};