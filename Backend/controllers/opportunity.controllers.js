// Backend/controllers/opportunity.controllers.js

const mongoose = require('mongoose');
const opportunityService = require('../services/opportunity.service');
const matchingService = require('../services/matching.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// ── ObjectId validation guard ───────────────────────────────────────────────
// Rejects malformed IDs before any DB query runs, preventing CastError crashes.
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Create a new opportunity
 * POST /api/opportunities
 * Private (NGO/Admin)
 */
const createOpportunity = async (req, res) => {
  try {
    const savedOpportunity = await opportunityService.createOpportunity(
      req.user.id,
      req.body
    );

    // Fire-and-forget: find volunteers whose skills + location match this
    // opportunity and notify them to apply. Matching/notification failures
    // must never fail opportunity creation, so errors are only logged.
    matchingService.notifyMatchedVolunteers(savedOpportunity).catch((err) => {
      console.error('[Matching] Failed to notify matched volunteers:', err.message);
    });

    return sendSuccess(res, savedOpportunity, 'Opportunity created successfully', 201);
  } catch (error) {
    // If DB write failed after a successful Cloudinary upload, clean up the orphan
    if (req.body.imagePublicId) {
      await opportunityService.deleteCloudinaryAsset(req.body.imagePublicId);
    }
    return sendError(res, 'Failed to create opportunity', 500, error.message);
  }
};

/**
 * Get all opportunities (paginated)
 * GET /api/opportunities
 * Private (Any logged-in user)
 */
const getAllOpportunities = async (req, res) => {
  try {
    const page  = parseInt(req.query.page,  10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    const result = await opportunityService.getAllOpportunities(page, limit);
    return sendSuccess(res, result, 'Opportunities fetched successfully');
  } catch (error) {
    return sendError(res, 'Failed to fetch opportunities', 500, error.message);
  }
};

/**
 * Get details of a specific opportunity
 * GET /api/opportunities/:id
 * Private (Any logged-in user)
 */
const getOpportunityById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 'Invalid opportunity ID', 400);
    }

    const opportunity = await opportunityService.getOpportunityById(req.params.id);
    if (!opportunity) {
      return sendError(res, 'Opportunity not found', 404);
    }
    return sendSuccess(res, opportunity, 'Opportunity details fetched successfully');
  } catch (error) {
    return sendError(res, 'Failed to fetch opportunity details', 500, error.message);
  }
};

/**
 * Update an existing opportunity
 * PUT /api/opportunities/:id
 * Private (NGO/Admin — Owner Only)
 */
const updateOpportunity = async (req, res) => {
  try {
    // req.opportunity is pre-fetched and attached by checkOpportunityOwnership middleware
    const updatedOpportunity = await opportunityService.updateOpportunityInstance(
      req.opportunity,
      req.body
    );
    return sendSuccess(res, updatedOpportunity, 'Opportunity updated successfully');
  } catch (error) {
    // If DB write failed after a new Cloudinary upload, clean up the new orphan asset
    if (req.body.imagePublicId) {
      await opportunityService.deleteCloudinaryAsset(req.body.imagePublicId);
    }
    return sendError(res, 'Failed to update opportunity', 500, error.message);
  }
};

/**
 * Delete an opportunity
 * DELETE /api/opportunities/:id
 * Private (NGO/Admin — Owner Only)
 */
const deleteOpportunity = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 'Invalid opportunity ID', 400);
    }

    // deleteOpportunityById handles Cloudinary asset cleanup internally
    await opportunityService.deleteOpportunityById(req.params.id);
    return sendSuccess(res, null, 'Opportunity deleted successfully');
  } catch (error) {
    return sendError(res, 'Failed to delete opportunity', 500, error.message);
  }
};

/**
 * Get all opportunities created by the logged-in NGO
 * GET /api/opportunities/my-opportunities
 * Private (NGO/Admin)
 */
const getMyOpportunities = async (req, res) => {
  try {
    const opportunities = await opportunityService.getOpportunitiesByNgo(req.user.id);
    return sendSuccess(res, opportunities, 'My opportunities fetched successfully');
  } catch (error) {
    return sendError(res, 'Failed to fetch your opportunities', 500, error.message);
  }
};

/**
 * Search opportunities by title or description
 * GET /api/opportunities/search?q=
 * Private (Any logged-in user)
 */
const searchOpportunities = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return sendError(res, "Search query param 'q' is missing", 400);
    }

    const opportunities = await opportunityService.searchOpportunities(q);
    return sendSuccess(res, opportunities, 'Search completed successfully');
  } catch (error) {
    return sendError(res, 'Search execution failed', 500, error.message);
  }
};

/**
 * Filter opportunities by status, required skill, location, and sort order
 * GET /api/opportunities/filter?status=&skill=&location=&sort=newest|oldest|upcoming
 * Private (Any logged-in user)
 */
const filterOpportunities = async (req, res) => {
  try {
    const { status, skill, location, sort } = req.query;
    const opportunities = await opportunityService.filterOpportunities({
      status,
      skill,
      location,
      sort,
    });
    return sendSuccess(res, opportunities, 'Filtering completed successfully');
  } catch (error) {
    return sendError(res, 'Filter execution failed', 500, error.message);
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
  filterOpportunities,
};