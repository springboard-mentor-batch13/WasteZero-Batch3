// Backend/controllers/pickup.controllers.js
//
// ── Pickup controller layer ───────────────────────────────────────────────────
//
// Controllers are thin. All business logic lives in pickup.service.js.
// Each controller:
//   1. Extracts validated inputs
//   2. Calls the appropriate service function
//   3. Handles null (→ 409 conflict) vs actual data (→ 200/201)
//   4. Returns a formatted response
//
// The 12-hour display transform (addTimeDisplayFields) is applied inside the
// service layer at formatPickupResponse — controllers receive already-formatted
// data and do NOT apply it themselves.

const pickupService  = require('../services/pickup.service');
const matchingService = require('../services/matching.service');
const Pickup          = require('../models/pickup.model');
const buildQuery      = require('../utils/queryBuilder');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { checkProfileCompleteness } = require('../utils/profileCompleteness');
const { canTransition } = require('../utils/pickup.transitions');

// ---------------------------------------------------------------------------
// Volunteer — Create
// ---------------------------------------------------------------------------

/**
 * @desc    Create a new pickup request
 * @route   POST /api/pickups
 * @access  Volunteer
 */
const createPickup = async (req, res) => {
  try {
    const pickup = await pickupService.createPickup(req.user.id, req.body);

    // Fire-and-forget NGO match notifications — failure must not affect the
    // response; a notification error is logged, never thrown.
    matchingService.notifyMatchedNgos(pickup).catch((err) => {
      console.error('[Matching] Failed to notify matched NGOs on create:', err.message);
    });

    return sendSuccess(res, pickup, 'Pickup created successfully', 201);
  } catch (error) {
    return sendError(res, 'Failed to create pickup', 500, error.message);
  }
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * @desc    Get a single pickup by ID
 * @route   GET /api/pickups/:id
 * @access  Volunteer (owner) / NGO (assigned) / Admin
 *
 * req.pickup is pre-fetched and populated by checkPickupViewAccess middleware.
 * Apply formatPickupResponse to ensure 12-hour display fields are present
 * even if the middleware returned a Mongoose doc instead of lean.
 */
const getPickupById = async (req, res) => {
  try {
    const pickup = pickupService.formatPickupResponse(
      typeof req.pickup.toObject === 'function' ? req.pickup.toObject() : req.pickup
    );
    return sendSuccess(res, pickup, 'Pickup fetched successfully');
  } catch (error) {
    return sendError(res, 'Failed to fetch pickup', 500, error.message);
  }
};

/**
 * @desc    Get the logged-in volunteer's own pickups (paginated, optional status filter)
 * @route   GET /api/pickups/my-pickups
 * @access  Volunteer
 */
const getMyPickups = async (req, res) => {
  try {
    const { skip, limit, page, sort } = buildQuery(req);

    if (req.query.status && !Pickup.STATUSES.includes(req.query.status)) {
      return sendError(
        res,
        `Invalid status filter. Allowed values: ${Pickup.STATUSES.join(', ')}.`,
        400
      );
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
 * @desc    Get Pending pickups matched to the logged-in NGO
 * @route   GET /api/pickups/available
 * @access  NGO
 */
const getAvailablePickups = async (req, res) => {
  try {
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
 * @desc    Get pickups assigned to the logged-in NGO
 * @route   GET /api/pickups/assigned-to-me
 * @access  NGO
 */
const getAssignedToMe = async (req, res) => {
  try {
    const { skip, limit, page, sort } = buildQuery(req);

    // NGO can filter by any status (including Missed — a Missed pickup that had
    // an NGO assigned will still appear in their history via agent_id).
    // We only exclude Pending since a Pending pickup has no agent yet.
    const ALLOWED_STATUSES = Pickup.STATUSES.filter((s) => s !== 'Pending');
    if (req.query.status && !ALLOWED_STATUSES.includes(req.query.status)) {
      return sendError(
        res,
        `Invalid status filter. Allowed values: ${ALLOWED_STATUSES.join(', ')}.`,
        400
      );
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
 * @desc    Get all pickups (admin oversight view)
 * @route   GET /api/pickups
 * @access  Admin
 */
const getAllPickups = async (req, res) => {
  try {
    const { skip, limit, page, sort } = buildQuery(req);

    if (req.query.status && !Pickup.STATUSES.includes(req.query.status)) {
      return sendError(
        res,
        `Invalid status filter. Allowed values: ${Pickup.STATUSES.join(', ')}.`,
        400
      );
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

// ---------------------------------------------------------------------------
// Volunteer — Mutating
// ---------------------------------------------------------------------------

/**
 * @desc    Update a pickup's details (address, schedule, waste types, notes)
 * @route   PUT /api/pickups/:id
 * @access  Volunteer (owner, Pending only — enforced by middleware + guard here)
 */
const updatePickup = async (req, res) => {
  try {
    // req.pickup is attached by checkPickupOwnershipByVolunteer
    if (req.pickup.status !== 'Pending') {
      return sendError(
        res,
        `This pickup is ${req.pickup.status} and can no longer be edited. Only Pending pickups can be edited.`,
        400
      );
    }

    // Snapshot matching fields to decide whether to re-notify NGOs
    const previousCity       = req.pickup.address?.city;
    const previousWasteTypes = Array.isArray(req.pickup.wasteTypes)
      ? [...req.pickup.wasteTypes].sort()
      : [];

    const updated = await pickupService.updatePickupInstance(req.pickup, req.body);

    // null → pickup was moved out of Pending (claimed, cancelled, etc.)
    // between the ownership check above and the atomic write (race)
    if (!updated) {
      return sendError(
        res,
        'This pickup was just updated by someone else. Please refresh and try again.',
        409
      );
    }

    const cityChanged        = previousCity !== updated.address?.city;
    const updatedWasteTypes  = Array.isArray(updated.wasteTypes)
      ? [...updated.wasteTypes].sort()
      : [];
    const wasteTypesChanged  = JSON.stringify(previousWasteTypes) !== JSON.stringify(updatedWasteTypes);

    if (cityChanged || wasteTypesChanged) {
      matchingService.notifyMatchedNgos(updated).catch((err) => {
        console.error('[Matching] Failed to notify matched NGOs on update:', err.message);
      });
    }

    return sendSuccess(res, updated, 'Pickup updated successfully');
  } catch (error) {
    return sendError(res, 'Failed to update pickup', 500, error.message);
  }
};

/**
 * @desc    Cancel a volunteer's own Pending pickup
 * @route   PATCH /api/pickups/:id/cancel
 * @access  Volunteer (owner, Pending only)
 */
const cancelPickup = async (req, res) => {
  try {
    // req.pickup attached by checkPickupOwnershipByVolunteer
    if (req.pickup.status !== 'Pending') {
      return sendError(
        res,
        `This pickup is ${req.pickup.status} and can no longer be cancelled. Only Pending pickups can be cancelled.`,
        400
      );
    }

    const updated = await pickupService.cancelPendingPickup(req.pickup._id, req.user.id);

    // null → pickup was modified between the middleware read and this write (race)
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
 * @desc    Delete a volunteer's own Pending pickup
 * @route   DELETE /api/pickups/:id
 * @access  Volunteer (owner, Pending only)
 */
const deletePickup = async (req, res) => {
  try {
    // req.pickup attached by checkPickupDeleteAccess
    if (req.pickup.status !== 'Pending') {
      return sendError(
        res,
        `This pickup is ${req.pickup.status} and cannot be deleted. Only Pending pickups can be deleted — cancel it instead.`,
        400
      );
    }

    const deleted = await pickupService.deletePickupById(req.pickup._id, req.user.id);

    if (!deleted) {
      return sendError(
        res,
        'This pickup was just updated by someone else. Please refresh and try again.',
        409
      );
    }

    return sendSuccess(res, null, 'Pickup deleted successfully');
  } catch (error) {
    return sendError(res, 'Failed to delete pickup', 500, error.message);
  }
};

/**
 * @desc    Reschedule a Missed pickup
 * @route   PATCH /api/pickups/:id/reschedule
 * @access  Volunteer (owner, Missed only, under reschedule cap)
 *
 * checkPickupRescheduleAccess middleware already verified:
 *   - ownership, status === Missed, rescheduleCount < cap
 * The service re-enforces the cap atomically.
 */
const reschedulePickup = async (req, res) => {
  try {
    const updated = await pickupService.reschedulePickup(
      req.pickup._id,
      req.user.id,
      {
        scheduledDate:      req.body.scheduledDate,
        preferredTimeSlot:  req.body.preferredTimeSlot,
      }
    );

    // null means the cap was hit in the race between middleware and service,
    // or the pickup was no longer Missed (concurrent sweep / another reschedule)
    if (!updated) {
      return sendError(
        res,
        `Unable to reschedule. The pickup may have already reached the reschedule limit (${Pickup.RESCHEDULE_CAP}x) or was updated concurrently. Please refresh and try again.`,
        409
      );
    }

    // Re-notify matched NGOs — this is now a new open pickup
    matchingService.notifyMatchedNgos(updated).catch((err) => {
      console.error('[Matching] Failed to notify matched NGOs on reschedule:', err.message);
    });

    return sendSuccess(res, updated, 'Pickup rescheduled successfully');
  } catch (error) {
    return sendError(res, 'Failed to reschedule pickup', 500, error.message);
  }
};

// ---------------------------------------------------------------------------
// NGO — Status transition
// ---------------------------------------------------------------------------

/**
 * @desc    NGO claims (Pending→Assigned) or updates status (Assigned→Completed/Cancelled)
 * @route   PATCH /api/pickups/:id/status
 * @access  NGO
 *
 * checkPickupNgoMatch middleware already verified eligibility/ownership.
 * Validation middleware already ensured status ∈ NGO_STATUS_INPUT_ALLOWED.
 * canTransition is the single transition authority; we call it here for the
 * friendly pre-check message.  The atomic service call is the real gate.
 */
const updatePickupStatus = async (req, res) => {
  try {
    const { status: nextStatus } = req.body;
    const fromStatus = req.pickup.status;

    // Friendly pre-check (service will also enforce atomically)
    if (!canTransition('ngo', fromStatus, nextStatus)) {
      return sendError(
        res,
        `NGO cannot move a pickup from "${fromStatus}" to "${nextStatus}".`,
        400
      );
    }

    const updated = await pickupService.transitionPickupStatus({
      pickupId:   req.pickup._id,
      fromStatus,
      nextStatus,
      ngoId:      req.user.id,
    });

    if (!updated) {
      return sendError(
        res,
        'This pickup was just updated by someone else. Please refresh and try again.',
        409
      );
    }

    return sendSuccess(res, updated, `Pickup marked as ${nextStatus}`);
  } catch (error) {
    // transitionPickupStatus throws a typed error for invalid transitions
    const statusCode = error.statusCode || 500;
    return sendError(res, error.message || 'Failed to update pickup status', statusCode);
  }
};

// ---------------------------------------------------------------------------
// Admin — Pickup management
// ---------------------------------------------------------------------------

/**
 * @desc    Admin: edit a pickup's details (any status, any owner)
 * @route   PUT /api/pickups/admin/:id
 * @access  Admin
 */
const adminUpdatePickup = async (req, res) => {
  try {
    const updated = await pickupService.adminEditPickupFields(req.pickup._id, req.body);

    if (!updated) {
      return sendError(res, 'Pickup not found', 404);
    }

    return sendSuccess(res, updated, 'Pickup updated successfully');
  } catch (error) {
    return sendError(res, 'Failed to update pickup', 500, error.message);
  }
};

/**
 * @desc    Admin: force a pickup to Completed or Cancelled
 * @route   PATCH /api/pickups/admin/:id/status
 * @access  Admin
 *
 * Two-layer enforcement:
 *   Layer 1 — adminPickupStatusValidationRules() in validation middleware
 *              (rejects any status outside {Completed, Cancelled})
 *   Layer 2 — adminForceStatus() in service
 *              (rejects if current status is not in {Pending, Assigned})
 */
const adminForcePickupStatus = async (req, res) => {
  try {
    const { status: nextStatus } = req.body;

    const updated = await pickupService.adminForceStatus(req.pickup._id, nextStatus);

    // null means the pickup exists but is not in an open state (already
    // Completed, Cancelled, or Missed) — the service's atomic filter didn't match
    if (!updated) {
      return sendError(
        res,
        `Cannot force status to "${nextStatus}". Only Pending or Assigned pickups can be force-closed by an admin. Check the pickup's current status and try again.`,
        409
      );
    }

    return sendSuccess(res, updated, `Pickup force-closed to ${nextStatus}`);
  } catch (error) {
    return sendError(res, 'Failed to update pickup status', 500, error.message);
  }
};

/**
 * @desc    Admin: hard-delete a pickup
 * @route   DELETE /api/pickups/admin/:id
 * @access  Admin
 */
const adminDeletePickup = async (req, res) => {
  try {
    const deleted = await pickupService.adminDeletePickup(req.pickup._id);

    if (!deleted) {
      return sendError(res, 'Pickup not found', 404);
    }

    return sendSuccess(res, null, 'Pickup deleted successfully');
  } catch (error) {
    return sendError(res, 'Failed to delete pickup', 500, error.message);
  }
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Volunteer read
  getMyPickups,
  getAvailablePickups,
  getAssignedToMe,
  getAllPickups,
  getPickupById,

  // Volunteer mutating
  createPickup,
  updatePickup,
  cancelPickup,
  deletePickup,
  reschedulePickup,

  // NGO
  updatePickupStatus,

  // Admin
  adminUpdatePickup,
  adminForcePickupStatus,
  adminDeletePickup,
};