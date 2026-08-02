// Backend/routes/pickup.routes.js

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middlewares/auth.middleware');

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

// NGO — pickups matched to their location + wasteTypes (default: Pending feed).
// NGO-only: admins must never participate in the pickup workflow, and their
// own pickups are excluded from this feed at the query level regardless
// (see pickupService.getPickupsForNgo).
router.get('/available', authorize('ngo'), getAvailablePickups);

// NGO — pickups they are currently/previously assigned to. NGO-only for the
// same reason as above — an admin can never hold an agent_id.
router.get('/assigned-to-me', authorize('ngo'), getAssignedToMe);

// Admin — system-management view of every pickup in the system, any owner,
// any status. Deliberately separate from the NGO discovery feed above.
router.get('/', authorize('admin'), getAllPickups);

// ── NGO status-transition endpoint ──────────────────────────────────────
// NGO-only. Separate from the volunteer/admin's PUT /:id so the two write
// paths can never collide: owners edit pickup details, NGOs only ever move
// status. Admins are intentionally excluded — they never assign, complete,
// or cancel a pickup, and can never become an agent_id.
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

// Volunteer — cancel their own Pending pickup. Kept separate from the NGO
// status-transition endpoint: an unrelated matching NGO must never be able
// to cancel a pickup it hasn't been assigned to (see checkPickupNgoMatch).
// Not offered to admin: admin never owns, edits, deletes, or cancels a
// pickup — it has no CRUD role in the pickup workflow at all, only the
// read-only views (list all / by ID / status) above.
router.patch(
  '/:id/cancel',
  authorize('volunteer'),
  checkPickupOwnershipByVolunteer,
  cancelPickup
);

module.exports = router;