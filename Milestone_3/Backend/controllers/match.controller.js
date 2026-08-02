// Backend/controllers/match.controller.js

const matchingService = require('../services/matching.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { checkProfileCompleteness } = require('../utils/profileCompleteness');

/**
 * @desc    Get the logged-in volunteer's top-scoring open opportunity
 *          matches, ranked by skill overlap + location match.
 * @route   GET /api/matches/suggestions
 * @access  Private (Volunteer)
 */
const getMatchSuggestions = async (req, res) => {
  try {
    // Matching needs skills + location. Rather than silently returning an
    // empty list (which looks identical to "no matches right now" and
    // gives the volunteer no idea why), tell them explicitly what's missing.
    const { complete, missing } = checkProfileCompleteness(req.user);
    if (!complete) {
      return res.status(400).json({
        success: false,
        message: `Complete your profile to see match suggestions. Missing: ${missing.join(', ')}.`,
        missingFields: missing,
      });
    }

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
