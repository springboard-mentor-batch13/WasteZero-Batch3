const jwt = require('jsonwebtoken');
const User = require('../models/users.model');

const protect = async (req, res, next) => {
   
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            
            token = req.headers.authorization.split(' ')[1];

            
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

    
            req.user = await User.findById(decoded.id);

        
            return next();
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized, token validation failed'
            });
        }
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized, no session token found'
        });
    }
};


const authorize = (...roles) => {
    return (req, res, next) => {
       
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Forbidden: User role '${req.user?.role || 'unknown'}' is not authorized to access this resource`
            });
        }
        next();
    };
};

module.exports = {
    protect,
    authorize
};