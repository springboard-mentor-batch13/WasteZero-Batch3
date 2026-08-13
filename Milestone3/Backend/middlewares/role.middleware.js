// Backend/middlewares/role.middleware.js

const mongoose    = require('mongoose');
const Opportunity = require('../models/opportunity.model');
const Application = require('../models/application.model');
const Pickup      = require('../models/pickup.model');
const pickupService = require('../services/pickup.service');
const { sendError } = require('../utils/apiResponse');

// ObjectId validation guard — prevents CastError process crashes on malformed :id params
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);


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
      const volId = application.volunteer_id?._id?.toString() || application.volunteer_id?.toString();
      if (volId !== req.user.id.toString()) {
        return sendError(res, 'Access denied. This is not your application.', 403);
      }
      req.application = application;
      return next();
    }

    // NGO role: verify ownership through the linked opportunity
    const oppNgoId = application.opportunity_id?.ngo_id?.toString();
    if (!oppNgoId || oppNgoId !== req.user.id.toString()) {
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


const getOwnedOpportunityIds = async (ngoId) => {
  const owned = await Opportunity.find({ ngo_id: ngoId }).select('_id').lean();
  return owned.map((o) => o._id.toString());
};


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
      const pickupOwnerId = pickup.user_id?._id?.toString() || pickup.user_id?.toString();
      if (pickupOwnerId !== req.user.id.toString()) {
        return sendError(res, 'Access denied. This is not your pickup.', 403);
      }
      req.pickup = pickup;
      return next();
    }

    // NGO is the assigned agent — always allowed.
    const agentId = pickup.agent_id?._id?.toString() || pickup.agent_id?.toString();
    if (agentId && agentId === req.user.id.toString()) {
      req.pickup = pickup;
      return next();
    }

    // NGO is not (yet) the assigned agent, but the pickup is still Pending
    // and matches this NGO's coverage area + waste types — the same
    // eligibility check checkPickupNgoMatch uses for claiming. Without this,
    // an NGO that legitimately sees a pickup in the "available pickups" list
    // would get a 403 the moment the frontend links to a detail view for it.
    if (pickup.status === 'Pending' && pickupService.isNgoEligibleForPickup(req.user, pickup)) {
      req.pickup = pickup;
      return next();
    }

    return sendError(res, 'Access denied. You are not the assigned agent for this pickup.', 403);
  } catch (error) {
    return sendError(res, 'Error verifying pickup access', 500, error.message);
  }
};

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

// ── Pickup: Reschedule access ──────────────────────────────────────────────

/**
 * Guard for PATCH /:id/reschedule (volunteer).
 *
 * Pre-checks (for a clear, early error message):
 *   1. Valid ObjectId
 *   2. Pickup exists
 *   3. Caller is the owner
 *   4. Status is 'Missed'
 *   5. rescheduleCount < RESCHEDULE_CAP
 *
 * The reschedule cap is ALSO enforced atomically inside the service
 * (rescheduleCount: { $lt: cap } in the update filter) — this pre-check is
 * for a friendly, specific error message only, not the actual gate.
 */
const checkPickupRescheduleAccess = async (req, res, next) => {
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

    if (pickup.status !== 'Missed') {
      return sendError(
        res,
        `Only Missed pickups can be rescheduled. This pickup is currently ${pickup.status}.`,
        400
      );
    }

    if (pickup.rescheduleCount >= Pickup.RESCHEDULE_CAP) {
      return sendError(
        res,
        `This pickup has already been rescheduled ${Pickup.RESCHEDULE_CAP} time(s) (the maximum). Please create a new pickup request instead.`,
        409
      );
    }

    req.pickup = pickup;
    next();
  } catch (error) {
    return sendError(res, 'Error verifying reschedule access', 500, error.message);
  }
};

// ── Pickup: Admin access ───────────────────────────────────────────────────

/**
 * Guard for admin pickup routes (PUT /admin/:id, DELETE /admin/:id,
 * PATCH /admin/:id/status).
 *
 * Validates the ID, fetches and attaches the pickup, then continues.
 * Admin is NEVER subject to ownership or status restrictions here —
 * those are enforced in the service layer per the spec's admin permission
 * matrix (§3 / §6).
 *
 * Kept structurally separate from checkPickupOwnershipByVolunteer so that
 * an admin bypass cannot accidentally loosen volunteer checks or vice versa.
 */
const checkPickupAdminAccess = async (req, res, next) => {
  try {
    const pickupId = req.params.id;

    if (!isValidObjectId(pickupId)) {
      return sendError(res, 'Invalid pickup ID', 400);
    }

    const pickup = await Pickup.findById(pickupId)
      .populate('user_id',  'name email')
      .populate('agent_id', 'name email');

    if (!pickup) {
      return sendError(res, 'Pickup not found', 404);
    }

    req.pickup = pickup;
    next();
  } catch (error) {
    return sendError(res, 'Error fetching pickup for admin action', 500, error.message);
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
  checkPickupRescheduleAccess,
  checkPickupAdminAccess,
};