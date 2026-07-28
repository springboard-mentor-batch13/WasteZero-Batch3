// Backend\validations\user.validation.js

const { body, validationResult } = require("express-validator");

const updateProfileValidation = [

  body("name")
    .optional()
    .trim()
    .isLength({ min: 2 }),

  body("location")
    .optional()
    .trim(),

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
    .optional()
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

const validate = (req,res,next)=>{

    const errors = validationResult(req);

    if(!errors.isEmpty()){
        return res.status(400).json({
            success:false,
            errors:errors.array()
        });
    }

    next();

}

module.exports={
updateProfileValidation,
validate
}