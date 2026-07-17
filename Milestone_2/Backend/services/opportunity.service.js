// services/opportunity.service.js

const Opportunity = require('../models/opportunity.model');

/**
 * Create a new opportunity in the database
 */
const createOpportunity = async (ngoId, opportunityData) => {
    const newOpportunity = new Opportunity({
        ...opportunityData,
        ngo_id: ngoId
    });
    return await newOpportunity.save();
};

/**
 * Get all opportunities with pagination
 */
const getAllOpportunities = async (page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    
    const opportunities = await Opportunity.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const total = await Opportunity.countDocuments();
    
    return {
        opportunities,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

/**
 * Find opportunity by ID
 */
const getOpportunityById = async (id) => {
    return await Opportunity.findById(id);
};

/**
 * Update opportunity instance directly using mongoose save (handles validation)
 */
const updateOpportunityInstance = async (opportunityInstance, updateData) => {
    
    const fieldsToUpdate = ['title', 'description', 'required_skills', 'duration', 'location', 'status', 'image'];
    
    fieldsToUpdate.forEach(field => {
        if (updateData[field] !== undefined) {
            opportunityInstance[field] = updateData[field];
        }
    });

    return await opportunityInstance.save();
};
/**
 * Delete opportunity by ID
 */
const deleteOpportunityById = async (id) => {
    return await Opportunity.findByIdAndDelete(id);
};

/**
 * Get opportunities by specific NGO ID
 */
const getOpportunitiesByNgo = async (ngoId) => {
    return await Opportunity.find({ ngo_id: ngoId }).sort({ createdAt: -1 });
};

/**
 * Search opportunities using MongoDB Text Index
 */
/**
 * Search opportunities by title, description, location,
 * duration, required skills, and status
 */
const searchOpportunities = async (searchQuery) => {

    const regex = new RegExp(searchQuery.trim(), "i");

    return await Opportunity.find({
        $or: [
            { title: regex },
            { description: regex },
            { location: regex },
            { duration: regex },
            { required_skills: { $in: [regex] } },
            { status: regex }
        ]
    }).sort({ createdAt: -1 });

};
/**
 * Filter opportunities dynamically by status, skill, and location
 */
const filterOpportunities = async ({ status, skill, location }) => {
    let queryFilter = {};

    if (status && typeof status === "string") queryFilter.status = status;
    if (location && typeof location === "string") queryFilter.location = new RegExp(location.trim(), 'i');
    if (skill && typeof skill === "string") queryFilter.required_skills = { $in: [new RegExp(skill.trim(), 'i')] };

    return await Opportunity.find(queryFilter).sort({ createdAt: -1 });
};

module.exports = {
    createOpportunity,
    getAllOpportunities,
    getOpportunityById,
    updateOpportunityInstance,
    deleteOpportunityById,
    getOpportunitiesByNgo,
    searchOpportunities,
    filterOpportunities
};