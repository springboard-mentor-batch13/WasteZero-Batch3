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