const User = require('../models/users.model');
const jwt = require('jsonwebtoken');


const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, {
        expiresIn: '30d' 
    });
};

//   Register a new user
//   POST /api/auth/register

const registerUser = async (req, res) => {
    try {
        const { name, username, email, password, role } = req.body;

      
        const userExists = await User.findOne({ $or: [{ email }, { username }] });
        if (userExists) {
            return res.status(400).json({
                success: false,
                message: 'User with this email or username already exists'
            });
        }

       
        const user = await User.create({
            name,
            username,
            email,
            password,
            role
        });

        
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token: generateToken(user._id, user.role),
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

//   Auth user & get token (Login via Username)
//   POST /api/auth/login

const loginUser = async (req, res) => {
    try {
        const { username, password } = req.body;

       
        const user = await User.findOne({ username }).select('+password');
        if (!user) {
            
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

       
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        
        res.status(200).json({
            success: true,
            message: 'Login successful',
            token: generateToken(user._id, user.role),
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    registerUser,
    loginUser
};