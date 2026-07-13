// utils/apiResponse.js

/**
 * @desc    Sends a successful HTTP response
 */
const sendSuccess = (res, data, message = "Success", statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data
    });
};

/**
 * @desc    Sends an error HTTP response (for operational or caught errors)
 */
const sendError = (res, message = "Internal Server Error", statusCode = 500, errors = null) => {
    const response = {
        success: false,
        message
    };
    
    if (errors) {
        response.errors = errors; // Useful for validation error arrays
    }

    return res.status(statusCode).json(response);
};

module.exports = {
    sendSuccess,
    sendError
};