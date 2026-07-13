// Backend\controllers\application.controllers.js

const applicationService = require("../services/application.service");
const Opportunity = require("../models/opportunity.model");
const Application = require("../models/application.model");
const { sendSuccess, sendError } = require("../utils/apiResponse");
const buildQuery = require("../utils/queryBuilder");
const { getOwnedOpportunityIds } = require("../middlewares/role.middleware");

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
        return sendError(res, "Failed to apply", 500, error.message);
    }
};


/**
 * @desc    Get all applications. NGOs only ever see applications tied to
 *          their own opportunities; admins see everything.
 * @route   GET /api/applications
 * @access  Private (NGO/Admin)
 */
const getApplications = async (req, res) => {

    try {

        const { skip, limit, page } = buildQuery(req);

        const filter = {};

        if (req.query.opportunity) {
            // Requesting a specific opportunity's applicants — verify the
            // NGO actually owns it before allowing the filter through.
            if (req.user.role !== "admin") {
                const opportunity = await Opportunity.findById(req.query.opportunity);
                if (!opportunity || opportunity.ngo_id.toString() !== req.user.id.toString()) {
                    return sendError(res, "Access denied", 403);
                }
            }
            filter.opportunity_id = req.query.opportunity;
        } else if (req.user.role !== "admin") {
            // No specific opportunity requested — scope to everything this NGO owns
            const ownedIds = await getOwnedOpportunityIds(req.user.id);
            filter.opportunity_id = { $in: ownedIds };
        }

        const applications = await applicationService.getApplications(
            filter,
            skip,
            limit
        );

        return sendSuccess(res, {
            page,
            limit,
            applications
        }, "Applications fetched successfully");

    } catch (error) {

        return sendError(res, "Failed to fetch applications", 500, error.message);

    }

};


/**
 * @desc    Get application by ID. Access already verified by
 *          checkApplicationViewAccess, which also attaches req.application
 *          (populated) so no extra query is needed here.
 * @route   GET /api/applications/:id
 * @access  Private (Owning volunteer, owning NGO, or admin)
 */
const getApplicationById = async (req, res) => {

    try {

        return sendSuccess(
            res,
            req.application,
            "Application fetched successfully"
        );

    } catch (error) {

        return sendError(res, "Failed to fetch application", 500, error.message);

    }

};


/**
 * @desc    Update application status. Ownership already verified by
 *          checkApplicationOwnershipByNGO, which attaches req.application.
 * @route   PUT /api/applications/:id
 * @access  Private (NGO/Admin — owner of the linked opportunity)
 */
const updateApplicationStatus = async (req, res) => {

    try {

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

        return sendError(res, "Failed to update status", 500, error.message);

    }

};


/**
 * @desc    Withdraw application. Ownership already verified by
 *          checkApplicationOwnershipByVolunteer, which attaches req.application.
 * @route   DELETE /api/applications/:id
 * @access  Private (Volunteer — owner of the application)
 */
const withdrawApplication = async (req, res) => {

    try {

        await applicationService.withdraw(req.application._id);

        return sendSuccess(
            res,
            null,
            "Application withdrawn successfully"
        );

    } catch (error) {

        return sendError(res, "Failed to withdraw application", 500, error.message);

    }

};


/**
 * @desc    Get my applications
 * @route   GET /api/applications/my-applications
 * @access  Private (Volunteer)
 */
const getMyApplications = async (req, res) => {

    try {

        const applications = await Application.find({
            volunteer_id: req.user.id
        })
        .populate("opportunity_id");

        return sendSuccess(
            res,
            applications,
            "My applications fetched successfully"
        );

    } catch (error) {

        return sendError(res, "Failed to fetch applications", 500, error.message);

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
