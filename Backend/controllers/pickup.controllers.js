// Backend/controllers/pickup.controllers.js

const pickupService = require('../services/pickup.service');
const matchingService = require('../services/matching.service');
const Pickup = require('../models/pickup.model');
const buildQuery = require('../utils/queryBuilder');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { checkProfileCompleteness } = require('../utils/profileCompleteness');

/**
 * @desc    Create a new pickup request
 * @route   POST /api/pickups
 * @access  Private (Volunteer only — admin never participates in the
 *          pickup workflow and cannot hold a pickup as owner)
 */
const createPickup = async (req, res) => {
  try {
    const pickup = await pickupService.createPickup(req.user.id, req.body);

    // Fire-and-forget: find NGOs whose coverage city + wasteTypes match
    // this pickup and notify them to claim it. Matching/notification
    // failures must never fail pickup creation, so errors are only logged.
    matchingService.notifyMatchedNgos(pickup).catch((err) => {
      console.error('[Matching] Failed to notify matched NGOs:', err.message);
    });

    return sendSuccess(res, pickup, 'Pickup created successfully', 201);
  } catch (error) {
    return sendError(res, 'Failed to create pickup', 500, error.message);
  }
};

/**
 * @desc    Get a single pickup by ID
 * @route   GET /api/pickups/:id
 * @access  Private (Owner volunteer, assigned NGO, or admin — resolved by
 *          checkPickupViewAccess middleware)
 */
const getPickupById = async (req, res) => {
  try {
    // req.pickup is pre-fetched and attached by checkPickupViewAccess
    return sendSuccess(res, req.pickup, 'Pickup fetched successfully');
  } catch (error) {
    return sendError(res, 'Failed to fetch pickup', 500, error.message);
  }
};

/**
 * @desc    Update a pickup's details (address, schedule, waste types, notes)
 * @route   PUT /api/pickups/:id
 * @access  Private (Volunteer, owner only, and only while it's Pending —
 *          admin never edits pickups)
 */
const updatePickup = async (req, res) => {
  try {
    // req.pickup is pre-fetched and attached by checkPickupOwnershipByVolunteer
    if (req.pickup.status !== 'Pending') {
      return sendError(
        res,
        `This pickup is already ${req.pickup.status} and can no longer be edited`,
        400
      );
    }

    const updated = await pickupService.updatePickupInstance(req.pickup, req.body);

    // Fire-and-forget: re-run NGO matching on every update (not just
    // creation) so any NGO now matching the pickup's current city/
    // wasteTypes gets notified, regardless of which field changed.
    // Matching/notification failures must never fail the update, so
    // errors are only logged.
    matchingService.notifyMatchedNgos(updated).catch((err) => {
      console.error('[Matching] Failed to notify matched NGOs on update:', err.message);
    });

    return sendSuccess(res, updated, 'Pickup updated successfully');
  } catch (error) {
    return sendError(res, 'Failed to update pickup', 500, error.message);
  }
};

/**
 * @desc    Delete a pickup
 * @route   DELETE /api/pickups/:id
 * @access  Private (Volunteer — owner only, Pending pickups only.
 *          Admin never deletes pickups — no super-user override here.)
 */
const deletePickup = async (req, res) => {
  try {
    // req.pickup is pre-fetched and attached by checkPickupDeleteAccess.
    if (req.pickup.status !== 'Pending') {
      return sendError(
        res,
        `This pickup is already ${req.pickup.status} and can no longer be deleted. Cancel it instead.`,
        400
      );
    }

    await pickupService.deletePickupById(req.pickup._id);
    return sendSuccess(res, null, 'Pickup deleted successfully');
  } catch (error) {
    return sendError(res, 'Failed to delete pickup', 500, error.message);
  }
};

/**
 * @desc    Cancel a pending pickup (volunteer, owner only). Distinct from
 *          the NGO status-transition endpoint — an unrelated matching NGO
 *          must never be able to cancel a pickup it hasn't claimed; see
 *          checkPickupNgoMatch.
 * @route   PATCH /api/pickups/:id/cancel
 * @access  Private (Volunteer — owner only, Pending pickups only)
 */
const cancelPickup = async (req, res) => {
  try {
    // req.pickup is pre-fetched and attached by checkPickupOwnershipByVolunteer
    if (req.pickup.status !== 'Pending') {
      return sendError(
        res,
        `This pickup is already ${req.pickup.status} and can no longer be cancelled.`,
        400
      );
    }

    const updated = await pickupService.cancelPendingPickup(req.pickup._id, req.user.id);

    // null means the pickup was claimed by an NGO (or otherwise changed)
    // between our read and this write — someone else won the race.
    if (!updated) {
      return sendError(
        res,
        'This pickup was just updated by someone else. Please refresh and try again.',
        409
      );
    }

    return sendSuccess(res, updated, 'Pickup cancelled successfully');
  } catch (error) {
    return sendError(res, 'Failed to cancel pickup', 500, error.message);
  }
};

/**
 * @desc    Get the logged-in volunteer's own pickups (paginated, optional status filter)
 * @route   GET /api/pickups/my-pickups
 * @access  Private (Volunteer)
 */
const getMyPickups = async (req, res) => {
  try {
    const { skip, limit, page, sort } = buildQuery(req);

    const allowedStatus = Pickup.STATUSES;
    if (req.query.status && !allowedStatus.includes(req.query.status)) {
      return sendError(res, `Invalid status. Allowed values are ${allowedStatus.join(', ')}.`, 400);
    }

    const { pickups, total } = await pickupService.getPickupsByVolunteer(req.user.id, {
      status: req.query.status,
      skip,
      limit,
      sort,
    });

    return sendSuccess(
      res,
      { page, limit, total, totalPages: Math.ceil(total / limit), pickups },
      'My pickups fetched successfully'
    );
  } catch (error) {
    return sendError(res, 'Failed to fetch your pickups', 500, error.message);
  }
};

/**
 * @desc    Get pickups matched to the logged-in NGO's coverage
 *          (address.city + wasteTypes, taken from the NGO's own User document).
 *          Always Pending only — this is the "available to claim" feed.
 *          Deliberately does NOT accept a ?status= override: matched
 *          Assigned/Completed/Cancelled pickups belonging to *other* NGOs
 *          are not this NGO's to see (that would leak competitors' claimed
 *          jobs, notes, and agent_id). An NGO's own non-Pending pickups are
 *          already covered by /assigned-to-me.
 * @route   GET /api/pickups/available
 * @access  Private (NGO only — admins never participate in the pickup
 *          workflow, and their own pickups are excluded from this feed
 *          regardless)
 */
const getAvailablePickups = async (req, res) => {
  try {
    // Matching needs wasteTypes + location. pickupService.getPickupsForNgo
    // already degrades to an empty result when these are missing, but that
    // looks identical to "no pickups right now" — tell the NGO explicitly
    // what's missing instead of leaving them guessing.
    const { complete, missing } = checkProfileCompleteness(req.user);
    if (!complete) {
      return res.status(400).json({
        success: false,
        message: `Complete your profile to see matched pickups. Missing: ${missing.join(', ')}.`,
        missingFields: missing,
      });
    }

    const { skip, limit, page, sort } = buildQuery(req);

    const { pickups, total } = await pickupService.getPickupsForNgo(req.user, {
      status: 'Pending',
      skip,
      limit,
      sort,
    });

    return sendSuccess(
      res,
      { page, limit, total, totalPages: Math.ceil(total / limit), pickups },
      'Matched pickups fetched successfully'
    );
  } catch (error) {
    return sendError(res, 'Failed to fetch matched pickups', 500, error.message);
  }
};

/**
 * @desc    Get pickups currently assigned to the logged-in NGO
 * @route   GET /api/pickups/assigned-to-me
 * @access  Private (NGO only)
 */
const getAssignedToMe = async (req, res) => {
  try {
    const { skip, limit, page, sort } = buildQuery(req);

    // An assigned pickup can never be 'Pending', so that's excluded here —
    // derived from the shared list rather than hand-typed to avoid drift.
    const allowedStatus = Pickup.STATUSES.filter((s) => s !== 'Pending');
    if (req.query.status && !allowedStatus.includes(req.query.status)) {
      return sendError(res, `Invalid status. Allowed values are ${allowedStatus.join(', ')}.`, 400);
    }

    const { pickups, total } = await pickupService.getPickupsAssignedToNgo(req.user.id, {
      status: req.query.status,
      skip,
      limit,
      sort,
    });

    return sendSuccess(
      res,
      { page, limit, total, totalPages: Math.ceil(total / limit), pickups },
      'Assigned pickups fetched successfully'
    );
  } catch (error) {
    return sendError(res, 'Failed to fetch assigned pickups', 500, error.message);
  }
};

/**
 * @desc    Transition a pickup's status: Pending -> Assigned (claim), then
 *          Assigned -> Completed or Cancelled (only the assigned agent).
 *          Pending -> Cancelled is NOT reachable here — an eligible-but-
 *          unassigned NGO may only claim a Pending pickup, never cancel
 *          one it hasn't claimed (see canNgoTransitionTo). Coverage-area
 *          matching and assignment ownership are enforced upstream by
 *          checkPickupNgoMatch.
 * @route   PATCH /api/pickups/:id/status
 * @access  Private (NGO only — admins are never part of this workflow)
 */
const updatePickupStatus = async (req, res) => {
  try {
    // req.pickup is pre-fetched and attached by checkPickupNgoMatch — used
    // here only for the friendly pre-check message; the actual authority
    // is the atomic filter inside transitionPickupStatus (see service).
    const { status: nextStatus } = req.body;
    const fromStatus = req.pickup.status;

    // NGO-scoped check (not the general canTransitionTo): a matching-but-
    // unassigned NGO may only claim a Pending pickup (-> Assigned). It must
    // never be able to cancel a Pending pickup it hasn't claimed — that
    // would let any eligible NGO cancel other people's requests. Cancelling
    // a pickup requires already being the assigned agent (see
    // checkPickupNgoMatch, which enforces agent_id === req.user.id for any
    // non-Pending pickup).
    if (!req.pickup.canNgoTransitionTo(nextStatus)) {
      return sendError(
        res,
        `Cannot move pickup from ${fromStatus} to ${nextStatus}`,
        400
      );
    }

    const updated = await pickupService.transitionPickupStatus({
      pickupId: req.pickup._id,
      fromStatus,
      nextStatus,
      ngoId: req.user.id,
    });

    // null means another request changed this pickup's status/agent_id
    // between our read (checkPickupNgoMatch) and this write — someone else
    // won the race (e.g. another NGO already claimed it).
    if (!updated) {
      return sendError(
        res,
        'This pickup was just updated by someone else. Please refresh and try again.',
        409
      );
    }

    return sendSuccess(res, updated, `Pickup marked as ${nextStatus}`);
  } catch (error) {
    return sendError(res, 'Failed to update pickup status', 500, error.message);
  }
};

/**
 * @desc    List every pickup in the system, regardless of owner or status
 *          (paginated, optional ?status= filter). This is a pure
 *          system-management view — it is deliberately separate from the
 *          NGO discovery feed (/available) and carries no coverage
 *          matching or assignment semantics.
 * @route   GET /api/pickups
 * @access  Private (Admin only)
 */
const getAllPickups = async (req, res) => {
  try {
    const { skip, limit, page, sort } = buildQuery(req);

    const allowedStatus = Pickup.STATUSES;
    if (req.query.status && !allowedStatus.includes(req.query.status)) {
      return sendError(res, `Invalid status. Allowed values are ${allowedStatus.join(', ')}.`, 400);
    }

    const { pickups, total } = await pickupService.getAllPickups({
      status: req.query.status,
      skip,
      limit,
      sort,
    });

    return sendSuccess(
      res,
      { page, limit, total, totalPages: Math.ceil(total / limit), pickups },
      'All pickups fetched successfully'
    );
  } catch (error) {
    return sendError(res, 'Failed to fetch pickups', 500, error.message);
  }
};

module.exports = {
  createPickup,
  getPickupById,
  updatePickup,
  deletePickup,
  cancelPickup,
  getMyPickups,
  getAvailablePickups,
  getAssignedToMe,
  getAllPickups,
  updatePickupStatus,
};