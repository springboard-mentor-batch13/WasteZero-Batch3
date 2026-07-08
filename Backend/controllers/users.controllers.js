const User = require('../models/users.model');
const bcrypt = require('bcryptjs');

//   Get current logged in user profile
//   GET /api/users/profile

const getUserProfile = async (req, res) => {
    try {
      
        const user = await User.findById(req.user.id);
        
        if (user) {
            res.status(200).json({
                success: true,
                user: {
                    id: user._id,
                    name: user.name,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    location: user.location,
                    skills: user.skills,
                    bio: user.bio
                }
            });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

//    Update user profile details
//    PUT /api/users/profile

const updateUserProfile = async (req, res) => {
    try {

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }


        user.name = req.body.name || user.name;
        user.location = req.body.location || user.location;
        user.skills = req.body.skills || user.skills;
        user.bio = req.body.bio || user.bio;


        const updatedUser = await user.save();
        return res.status(200).json({
            success: true,
            user: updatedUser
        });

    } catch (err) {

        console.log(err);

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};

//    Change account password securely
//    PUT /api/users/change-password

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id).select('+password');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

       
        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }

        user.password = newPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getUserProfile,
    updateUserProfile,
    changePassword
};