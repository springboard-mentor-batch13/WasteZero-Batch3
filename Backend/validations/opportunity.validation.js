// validations/opportunity.validation.js
const { body, validationResult } = require('express-validator');
const { sendError } = require('../utils/apiResponse');

// Validation Rules for Create/Update
const opportunityValidationRules = () => {
    return [
        body('title')
            // Agar PUT request hai toh optional rahega, POST hai toh required
            .if((value, { req }) => req.method === 'POST' || (req.method === 'PUT' && value !== undefined))
            .notEmpty().withMessage('Title is required')
            .isString().withMessage('Title must be a string')
            .trim()
            .isLength({ max: 100 }).withMessage('Title cannot exceed 100 characters'),
        
        body('description')
            .if((value, { req }) => req.method === 'POST' || (req.method === 'PUT' && value !== undefined))
            .notEmpty().withMessage('Description is required')
            .isString().withMessage('Description must be a string')
            .trim(),
        
        body('required_skills')
            .if((value, { req }) => req.method === 'POST' || (req.method === 'PUT' && value !== undefined))
            .notEmpty().withMessage('Required skills are required')
            .isArray({ min: 1 }).withMessage('Required skills must be an array with at least one skill'),
        
        body('required_skills.*')
            .isString().withMessage('Each skill must be a string')
            .trim(),
        
        body('duration')
            .if((value, { req }) => req.method === 'POST' || (req.method === 'PUT' && value !== undefined))
            .notEmpty().withMessage('Duration is required')
            .isString().withMessage('Duration must be a string')
            .trim(),
        
        body('location')
            .if((value, { req }) => req.method === 'POST' || (req.method === 'PUT' && value !== undefined))
            .notEmpty().withMessage('Location is required')
            .isString().withMessage('Location must be a string')
            .trim(),
        
        body('status')
            .optional()
            .isIn(['open', 'in-progress', 'closed']).withMessage('Status must be either open, in-progress, or closed')
    ];
};

// Middleware to handle validation errors
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return next();
    }
    
    const extractedErrors = [];
    errors.array().map(err => extractedErrors.push({ [err.path]: err.msg }));

    return sendError(res, "Validation failed", 400, extractedErrors);
};

module.exports = {
    opportunityValidationRules,
    validate
};