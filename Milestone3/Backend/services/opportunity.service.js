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


const getOpportunityById = async (id) => {
  return await Opportunity.findById(id).populate('ngo_id', 'name username role');
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


const deleteOpportunityById = async (id) => {
  const opportunity = await Opportunity.findById(id);

  if (!opportunity) return null;

  // Cascade delete: remove all applications tied to this opportunity first
  await Application.deleteMany({ opportunity_id: id });

  // Clean up Cloudinary asset
  await deleteCloudinaryAsset(opportunity.imagePublicId);

  return await opportunity.deleteOne();
};

const getOpportunitiesByNgo = async (ngoId) => {
  return await Opportunity.find({ ngo_id: ngoId })
    .populate('ngo_id', 'name username role')
    .sort({ createdAt: -1 })
    .lean();
};

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