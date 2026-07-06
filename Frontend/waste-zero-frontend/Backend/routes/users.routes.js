const express = require('express');
const router = express.Router();
const { getUserProfile, updateUserProfile, changePassword } = require('../controllers/users.controllers');
const { protect } = require('../middlewares/auth.middleware');


router.route('/profile')
      .get(protect, getUserProfile)
      .put(protect, updateUserProfile);

router.put('/change-password', protect, changePassword);

module.exports = router;