const { body, validationResult } = require("express-validator");

const registerValidation = [
  body("name")
    .trim()
    .notEmpty()
    .isLength({min:2,max:50})
    .matches(/^[A-Za-z ]+$/)
    .withMessage("Name is required"),

  body("username")
    .trim()
    .notEmpty()
    .isLength({min:3,max:20})
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username is required"),

  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email"),

  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/
      )
      ];

const loginValidation = [
  body("identifier")
    .trim()
    .notEmpty()
    .withMessage("Username or email is required")
    .custom((value) => {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      const isUsername = /^[a-zA-Z0-9_]{3,20}$/.test(value);
      if (!isEmail && !isUsername) {
        throw new Error("Enter a valid username or email address");
      }
      return true;
    }),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
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