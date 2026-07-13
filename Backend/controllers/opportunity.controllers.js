// controllers/opportunity.controllers.js

const opportunityService = require('../services/opportunity.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * @desc    Create a new opportunity
 * @route   POST /api/opportunities
 * @access  Private (NGO/Admin)
 */
const createOpportunity = async (req, res) => {
    try {
        const savedOpportunity = await opportunityService.createOpportunity(req.user.id, req.body);
        return sendSuccess(res, savedOpportunity, "Opportunity created successfully", 201);
    } catch (error) {
        return sendError(res, "Failed to create opportunity", 500, error.message);
    }
};

/**
 * @desc    Get all opportunities (with pagination)
 * @route   GET /api/opportunities
 * @access  Private (Any logged-in user)
 */
const getAllOpportunities = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;

        const result = await opportunityService.getAllOpportunities(page, limit);
        return sendSuccess(res, result, "Opportunities fetched successfully");
    } catch (error) {
        return sendError(res, "Failed to fetch opportunities", 500, error.message);
    }
};

/**
 * @desc    Get details of a specific opportunity
 * @route   GET /api/opportunities/:id
 * @access  Private (Any logged-in user)
 */
const getOpportunityById = async (req, res) => {
    try {
        const opportunity = await opportunityService.getOpportunityById(req.params.id);
        if (!opportunity) {
            return sendError(res, "Opportunity not found", 404);
        }
        return sendSuccess(res, opportunity, "Opportunity details fetched successfully");
    } catch (error) {
        return sendError(res, "Failed to fetch opportunity details", 500, error.message);
    }
};

/**
 * @desc    Update an existing opportunity
 * @route   PUT /api/opportunities/:id
 * @access  Private (NGO/Admin - Owner Only)
 */
const updateOpportunity = async (req, res) => {
    try {
        // req.opportunity is already fetched safely inside checkOpportunityOwnership middleware
        const updatedOpportunity = await opportunityService.updateOpportunityInstance(req.opportunity, req.body);
        return sendSuccess(res, updatedOpportunity, "Opportunity updated successfully");
    } catch (error) {
        return sendError(res, "Failed to update opportunity", 500, error.message);
    }
};

/**
 * @desc    Delete an opportunity
 * @route   DELETE /api/opportunities/:id
 * @access  Private (NGO/Admin - Owner Only)
 */
const deleteOpportunity = async (req, res) => {
    try {
        await opportunityService.deleteOpportunityById(req.params.id);
        return sendSuccess(res, null, "Opportunity deleted successfully");
    } catch (error) {
        return sendError(res, "Failed to delete opportunity", 500, error.message);
    }
};

/**
 * @desc    Get all opportunities created by the logged-in NGO
 * @route   GET /api/opportunities/my-opportunities
 * @access  Private (NGO/Admin)
 */
const getMyOpportunities = async (req, res) => {
    try {
        const opportunities = await opportunityService.getOpportunitiesByNgo(req.user.id);
        return sendSuccess(res, opportunities, "My opportunities fetched successfully");
    } catch (error) {
        return sendError(res, "Failed to fetch your opportunities", 500, error.message);
    }
};

/**
 * @desc    Search opportunities by title or description
 * @route   GET /api/opportunities/search
 * @access  Private (Any logged-in user)
 */
const searchOpportunities = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return sendError(res, "Search query param 'q' is missing", 400);
        }

        const opportunities = await opportunityService.searchOpportunities(q);
        return sendSuccess(res, opportunities, "Search completed successfully");
    } catch (error) {
        return sendError(res, "Search execution failed", 500, error.message);
    }
};

/**
 * @desc    Filter opportunities by status, required skill, and location
 * @route   GET /api/opportunities/filter
 * @access  Private (Any logged-in user)
 */
const filterOpportunities = async (req, res) => {
    try {
        const { status, skill, location } = req.query;
        const opportunities = await opportunityService.filterOpportunities({ status, skill, location });
        return sendSuccess(res, opportunities, "Filtering completed successfully");
    } catch (error) {
        return sendError(res, "Filter execution failed", 500, error.message);
    }
};

module.exports = {
    createOpportunity,
    getAllOpportunities,
    getOpportunityById,
    updateOpportunity,
    deleteOpportunity,
    getMyOpportunities,
    searchOpportunities,
    filterOpportunities
};