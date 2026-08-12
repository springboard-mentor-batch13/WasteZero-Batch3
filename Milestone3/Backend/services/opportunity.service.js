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


const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Soft-delete filter ──────────────────────────────────────────────────────
// All PUBLIC read queries must include this filter so that admin-removed
// opportunities are never visible to normal users.
// Admin paths (e.g. future GET /api/v1/admin/opportunities) MUST NOT use this.
const ACTIVE_FILTER = { isRemovedByAdmin: { $ne: true } };


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
    // soft-delete fields default to false/null in schema — no need to set them here
  });
  return await newOpportunity.save();
};


// P0-05: getAllOpportunities now excludes admin-removed opportunities via ACTIVE_FILTER.
const getAllOpportunities = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [opportunities, total] = await Promise.all([
    Opportunity.find(ACTIVE_FILTER)
      .populate('ngo_id', 'name username role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Opportunity.countDocuments(ACTIVE_FILTER),
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


// P0-05: getOpportunityById now returns null for admin-removed opportunities
// when accessed via normal/public paths. Admin paths can bypass by querying directly.
const getOpportunityById = async (id) => {
  return await Opportunity.findOne({ _id: id, ...ACTIVE_FILTER })
    .populate('ngo_id', 'name username role');
};



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


// P0-05 / P1-07: softDeleteOpportunityById replaces the former deleteOpportunityById.
//
// What changed:
//   BEFORE: Application.deleteMany(cascade) + cloudinary.uploader.destroy + opportunity.deleteOne()
//   AFTER:  Sets isRemovedByAdmin=true + stores reason, timestamp, admin reference.
//           Applications are PRESERVED — they remain for history.
//           Cloudinary image is NOT deleted — opportunity may be restored in future.
//
// Called by: opportunity.controllers.js deleteOpportunity (admin path)
// AdminLog entry is written by the controller AFTER this service call succeeds.
const softDeleteOpportunityById = async (id, adminId, reason) => {
  const opportunity = await Opportunity.findById(id);

  if (!opportunity) return null;

  // If already removed, return it as-is (idempotent)
  if (opportunity.isRemovedByAdmin) {
    return opportunity;
  }

  opportunity.isRemovedByAdmin = true;
  opportunity.removalReason = reason || null;
  opportunity.removedAt = new Date();
  opportunity.removedBy = adminId;   // set server-side — NEVER from req.body

  return await opportunity.save();
};


// P0-05: getOpportunitiesByNgo (NGO's own opportunities) excludes removed ones.
// An NGO should not be able to see their own removed opportunities in their feed.
const getOpportunitiesByNgo = async (ngoId) => {
  return await Opportunity.find({ ngo_id: ngoId, ...ACTIVE_FILTER })
    .populate('ngo_id', 'name username role')
    .sort({ createdAt: -1 })
    .lean();
};

// P0-05 + P1-01: searchOpportunities excludes removed opportunities AND limits to 50.
const searchOpportunities = async (searchQuery) => {
  const regex = new RegExp(escapeRegex(searchQuery.trim()), 'i');

  return await Opportunity.find({
    ...ACTIVE_FILTER,
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
    .limit(50)          // P1-01: hard cap — prevents unbounded memory load
    .lean();
};


// P0-05 + P1-01: filterOpportunities excludes removed opportunities AND limits to 100.
const filterOpportunities = async ({ status, skill, location, sort }) => {
  const queryFilter = { ...ACTIVE_FILTER };

  if (status   && typeof status   === 'string') queryFilter.status = status;
  if (location && typeof location === 'string') queryFilter.location = new RegExp(escapeRegex(location.trim()), 'i');
  if (skill    && typeof skill    === 'string') queryFilter.required_skills = { $in: [new RegExp(escapeRegex(skill.trim()), 'i')] };

  // Sort resolution
  let sortObj = { createdAt: -1 };         // default: newest first
  if (sort === 'oldest')   sortObj = { createdAt: 1 };
  if (sort === 'upcoming') sortObj = { date: 1, createdAt: -1 };

  return await Opportunity.find(queryFilter)
    .sort(sortObj)
    .limit(100)         // P1-01: hard cap — prevents unbounded memory load
    .lean();
};

module.exports = {
  createOpportunity,
  getAllOpportunities,
  getOpportunityById,
  updateOpportunityInstance,
  softDeleteOpportunityById,    // P0-05: new soft-delete (replaces deleteOpportunityById)
  getOpportunitiesByNgo,
  searchOpportunities,
  filterOpportunities,
  deleteCloudinaryAsset,        // exported so controllers can call it on DB-write failures
};