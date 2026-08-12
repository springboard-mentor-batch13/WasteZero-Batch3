// Backend\routes\opportunity.routes.js

const express = require('express');
const router = express.Router();

const {
    createOpportunity,
    getAllOpportunities,
    getOpportunityById,
    updateOpportunity,
    deleteOpportunity,
    getMyOpportunities,
    searchOpportunities,
    filterOpportunities
} = require('../controllers/opportunity.controllers');

const { protect, authorize } = require('../middlewares/auth.middleware');

// Feature specific ownership layer logic
const { checkOpportunityOwnership } = require('../middlewares/role.middleware');
const { opportunityValidationRules, validate } = require('../validations/opportunity.validation');

// NEWLY ADDED IMAGE UPLOAD MIDDLEWARES
const { upload, uploadToCloudinary } = require('../middlewares/upload.middleware');

// P1-04: generalLimiter applied to search and filter — these are the two most
// expensive read endpoints (regex scans + text index) and have no prior rate limit.
const { generalLimiter } = require('../middlewares/rateLimiter.middleware');

// Guard all sub-routes with the primary authentication shield
router.use(protect);

// Specialized Query/Listing Endpoints
router.get('/my-opportunities', authorize('ngo', 'admin'), getMyOpportunities);
router.get('/search', generalLimiter, searchOpportunities);   // P1-04: rate limited
router.get('/filter', generalLimiter, filterOpportunities);   // P1-04: rate limited

// Core Base CRUD Endpoint Maps
router.route('/')
    .post(
        authorize('ngo', 'admin'), 
        upload.single('image'), // Intercepts the incoming file stream
        uploadToCloudinary,     // Uploads memory buffer to Cloudinary and returns URL
        opportunityValidationRules(), 
        validate, 
        createOpportunity
    )
    .get(getAllOpportunities);

router.route('/:id')
    .get(getOpportunityById)
    .put(
        authorize('ngo', 'admin'), 
        checkOpportunityOwnership, 
        upload.single('image'), // Handles dynamic image updates on edit
        uploadToCloudinary, 
        opportunityValidationRules(), 
        validate, 
        updateOpportunity
    )
    .delete(authorize('ngo', 'admin'), checkOpportunityOwnership, deleteOpportunity);

module.exports = router;