// Backend/routes/match.routes.js

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middlewares/auth.middleware');
const { getMatchSuggestions } = require('../controllers/match.controller');

// Volunteer — ranked, top-N open-opportunity matches (skills + location).
router.get('/suggestions', protect, authorize('volunteer'), getMatchSuggestions);

module.exports = router;
