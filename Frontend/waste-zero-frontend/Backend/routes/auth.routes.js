const express = require('express');
const router = express.Router();
const { registerUser, loginUser } = require('../controllers/auth.controllers');

// Map fields directly to the controllers
router.post('/register', registerUser);
router.post('/login', loginUser);

module.exports = router;