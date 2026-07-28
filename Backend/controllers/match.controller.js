// Backend/controllers/match.controller.js

const matchingService = require('../services/matching.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * @desc    Get the logged-in volunteer's top-scoring open opportunity
 *          matches, ranked by skill overlap + location match.
 * @route   GET /api/matches/suggestions
 * @access  Private (Volunteer)
 */
const getMatchSuggestions = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const matches = await matchingService.getMatchesForVolunteer(req.user.id, limit);

    return sendSuccess(res, { count: matches.length, matches }, 'Match suggestions fetched successfully');
  } catch (error) {
    return sendError(res, 'Failed to fetch match suggestions', 500, error.message);
  }
};

module.exports = {
  getMatchSuggestions,
};
