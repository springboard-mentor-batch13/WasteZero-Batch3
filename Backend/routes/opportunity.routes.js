// routes/opportunity.routes.js
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

// Destructured existing authentication and role middleware from auth.middleware.js
const { protect, authorize } = require('../middlewares/auth.middleware');

// Feature specific ownership layer logic
const { checkOpportunityOwnership } = require('../middlewares/role.middleware');
const { opportunityValidationRules, validate } = require('../validations/opportunity.validation');

// NEWLY ADDED IMAGE UPLOAD MIDDLEWARES
const { upload, uploadToCloudinary } = require('../middlewares/upload.middleware');

// Guard all sub-routes with the primary authentication shield
router.use(protect);

// Specialized Query/Listing Endpoints
router.get('/my-opportunities', authorize('ngo', 'admin'), getMyOpportunities);
router.get('/search', searchOpportunities);
router.get('/filter', filterOpportunities);

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