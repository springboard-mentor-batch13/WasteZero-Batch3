// Backend\validations\user.validation.js

const { body, validationResult } = require("express-validator");

const updateProfileValidation = [

  body("name")
    .optional()
    .trim()
    .isLength({ min: 2 }),

  body("bio")
    .optional()
    .trim()
    .isLength({ max: 500 }),

  body("skills")
  .optional()
  .isArray()
  .custom((arr) => arr.every((s) => typeof s === "string"))
  .withMessage("Skills must be an array of strings"),

  body("locations.primary.city")
    .optional({ nullable: true })
    .isString().withMessage("Primary city must be a string")
    .trim(),

  body("locations.primary.state")
    .optional({ nullable: true })
    .isString().withMessage("Primary state must be a string")
    .trim(),

  body("locations.secondary")
    .optional({ nullable: true })
    .isArray().withMessage("Secondary locations must be an array"),

  body("locations.secondary.*.city")
    .optional({ nullable: true })
    .isString().withMessage("Secondary city must be a string")
    .trim(),

  body("locations.secondary.*.state")
    .optional({ nullable: true })
    .isString().withMessage("Secondary state must be a string")
    .trim(),

  body("wasteTypes")
    .optional()
    .isArray()
    .custom((arr) => arr.every((w) => typeof w === "string"))
    .withMessage("wasteTypes must be an array of strings"),
];

const changePasswordOtpValidation = [
  body("otp")
    .trim()
    .notEmpty().withMessage("OTP is required").bail()
    .isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits").bail()
    .matches(/^\d{6}$/).withMessage("OTP must contain only digits"),

  body("newPassword")
    .notEmpty().withMessage("New password is required").bail()
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters").bail()
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/)
    .withMessage("Password must contain uppercase, lowercase, number, and special character"),
];

const validate = (req,res,next)=>{

    const errors = validationResult(req);

    if(!errors.isEmpty()){
        return res.status(400).json({
            success:false,
            errors:errors.array(),
            message: errors.array()[0]?.msg || "Validation error",
        });
    }

    next();

}

module.exports={
updateProfileValidation,
changePasswordOtpValidation,
validate
}