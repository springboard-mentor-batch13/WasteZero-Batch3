const { body, validationResult } = require("express-validator");

const registerValidation = [
  body("name")
    .trim()
    .notEmpty().withMessage("Name is required").bail()
    .isLength({ min: 2, max: 50 }).withMessage("Name must be between 2 and 50 characters").bail()
    .matches(/^[A-Za-z ]+$/).withMessage("Name must contain only letters and spaces"),

  body("username")
    .trim()
    .notEmpty().withMessage("Username is required").bail()
    .isLength({ min: 3, max: 20 }).withMessage("Username must be between 3 and 20 characters").bail()
    .matches(/^[a-zA-Z0-9_]+$/).withMessage("Username can only contain letters, numbers, and underscores"),

  body("email")
    .trim()
    .notEmpty().withMessage("Email is required").bail()
    .isEmail().withMessage("Please enter a valid email"),

  body("password")
    .notEmpty().withMessage("Password is required").bail()
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters").bail()
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/)
    .withMessage("Password must contain uppercase, lowercase, number, and special character"),
];

const loginValidation = [
  body("identifier")
    .trim()
    .notEmpty()
    .withMessage("Username or email is required"),

  body("password")
    .notEmpty()
    .withMessage("Password is required"),
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
  registerValidation,
  loginValidation,
  validate,
};