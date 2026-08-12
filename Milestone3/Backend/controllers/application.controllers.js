// Backend/controllers/application.controllers.js

const mongoose = require('mongoose');
const applicationService = require('../services/application.service');
const Opportunity = require('../models/opportunity.model');
const Application = require('../models/application.model');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const buildQuery = require('../utils/queryBuilder');
const { getOwnedOpportunityIds } = require('../middlewares/role.middleware');

// ObjectId validation guard — prevents CastError crashes on malformed :id params
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * @desc    Apply for an opportunity
 * @route   POST /api/applications
 * @access  Private (Volunteer)
 */
const applyForOpportunity = async (req, res) => {
    try {

        const { opportunity_id } = req.body;

        // Check if opportunity exists
        const opportunity = await Opportunity.findById(opportunity_id);

        if (!opportunity) {
            return sendError(res, "Opportunity not found", 404);
        }

        // P0-05: Reject applications to admin-removed opportunities.
        // isRemovedByAdmin=true means the opportunity is hidden from the public
        // feed, so it can never be legitimately discovered by a volunteer.
        if (opportunity.isRemovedByAdmin) {
            return sendError(res, "Opportunity not found", 404);
        }

        // Opportunity must be open
        if (opportunity.status !== "open") {
            return sendError(res, "This opportunity is closed", 400);
        }

        // Prevent duplicate application
        const alreadyApplied = await Application.findOne({
            opportunity_id,
            volunteer_id: req.user.id
        });

        if (alreadyApplied) {
            return sendError(res, "You have already applied for this opportunity", 400);
        }

        const application = await applicationService.apply({
            opportunity_id,
            volunteer_id: req.user.id
        });

        return sendSuccess(
            res,
            application,
            "Application submitted successfully",
            201
        );

    } catch (error) {

        if (error.code === 11000) {
            return sendError(res, "You have already applied for this opportunity", 409);
        }

        return sendError(res, "Failed to apply", 500, error.message);
    }
};


/**
 * @desc    Get all applications
 * @route   GET /api/applications
 * @access  Private (NGO/Admin)
 */
const getApplications = async (req, res) => {

    try {

        const { skip, limit, page, sort } = buildQuery(req);

        const filter = {};

        // Filter by specific opportunity
       // Filter by specific opportunity
if (req.query.opportunity) {

    // Prevent malformed ObjectId values
    if (!isValidObjectId(req.query.opportunity)) {
        return sendError(res, "Invalid opportunity ID", 400);
    }

    if (req.user.role !== "admin") {

        const opportunity = await Opportunity.findById(req.query.opportunity);

        if (!opportunity || opportunity.ngo_id.toString() !== req.user.id.toString()) {
            return sendError(res, "Access denied", 403);
        }
    }

    filter.opportunity_id = req.query.opportunity;

}else if (req.user.role !== "admin") {

            // NGO can only view applications for their own opportunities
            const ownedIds = await getOwnedOpportunityIds(req.user.id);
            filter.opportunity_id = { $in: ownedIds };

        }

        // Filter by application status
        if (req.query.status) {

            const allowedStatus = ["pending", "accepted", "rejected"];

            if (!allowedStatus.includes(req.query.status)) {
                return sendError(
                    res,
                    "Invalid status. Allowed values are pending, accepted, rejected.",
                    400
                );
            }

            filter.status = req.query.status;
        }

        const applications = await applicationService.getApplications(
            filter,
            skip,
            limit,
            sort
        );

        return sendSuccess(
            res,
            {
                page,
                limit,
                applications
            },
            "Applications fetched successfully"
        );

    } catch (error) {

        return sendError(
            res,
            "Failed to fetch applications",
            500,
            error.message
        );

    }

};


/**
 * @desc    Get application by ID
 * @route   GET /api/applications/:id
 * @access  Private
 */
const getApplicationById = async (req, res) => {

    try {

        if (!isValidObjectId(req.params.id)) {
            return sendError(res, 'Invalid application ID', 400);
        }

        return sendSuccess(
            res,
            req.application,
            'Application fetched successfully'
        );

    } catch (error) {

        return sendError(res, 'Failed to fetch application', 500, error.message);

    }

};


/**
 * @desc    Update application status
 * @route   PUT /api/applications/:id
 * @access  Private (NGO/Admin)
 */
const updateApplicationStatus = async (req, res) => {

    try {

        if (req.application.status !== "pending") {

            return sendError(
                res,
                `Application already ${req.application.status}`,
                400
            );

        }

        const updated = await applicationService.updateStatus(
            req.application._id,
            req.body.status
        );

        return sendSuccess(
            res,
            updated,
            "Application status updated successfully"
        );

    } catch (error) {

        return sendError(
            res,
            "Failed to update status",
            500,
            error.message
        );

    }

};


/**
 * @desc    Withdraw application
 * @route   DELETE /api/applications/:id
 * @access  Private (Volunteer)
 */
const withdrawApplication = async (req, res) => {

    try {

        if (req.application.status !== "pending") {

            return sendError(
                res,
                `This application has already been ${req.application.status} and can no longer be withdrawn`,
                400
            );

        }

        await applicationService.withdraw(req.application._id);

        return sendSuccess(
            res,
            null,
            "Application withdrawn successfully"
        );

    } catch (error) {

        return sendError(
            res,
            "Failed to withdraw application",
            500,
            error.message
        );

    }

};


/**
 * @desc    Get my applications
 * @route   GET /api/applications/my-applications
 * @access  Private (Volunteer)
 */
const getMyApplications = async (req, res) => {

    try {

        // P1-03: Paginated using the project's existing buildQuery utility.
        // Supports: ?page=1&limit=10&sort=createdAt&order=desc
        // Max limit is capped at 100 by buildQuery — prevents unbounded loads.
        const { page, limit, skip, sort } = buildQuery(req);

        const filter = { volunteer_id: req.user.id };

        const [applications, total] = await Promise.all([
            Application.find(filter)
                .populate('opportunity_id')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),
            Application.countDocuments(filter),
        ]);

        return sendSuccess(
            res,
            {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                applications,
            },
            "My applications fetched successfully"
        );

    } catch (error) {

        return sendError(
            res,
            "Failed to fetch applications",
            500,
            error.message
        );

    }

};


module.exports = {

    applyForOpportunity,
    getApplications,
    getApplicationById,
    updateApplicationStatus,
    withdrawApplication,
    getMyApplications

};