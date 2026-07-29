// Backend/middlewares/role.middleware.js

const mongoose  = require('mongoose');
const Opportunity = require('../models/opportunity.model');
const Application = require('../models/application.model');
const { sendError } = require('../utils/apiResponse');

// ObjectId validation guard — prevents CastError process crashes on malformed :id params
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * @desc Ensures the logged-in NGO/User is the actual owner of the opportunity resource.
 *       Admins bypass ownership check but still have the document attached.
 *       Attaches req.opportunity for downstream controllers.
 */
const checkOpportunityOwnership = async (req, res, next) => {
  try {
    const opportunityId = req.params.id;

    if (!isValidObjectId(opportunityId)) {
      return sendError(res, 'Invalid opportunity ID', 400);
    }

    const opportunity = await Opportunity.findById(opportunityId);

    if (!opportunity) {
      return sendError(res, 'Opportunity not found', 404);
    }

    // Admins bypass ownership verification but still get the document attached
    if (req.user.role === 'admin') {
      req.opportunity = opportunity;
      return next();
    }

    // Strict ObjectId string comparison between resource creator and session user
    if (opportunity.ngo_id.toString() !== req.user.id.toString()) {
      return sendError(res, 'Access denied. You do not own this opportunity.', 403);
    }

    req.opportunity = opportunity;
    next();
  } catch (error) {
    return sendError(res, 'Error verifying resource ownership', 500, error.message);
  }
};

/**
 * @desc Ensures the logged-in NGO owns the Opportunity linked to this Application.
 *       Admins bypass. Expects req.params.id to be the Application id.
 *       Attaches req.application and req.opportunity for the controller to reuse.
 */
const checkApplicationOwnershipByNGO = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 'Invalid application ID', 400);
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return sendError(res, 'Application not found', 404);
    }

    const opportunity = await Opportunity.findById(application.opportunity_id);

    if (!opportunity) {
      return sendError(res, 'Opportunity not found', 404);
    }

    if (req.user.role !== 'admin' && opportunity.ngo_id.toString() !== req.user.id.toString()) {
      return sendError(
        res,
        'Access denied. You do not own the opportunity this application belongs to.',
        403
      );
    }

    req.application = application;
    req.opportunity = opportunity;
    next();
  } catch (error) {
    return sendError(res, 'Error verifying resource ownership', 500, error.message);
  }
};

/**
 * @desc Ensures the logged-in volunteer owns this Application (e.g. to withdraw it).
 *       Expects req.params.id to be the Application id.
 *       Attaches req.application for the controller to reuse.
 */
const checkApplicationOwnershipByVolunteer = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 'Invalid application ID', 400);
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return sendError(res, 'Application not found', 404);
    }

    if (application.volunteer_id.toString() !== req.user.id.toString()) {
      return sendError(res, 'Access denied. You do not own this application.', 403);
    }

    req.application = application;
    next();
  } catch (error) {
    return sendError(res, 'Error verifying resource ownership', 500, error.message);
  }
};

/**
 * @desc Ensures the requester is allowed to view a single Application:
 *       the volunteer who submitted it, the NGO who owns the linked opportunity,
 *       or an admin. Attaches req.application (populated) so the controller
 *       doesn't need to re-fetch.
 */
const checkApplicationViewAccess = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 'Invalid application ID', 400);
    }

    const application = await Application.findById(req.params.id)
      .populate('volunteer_id', 'name email')
      .populate('opportunity_id');

    if (!application) {
      return sendError(res, 'Application not found', 404);
    }

    if (req.user.role === 'admin') {
      req.application = application;
      return next();
    }

    if (req.user.role === 'volunteer') {
      if (application.volunteer_id._id.toString() !== req.user.id.toString()) {
        return sendError(res, 'Access denied. This is not your application.', 403);
      }
      req.application = application;
      return next();
    }

    // NGO role: verify ownership through the linked opportunity
    if (application.opportunity_id.ngo_id.toString() !== req.user.id.toString()) {
      return sendError(
        res,
        'Access denied. You do not own the opportunity this application belongs to.',
        403
      );
    }
    req.application = application;
    next();
  } catch (error) {
    return sendError(res, 'Error verifying resource access', 500, error.message);
  }
};

/**
 * @desc Returns the list of Opportunity ids owned by this NGO.
 *       Used to scope list endpoints so an NGO only sees applications
 *       tied to their own opportunities. Uses .lean() — read-only.
 */
const getOwnedOpportunityIds = async (ngoId) => {
  const owned = await Opportunity.find({ ngo_id: ngoId }).select('_id').lean();
  return owned.map((o) => o._id.toString());
};

module.exports = {
  checkOpportunityOwnership,
  checkApplicationOwnershipByNGO,
  checkApplicationOwnershipByVolunteer,
  checkApplicationViewAccess,
  getOwnedOpportunityIds,
};