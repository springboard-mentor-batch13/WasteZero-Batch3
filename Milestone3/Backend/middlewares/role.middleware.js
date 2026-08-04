// Backend/middlewares/role.middleware.js

const mongoose  = require('mongoose');
const Opportunity = require('../models/opportunity.model');
const Application = require('../models/application.model');
const Pickup = require('../models/pickup.model');
const pickupService = require('../services/pickup.service');
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

/**
 * @desc Ensures the logged-in volunteer owns this Pickup. Used for the
 *       "edit" write path (PUT /:id). Pending-only enforcement happens in
 *       the controller (not here), since that's a state check, not an
 *       access-control check. Attaches req.pickup for downstream use.
 *       Admin is never routed through this middleware (see pickup.routes.js).
 */
const checkPickupOwnershipByVolunteer = async (req, res, next) => {
  try {
    const pickupId = req.params.id;

    if (!isValidObjectId(pickupId)) {
      return sendError(res, 'Invalid pickup ID', 400);
    }

    const pickup = await Pickup.findById(pickupId);

    if (!pickup) {
      return sendError(res, 'Pickup not found', 404);
    }

    if (pickup.user_id.toString() !== req.user.id.toString()) {
      return sendError(res, 'Access denied. You do not own this pickup.', 403);
    }

    req.pickup = pickup;
    next();
  } catch (error) {
    return sendError(res, 'Error verifying pickup ownership', 500, error.message);
  }
};

/**
 * @desc Ensures the logged-in volunteer owns this Pickup, for the delete
 *       write path (DELETE /:id). Kept as a distinct named export (mirrors
 *       checkPickupOwnershipByVolunteer) so delete-specific access rules
 *       can diverge from edit-specific ones later without entangling the
 *       two call sites. Pending-only enforcement stays in the controller.
 */
const checkPickupDeleteAccess = async (req, res, next) => {
  try {
    const pickupId = req.params.id;

    if (!isValidObjectId(pickupId)) {
      return sendError(res, 'Invalid pickup ID', 400);
    }

    const pickup = await Pickup.findById(pickupId);

    if (!pickup) {
      return sendError(res, 'Pickup not found', 404);
    }

    if (pickup.user_id.toString() !== req.user.id.toString()) {
      return sendError(res, 'Access denied. You do not own this pickup.', 403);
    }

    req.pickup = pickup;
    next();
  } catch (error) {
    return sendError(res, 'Error verifying pickup ownership', 500, error.message);
  }
};

/**
 * @desc Resolves single-pickup read access for GET /:id per the RBAC matrix:
 *         - Volunteer: only their own pickup (user_id === self)
 *         - NGO:       only if they are the assigned agent (agent_id === self)
 *         - Admin:     any pickup, no restriction
 *       Attaches req.pickup (populated) so the controller doesn't re-fetch.
 */
const checkPickupViewAccess = async (req, res, next) => {
  try {
    const pickupId = req.params.id;

    if (!isValidObjectId(pickupId)) {
      return sendError(res, 'Invalid pickup ID', 400);
    }

    const pickup = await Pickup.findById(pickupId)
      .populate('user_id', 'name email')
      .populate('agent_id', 'name email');

    if (!pickup) {
      return sendError(res, 'Pickup not found', 404);
    }

    if (req.user.role === 'admin') {
      req.pickup = pickup;
      return next();
    }

    if (req.user.role === 'volunteer') {
      if (pickup.user_id._id.toString() !== req.user.id.toString()) {
        return sendError(res, 'Access denied. This is not your pickup.', 403);
      }
      req.pickup = pickup;
      return next();
    }

    // NGO role: only the assigned agent may view — an unmatched/unclaimed
    // pickup is not visible to an NGO via this endpoint (they discover it
    // through /available instead, until they claim it).
    if (!pickup.agent_id || pickup.agent_id._id.toString() !== req.user.id.toString()) {
      return sendError(res, 'Access denied. You are not the assigned agent for this pickup.', 403);
    }

    req.pickup = pickup;
    next();
  } catch (error) {
    return sendError(res, 'Error verifying pickup access', 500, error.message);
  }
};

/**
 * @desc Guards the NGO status-transition endpoint (PATCH /:id/status) per
 *       the RBAC matrix:
 *       
 *       Attaches req.pickup for the controller's pre-check + service call.
 */
const checkPickupNgoMatch = async (req, res, next) => {
  try {
    const pickupId = req.params.id;

    if (!isValidObjectId(pickupId)) {
      return sendError(res, 'Invalid pickup ID', 400);
    }

    const pickup = await Pickup.findById(pickupId);

    if (!pickup) {
      return sendError(res, 'Pickup not found', 404);
    }

    if (pickup.status === 'Pending') {
      // Claim attempt — must match this NGO's coverage area + waste types.
      if (!pickupService.isNgoEligibleForPickup(req.user, pickup)) {
        return sendError(
          res,
          'Access denied. This pickup does not match your coverage area or waste types.',
          403
        );
      }
    } else {
      // Already assigned (or terminal) — only the NGO on record may act.
      // (If the transition itself is invalid, e.g. Completed -> anything,
      // the controller's canTransitionTo check catches that separately.)
      if (!pickup.agent_id || pickup.agent_id.toString() !== req.user.id.toString()) {
        return sendError(
          res,
          'Access denied. You are not the assigned agent for this pickup.',
          403
        );
      }
    }

    req.pickup = pickup;
    next();
  } catch (error) {
    return sendError(res, 'Error verifying pickup access', 500, error.message);
  }
};

module.exports = {
  checkOpportunityOwnership,
  checkApplicationOwnershipByNGO,
  checkApplicationOwnershipByVolunteer,
  checkApplicationViewAccess,
  getOwnedOpportunityIds,
  checkPickupOwnershipByVolunteer,
  checkPickupDeleteAccess,
  checkPickupViewAccess,
  checkPickupNgoMatch,
};