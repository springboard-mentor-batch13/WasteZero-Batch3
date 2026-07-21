// Backend\routes\application.routes.js

const express = require("express");
const router = express.Router();

const {
  protect,
  authorize,
} = require("../middlewares/auth.middleware");

const {
  checkApplicationOwnershipByNGO,
  checkApplicationOwnershipByVolunteer,
  checkApplicationViewAccess,
} = require("../middlewares/role.middleware");

const {
  applyForOpportunity,
  getApplications,
  getApplicationById,
  updateApplicationStatus,
  withdrawApplication,
  getMyApplications,
} = require("../controllers/application.controllers");

const {
  applyValidation,
  updateStatusValidation,
  validate,
} = require("../validations/application.validation");

router.use(protect);

// Volunteer
router.post(
  "/",
  authorize("volunteer"),
  applyValidation,
  validate,
  applyForOpportunity
);

// NGO/Admin
router.get(
  "/",
  authorize("ngo", "admin"),
  getApplications
);

// Volunteer
router.get(
  "/my-applications",
  authorize("volunteer"),
  getMyApplications
);

// Volunteer OR NGO/Admin — ownership resolved per-role inside the middleware
router.get(
  "/:id",
  authorize("volunteer", "ngo", "admin"),
  checkApplicationViewAccess,
  getApplicationById
);

// NGO/Admin — must own the opportunity this application belongs to
router.put(
  "/:id",
  authorize("ngo", "admin"),
  checkApplicationOwnershipByNGO,
  updateStatusValidation,
  validate,
  updateApplicationStatus
);

// Volunteer — must own the application itself
router.delete(
  "/:id",
  authorize("volunteer"),
  checkApplicationOwnershipByVolunteer,
  withdrawApplication
);

module.exports = router;