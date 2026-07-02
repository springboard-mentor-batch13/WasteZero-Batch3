const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    
    console.error(`System Error Intercepted: ${err.message}`);

    
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        error.message = `Account creation failed: That ${field} is already registered.`;
        error.statusCode = 400;
    }

    
    if (err.name === 'ValidationError') {
        error.message = Object.values(err.errors).map(val => val.message).join(', ');
        error.statusCode = 400;
    }

    res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Internal Server Error encountered'
    });
};

module.exports = errorHandler;