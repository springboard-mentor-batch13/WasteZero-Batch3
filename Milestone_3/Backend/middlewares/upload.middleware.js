// Backend/middlewares/upload.middleware.js
//
// Two-stage image pipeline:
//   Stage 1: multer (memoryStorage) — buffers file in RAM, validates type & size
//   Stage 2: uploadToCloudinary    — streams buffer to Cloudinary CDN,
//                                    attaches both secure_url AND public_id
//                                    to req.body for the controller to persist.
//
// Cloudinary lifecycle contract:
//   - secure_url → stored in Opportunity.image (served to the frontend)
//   - public_id  → stored in Opportunity.imagePublicId (used to delete old assets)
//
// Safety rules:
//   - If no file is uploaded, req.body.image and req.body.imagePublicId are
//     deleted (prevents the client from injecting arbitrary URLs).
//   - If the Cloudinary upload fails, the request is rejected with a 500 error.
//   - If a DB write subsequently fails, the controller is responsible for
//     calling cloudinary.uploader.destroy(public_id) to clean up.

const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { sendError } = require('../utils/apiResponse');

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Stage 1: multer (memory storage) ──────────────────────────────────

// Files are held in RAM only — never written to disk.
// This avoids disk I/O and temp-file cleanup overhead.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB hard cap
});

// ── Stage 2: Cloudinary upload ─────────────────────────────────────────

const uploadToCloudinary = async (req, res, next) => {
  try {
    if (!req.file) {
      // No file in this request — strip any client-supplied image strings
      // to prevent URL injection attacks.
      delete req.body.image;
      delete req.body.imagePublicId;
      return next();
    }

    // Stream the in-memory buffer directly to Cloudinary
    cloudinary.uploader.upload_stream(
      {
        folder: 'wastezero_opportunities',
        resource_type: 'image',
      },
      (error, result) => {
        if (error || !result) {
          return sendError(res, 'Cloudinary upload failed', 500, error?.message);
        }

        // Attach both URL and public_id for the controller to persist
        req.body.image         = result.secure_url;
        req.body.imagePublicId = result.public_id;

        next();
      }
    ).end(req.file.buffer);
  } catch (err) {
    return sendError(res, 'File processing failed', 500, err.message);
  }
};

module.exports = { upload, uploadToCloudinary };