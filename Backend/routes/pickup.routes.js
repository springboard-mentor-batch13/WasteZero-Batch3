// Backend/routes/pickup.routes.js
//
// ── Pickup API routes ─────────────────────────────────────────────────────────
//
// All routes are guarded by `protect` (JWT auth).
// Role authorization uses `authorize(role)` from auth middleware.
// Pickup-specific ownership / access checks use middlewares from role.middleware.js.
//
// ROUTE INVENTORY:
//   POST   /                       Volunteer  create pickup
//   GET    /my-pickups             Volunteer  own pickup history (paginated)
//   GET    /available              NGO        matched Pending pickups
//   GET    /assigned-to-me        NGO        pickups where agent_id = me
//   GET    /                      Admin      all pickups (paginated)
//   GET    /:id                   Vol/NGO/Admin  single pickup (ownership-checked)
//   PUT    /:id                   Volunteer  edit Pending pickup fields
//   DELETE /:id                   Volunteer  delete own Pending pickup
//   PATCH  /:id/cancel            Volunteer  cancel own Pending pickup
//   PATCH  /:id/status            NGO        claim (Pending→Assigned) / complete / cancel
//   PATCH  /:id/reschedule        Volunteer  reschedule a Missed pickup (max 2x)
//   PUT    /admin/:id             Admin      edit any pickup, any status
//   PATCH  /admin/:id/status      Admin      force Completed or Cancelled
//   DELETE /admin/:id             Admin      hard-delete any pickup
//
// WHY /admin/:id IS A SEPARATE PATH (not layered onto /:id):
//   Admin is a governance super-user, not a stand-in for the volunteer owner.
//   Reusing /:id with an "or admin" branch in the ownership middleware is a
//   common source of privilege bugs (admin check loosens volunteer check, or
//   vice versa). Structural separation makes this impossible.
//
// EXPRESS ORDERING NOTE:
//   Literal-segment routes (/my-pickups, /available, /admin/:id) are
//   registered BEFORE the dynamic /:id route so Express matches the literal
//   first and doesn't try to cast "my-pickups" as a Mongo ObjectId.

const express = require('express');
const router  = express.Router();

const { protect, authorize } = require('../middlewares/auth.middleware');
const { generalLimiter, adminLimiter } = require('../middlewares/rateLimiter.middleware');

const {
  checkPickupOwnershipByVolunteer,
  checkPickupDeleteAccess,
  checkPickupViewAccess,
  checkPickupNgoMatch,
  checkPickupRescheduleAccess,
  checkPickupAdminAccess,
} = require('../middlewares/role.middleware');

const {
  createPickup,
  getPickupById,
  updatePickup,
  deletePickup,
  cancelPickup,
  reschedulePickup,
  getMyPickups,
  getAvailablePickups,
  getAssignedToMe,
  getAllPickups,
  updatePickupStatus,
  adminUpdatePickup,
  adminForcePickupStatus,
  adminDeletePickup,
} = require('../controllers/pickup.controllers');

const {
  pickupValidationRules,
  pickupRescheduleValidationRules,
  pickupStatusValidationRules,
  adminPickupStatusValidationRules,
  adminPickupUpdateValidationRules,
  validate,
} = require('../validations/pickup.validation');

// ── Global auth guard ────────────────────────────────────────────────────────
router.use(protect);

// ── Volunteer: own pickup history ────────────────────────────────────────────
router.get('/my-pickups', authorize('volunteer'), getMyPickups);

// ── NGO: discovery + assigned feeds ─────────────────────────────────────────
// generalLimiter applied to the discovery feed: it triggers NGO-eligibility
// matching (regex city + wasteType queries) and is a natural abuse target.
router.get('/available',     authorize('ngo'), generalLimiter, getAvailablePickups);
router.get('/assigned-to-me', authorize('ngo'), getAssignedToMe);

// ── Admin: all-pickups oversight view ────────────────────────────────────────
// Listed before /:id so Express doesn't try to parse "" as an ObjectId.
// Admin get-all uses the same /api/pickups base path, but the authorize check
// gates it to admins only.
router.get('/', authorize('admin'), getAllPickups);

// ── Admin: pickup management routes ─────────────────────────────────────────
// MUST be registered BEFORE /:id routes. Otherwise Express would try to match
// "/admin" as an ObjectId for /:id.
//
// All admin pickup routes:
//   - protected by protect (JWT)
//   - restricted to admin role by authorize()
//   - have their own adminLimiter (not the volunteer mutation rate limit)
//   - use checkPickupAdminAccess (validates ID, fetches pickup, no ownership check)
//   - use structurally separate validation chains from volunteer routes

router
  .route('/admin/:id')
  .put(
    authorize('admin'),
    adminLimiter,
    checkPickupAdminAccess,
    adminPickupUpdateValidationRules(),
    validate,
    adminUpdatePickup
  )
  .delete(
    authorize('admin'),
    adminLimiter,
    checkPickupAdminAccess,
    adminDeletePickup
  );

router.patch(
  '/admin/:id/status',
  authorize('admin'),
  adminLimiter,
  checkPickupAdminAccess,
  adminPickupStatusValidationRules(),
  validate,
  adminForcePickupStatus
);

// ── NGO: status transitions (claim / complete / cancel) ──────────────────────
// Registered before /:id to avoid any ambiguity risk with future sub-routes.
router.patch(
  '/:id/status',
  authorize('ngo'),
  pickupStatusValidationRules(),
  validate,
  checkPickupNgoMatch,  // re-validates eligibility server-side on claim
  updatePickupStatus
);

// ── Volunteer: reschedule a Missed pickup ────────────────────────────────────
router.patch(
  '/:id/reschedule',
  authorize('volunteer'),
  pickupRescheduleValidationRules(),
  validate,
  checkPickupRescheduleAccess, // verifies: owner, Missed, under cap
  reschedulePickup
);

// ── Volunteer: cancel a Pending pickup ───────────────────────────────────────
router.patch(
  '/:id/cancel',
  authorize('volunteer'),
  checkPickupOwnershipByVolunteer,
  cancelPickup
);

// ── Core volunteer CRUD ───────────────────────────────────────────────────────
router
  .route('/')
  .post(
    authorize('volunteer'),
    pickupValidationRules(),
    validate,
    createPickup
  );

router
  .route('/:id')
  .get(
    authorize('volunteer', 'ngo', 'admin'),
    checkPickupViewAccess,
    getPickupById
  )
  .put(
    // Volunteer owner, Pending only (status gate is in controller + service)
    authorize('volunteer'),
    checkPickupOwnershipByVolunteer,
    pickupValidationRules(),
    validate,
    updatePickup
  )
  .delete(
    // Volunteer owner, Pending only (status gate is in controller + service)
    authorize('volunteer'),
    checkPickupDeleteAccess,
    deletePickup
  );

module.exports = router;