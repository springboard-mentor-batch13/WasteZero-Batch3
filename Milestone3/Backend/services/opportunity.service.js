// Backend/services/opportunity.service.js

const cloudinary = require('cloudinary').v2;
const Opportunity = require('../models/opportunity.model');
const Application = require('../models/application.model');

// Cloudinary config (shared with upload.middleware — idempotent, safe to call multiple times)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * @internal
 * Escape regex special characters in user-supplied search/filter input
 * before it is passed into `new RegExp()`. Prevents ReDoS (catastrophic
 * backtracking) from crafted input and prevents unescaped metacharacters
 * (., *, (, etc.) from silently changing search semantics.
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @internal
 * Safely delete a Cloudinary asset by its public_id.
 * Never throws — Cloudinary failures must not crash the application.
 */
const deleteCloudinaryAsset = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    // Log but swallow — orphaned CDN asset is preferable to a 500 response
    console.error('[Cloudinary] Asset deletion failed for public_id:', publicId, err.message);
  }
};


const createOpportunity = async (ngoId, opportunityData) => {
  const {
    title,
    description,
    required_skills,
    duration,
    location,
    date,
    image,
    imagePublicId,
  } = opportunityData;

  const newOpportunity = new Opportunity({
    title,
    description,
    required_skills,
    duration,
    location,
    date,
    image,
    imagePublicId,
    ngo_id: ngoId,
    status: 'open',
  });
  return await newOpportunity.save();
};

// ── Read ────────────────────────────────────────────────────────────────

/**
 * Get all opportunities with pagination, sorted by createdAt desc.
 * Uses .lean() — read-only feed, no Mongoose document methods needed.
 */
const getAllOpportunities = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [opportunities, total] = await Promise.all([
    Opportunity.find()
      .populate('ngo_id', 'name username role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Opportunity.countDocuments(),
  ]);

  return {
    opportunities,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Find opportunity by ID.
 * Not lean — returned to controllers that may populate or check fields.
 */
const getOpportunityById = async (id) => {
  return await Opportunity.findById(id).populate('ngo_id', 'name username role');
};


/**
 * Update an opportunity instance.
 * Handles Cloudinary lifecycle safely.
 *
 * Strategy:
 * 1. Update the document first.
 * 2. Save it successfully.
 * 3. Only then delete the previous Cloudinary asset.
 *
 * This prevents broken image references if MongoDB save fails.
 */
const updateOpportunityInstance = async (opportunityInstance, updateData) => {

  const fieldsToUpdate = [
    'title',
    'description',
    'required_skills',
    'duration',
    'location',
    'status',
    'date',
  ];

  fieldsToUpdate.forEach((field) => {
    if (updateData[field] !== undefined) {
      opportunityInstance[field] = updateData[field];
    }
  });

  // Preserve previous image for cleanup AFTER successful DB save
  const previousImagePublicId = opportunityInstance.imagePublicId;

  if (updateData.imagePublicId) {
    opportunityInstance.image = updateData.image;
    opportunityInstance.imagePublicId = updateData.imagePublicId;
  } else if (updateData.image !== undefined) {
    opportunityInstance.image = updateData.image;
  }

  // Save database FIRST
  const updatedOpportunity = await opportunityInstance.save();

  // Delete old Cloudinary asset ONLY after successful save
  if (
    updateData.imagePublicId &&
    previousImagePublicId &&
    previousImagePublicId !== updateData.imagePublicId
  ) {
    await deleteCloudinaryAsset(previousImagePublicId);
  }

  return updatedOpportunity;
};


const deleteOpportunityById = async (id) => {
  const opportunity = await Opportunity.findById(id);

  if (!opportunity) return null;

  // Cascade delete: remove all applications tied to this opportunity first
  await Application.deleteMany({ opportunity_id: id });

  // Clean up Cloudinary asset
  await deleteCloudinaryAsset(opportunity.imagePublicId);

  return await opportunity.deleteOne();
};

/**
 * Get opportunities created by a specific NGO.
 * Uses .lean() — read-only list.
 * Populates ngo_id with the same fields as getAllOpportunities so that
 * the opportunity-card component can display NGO name and username.
 */
const getOpportunitiesByNgo = async (ngoId) => {
  return await Opportunity.find({ ngo_id: ngoId })
    .populate('ngo_id', 'name username role')
    .sort({ createdAt: -1 })
    .lean();
};


/**
 * Search opportunities using regex across multiple fields.
 * Uses .lean() — read-only search results.
 * User input is regex-escaped before use (see escapeRegex above) to
 * prevent ReDoS and unintended metacharacter behavior.
 */
const searchOpportunities = async (searchQuery) => {
  const regex = new RegExp(escapeRegex(searchQuery.trim()), 'i');

  return await Opportunity.find({
    $or: [
      { title:           regex },
      { description:     regex },
      { location:        regex },
      { duration:        regex },
      { required_skills: { $in: [regex] } },
      { status:          regex },
    ],
  })
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Filter opportunities dynamically by status, skill, and location.
 * Supports an additional 'sort' parameter:
 *   - 'newest'   → createdAt DESC (default)
 *   - 'oldest'   → createdAt ASC
 *   - 'upcoming' → date ASC (events soonest first)
 * Uses .lean() — read-only filter results.
 * User-supplied location/skill values are regex-escaped before use.
 */
const filterOpportunities = async ({ status, skill, location, sort }) => {
  const queryFilter = {};

  if (status   && typeof status   === 'string') queryFilter.status = status;
  if (location && typeof location === 'string') queryFilter.location = new RegExp(escapeRegex(location.trim()), 'i');
  if (skill    && typeof skill    === 'string') queryFilter.required_skills = { $in: [new RegExp(escapeRegex(skill.trim()), 'i')] };

  // Sort resolution
  let sortObj = { createdAt: -1 };         // default: newest first
  if (sort === 'oldest')   sortObj = { createdAt: 1 };
  if (sort === 'upcoming') sortObj = { date: 1, createdAt: -1 };

  return await Opportunity.find(queryFilter).sort(sortObj).lean();
};

module.exports = {
  createOpportunity,
  getAllOpportunities,
  getOpportunityById,
  updateOpportunityInstance,
  deleteOpportunityById,
  getOpportunitiesByNgo,
  searchOpportunities,
  filterOpportunities,
  deleteCloudinaryAsset,      // exported so controllers can call it on DB-write failures
};