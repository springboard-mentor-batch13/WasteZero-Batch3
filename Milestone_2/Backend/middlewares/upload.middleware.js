// middlewares/upload.middleware.js
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { sendError } = require('../utils/apiResponse');

// Cloudinary Configuration setup
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Memory storage setup for temporary buffering
const storage = multer.memoryStorage();

// File check constraint helper (sirf images allowed)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Stream parsing logic to pipe file data to Cloudinary
const uploadToCloudinary = async (req, res, next) => {
    try {
        if (!req.file) {
            // No real upload happened — never trust a client-supplied
            // image URL/string here, only Cloudinary's own result counts.
            delete req.body.image;
            return next();
        }

        // Buffer streaming directly to Cloudinary folder management pipeline
        cloudinary.uploader.upload_stream(
            { folder: 'wastezero_opportunities' },
            (error, result) => {
                if (error) {
                    return sendError(res, "Cloudinary upload failed", 500, error.message);
                }
                // Cloudinary se mila secure absolute URL body me attach karein
                req.body.image = result.secure_url;
                next();
            }
        ).end(req.file.buffer);

    } catch (err) {
        return sendError(res, "File processing failed", 500, err.message);
    }
};

module.exports = { upload, uploadToCloudinary };