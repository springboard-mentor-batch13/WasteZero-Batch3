// Backend/routes/pickup.routes.js

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middlewares/auth.middleware');

// P1-04: generalLimiter for the NGO available-pickups discovery feed.
// This endpoint triggers regex matching against city/wasteTypes and had no rate limit.
const { generalLimiter } = require('../middlewares/rateLimiter.middleware');

const {
  checkPickupOwnershipByVolunteer,
  checkPickupDeleteAccess,
  checkPickupViewAccess,
  checkPickupNgoMatch,
} = require('../middlewares/role.middleware');

const {
  createPickup,
  getPickupById,
  updatePickup,
  deletePickup,
  getMyPickups,
  getAvailablePickups,
  getAssignedToMe,
  getAllPickups,
  updatePickupStatus,
  cancelPickup,
} = require('../controllers/pickup.controllers');

const {
  pickupValidationRules,
  pickupStatusValidationRules,
  validate,
} = require('../validations/pickup.validation');

// Guard all sub-routes with the primary authentication shield
router.use(protect);

// ── Specialized Query/Listing Endpoints ─────────────────────────────────

// Volunteer — their own pickup history
router.get('/my-pickups', authorize('volunteer'), getMyPickups);


router.get('/available', authorize('ngo'), generalLimiter, getAvailablePickups); // P1-04: rate limited

// NGO — pickups they are currently/previously assigned to. NGO-only for the
// same reason as above — an admin can never hold an agent_id.
router.get('/assigned-to-me', authorize('ngo'), getAssignedToMe);

// Admin — system-management view of every pickup in the system, any owner,
// any status. Deliberately separate from the NGO discovery feed above.
router.get('/', authorize('admin'), getAllPickups);


router.patch(
  '/:id/status',
  authorize('ngo'),
  pickupStatusValidationRules(),
  validate,
  checkPickupNgoMatch,
  updatePickupStatus
);

// ── Core Base CRUD Endpoint Maps (Owner: Volunteer only) ────────────────

router.route('/').post(
  // Create: volunteer-only. Admin is a system-management super-user, not a
  // pickup-workflow participant — it must never hold a pickup as owner, so
  // it is deliberately excluded here (no admin-on-own-record path).
  authorize('volunteer'),
  pickupValidationRules(),
  validate,
  createPickup
);

router
  .route('/:id')
  .get(
    // View-by-ID: volunteer (own), NGO (assigned), or admin (any — pure
    // read, resolved by checkPickupViewAccess).
    authorize('volunteer', 'ngo', 'admin'),
    checkPickupViewAccess,
    getPickupById
  )
  .put(
    // Editing pickup details: volunteer, owner only, enforced by
    // checkPickupOwnershipByVolunteer. Admin is intentionally excluded —
    // it never CRUDs pickups, i.e. it cannot do a volunteer's job either.
    authorize('volunteer'),
    checkPickupOwnershipByVolunteer,
    pickupValidationRules(),
    validate,
    updatePickup
  )
  .delete(
    // Deleting: volunteer, owner only, Pending-only (enforced in the
    // controller). Admin is intentionally excluded — no super-user delete;
    // admin is read-only with respect to pickups.
    authorize('volunteer'),
    checkPickupDeleteAccess,
    deletePickup
  );


router.patch(
  '/:id/cancel',
  authorize('volunteer'),
  checkPickupOwnershipByVolunteer,
  cancelPickup
);

module.exports = router;