// middlewares/role.middleware.js
const Opportunity = require('../models/opportunity.model');
const { sendError } = require('../utils/apiResponse');

/**
 * @desc    Ensures that the logged-in NGO/User is the actual owner of the opportunity resource
 */
const checkOpportunityOwnership = async (req, res, next) => {
    try {
        const opportunityId = req.params.id;
        
        // If Admin, bypass ownership verification checks safely
        if (req.user.role === 'admin') {
            return next();
        }

        const opportunity = await Opportunity.findById(opportunityId);
        
        if (!opportunity) {
            return sendError(res, "Opportunity not found", 404);
        }

        // Strict String match between resource creator and session user
        if (opportunity.ngo_id.toString() !== req.user.id.toString()) {
            return sendError(res, "Access denied. You do not own this opportunity.", 403);
        }

        // Cache database instance into the express request stream pipeline
        req.opportunity = opportunity;
        next();
    } catch (error) {
        return sendError(res, "Error verifying resource ownership", 500, error.message);
    }
};

module.exports = {
    checkOpportunityOwnership
};