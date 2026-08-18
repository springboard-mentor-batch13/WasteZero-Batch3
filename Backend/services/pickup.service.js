// Backend/services/pickup.service.js
//
// ── Pickup business-logic layer ───────────────────────────────────────────────
//
// ARCHITECTURE CONTRACT:
//   Route → Middleware → Validation → Controller → THIS FILE → Model
//   No business logic lives in routes, middleware, or controllers.
//
// CONCURRENCY INVARIANT:
//   Every status-changing write is an atomic conditional update.
//   The update filter always re-asserts the expected current state
//   (status, and ownership/agent_id where relevant) so that two concurrent
//   requests cannot both "succeed" and leave the document contradictory.
//   When findOneAndUpdate returns null, the caller emits HTTP 409 — not 500.

const Pickup     = require('../models/pickup.model');
const User       = require('../models/users.model');
const WasteStats = require('../models/wasteStats.model');
const { computeMissedCutoff, addTimeDisplayFields } = require('../utils/pickup.timeUtils');
const { canTransition, ADMIN_OPEN_STATUSES }        = require('../utils/pickup.transitions');
const { calculateCO2Saved }                         = require('../utils/co2Calculator');
const { emitDashboardUpdate }                       = require('../sockets/events/dashboard.events');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cityRegexList = (cities = []) =>
  cities
    .filter(Boolean)
    .map((city) => new RegExp(`^${escapeRegex(city.trim())}$`, 'i'));

/**
 * Collect every city a user is associated with (primary + all secondary
 * locations). Used for NGO coverage matching.
 *
 * @param {object} user
 * @returns {string[]}
 */
const getUserCities = (user) => {
  const cities = [];
  if (user?.locations?.primary?.city) cities.push(user.locations.primary.city);
  if (Array.isArray(user?.locations?.secondary)) {
    user.locations.secondary.forEach((loc) => {
      if (loc?.city) cities.push(loc.city);
    });
  }
  return cities;
};

/**
 * True if the given NGO user is eligible for the given pickup:
 *   • at least one city matches (case-insensitive)
 *   • at least one wasteType overlaps
 *   • NGO has non-empty cities AND non-empty wasteTypes (empty = "no match",
 *     not "match everything")
 *
 * @param {object} ngoUser
 * @param {object} pickup  - plain Pickup document (lean or Mongoose doc)
 * @returns {boolean}
 */
const isNgoEligibleForPickup = (ngoUser, pickup) => {
  const ngoCities     = getUserCities(ngoUser).map((c) => c.trim().toLowerCase());
  const ngoWasteTypes = Array.isArray(ngoUser?.wasteTypes)
    ? ngoUser.wasteTypes.map((w) => w.trim().toLowerCase())
    : [];

  // Empty profile → never eligible (data-completeness bug in NGO profile, not a match)
  if (ngoCities.length === 0 || ngoWasteTypes.length === 0) return false;

  const pickupCity       = pickup?.address?.city?.trim().toLowerCase();
  const pickupWasteTypes = Array.isArray(pickup?.wasteTypes)
    ? pickup.wasteTypes.map((w) => w.trim().toLowerCase())
    : [];

  const cityMatches      = Boolean(pickupCity) && ngoCities.includes(pickupCity);
  const wasteTypeMatches = pickupWasteTypes.some((w) => ngoWasteTypes.includes(w));

  return cityMatches && wasteTypeMatches;
};

/**
 * Apply the 12-hour display transform to a single lean pickup or an array.
 * This is the single boundary where pickups leave the service layer for a
 * response — every read function runs through here.
 *
 * @param {object|object[]|null} pickupOrList
 * @returns {object|object[]|null}
 */
const formatPickupResponse = (pickupOrList) => {
  if (Array.isArray(pickupOrList)) return pickupOrList.map(addTimeDisplayFields);
  return addTimeDisplayFields(pickupOrList);
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new pickup for a volunteer.
 * Status is forced to 'Pending' server-side — never accepted from input.
 * Computes and stores missedCutoffAt for sweep efficiency.
 *
 * @param {string} volunteerId
 * @param {object} pickupData
 * @returns {Promise<object>}  formatted pickup doc
 */
const createPickup = async (volunteerId, pickupData) => {
  const { address, scheduledDate, preferredTimeSlot, wasteTypes, notes } = pickupData;

  const missedCutoffAt = computeMissedCutoff(scheduledDate, preferredTimeSlot);

  const newPickup = new Pickup({
    address,
    scheduledDate,
    preferredTimeSlot,
    missedCutoffAt,
    wasteTypes,
    notes,
    user_id:         volunteerId,
    agent_id:        null,
    status:          'Pending',
    completedAt:     null,
    missedAt:        null,
    rescheduleCount: 0,
  });

  const saved = await newPickup.save();
  emitDashboardUpdate('pickup:created');
  return formatPickupResponse(saved.toObject());
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Fetch a single pickup by ID.
 * Returns null if not found.
 * Does NOT populate — caller's middleware should populate if needed.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
const getPickupById = async (id) => {
  const pickup = await Pickup.findById(id).lean();
  return formatPickupResponse(pickup);
};

/**
 * Get pickups created by a specific volunteer (owner history), paginated,
 * with optional status filter.
 *
 * @param {string} volunteerId
 * @param {{ status?, skip, limit, sort }} opts
 * @returns {Promise<{ pickups, total }>}
 */
const getPickupsByVolunteer = async (volunteerId, { status, skip, limit, sort }) => {
  const filter = { user_id: volunteerId };
  if (status) filter.status = status;

  const [pickups, total] = await Promise.all([
    Pickup.find(filter)
      .populate('agent_id', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Pickup.countDocuments(filter),
  ]);

  return { pickups: formatPickupResponse(pickups), total };
};

/**
 * Get Pending pickups visible to a specific NGO — matched by city + wasteType
 * overlap, excluding pickups whose owner is an admin.
 *
 * Returns { pickups: [], total: 0 } if the NGO has no cities or no
 * wasteTypes — do NOT silently show everything.
 *
 * @param {object} ngoUser  - full user document (needs wasteTypes + locations)
 * @param {{ skip, limit, sort }} opts
 * @returns {Promise<{ pickups, total }>}
 */
const getPickupsForNgo = async (ngoUser, { skip, limit, sort }) => {
  const cities     = getUserCities(ngoUser);
  const wasteTypes = Array.isArray(ngoUser.wasteTypes) ? ngoUser.wasteTypes : [];

  if (cities.length === 0 || wasteTypes.length === 0) {
    return { pickups: [], total: 0 };
  }

  // Exclude pickups created by admins (admin-created pickups are not in the
  // matching pool per spec §5)
  const adminIds = await User.find({ role: 'admin' }).distinct('_id');

  const filter = {
    status:          'Pending',
    'address.city':  { $in: cityRegexList(cities) },
    wasteTypes:      { $in: wasteTypes.map((w) => new RegExp(`^${escapeRegex(w.trim())}$`, 'i')) },
    user_id:         { $nin: adminIds },
  };

  const [pickups, total] = await Promise.all([
    Pickup.find(filter)
      .populate('user_id', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Pickup.countDocuments(filter),
  ]);

  return { pickups: formatPickupResponse(pickups), total };
};

/**
 * Get all pickups currently/previously assigned to a specific NGO
 * (agent_id === ngoId), paginated, optional status filter.
 *
 * @param {string} ngoId
 * @param {{ status?, skip, limit, sort }} opts
 * @returns {Promise<{ pickups, total }>}
 */
const getPickupsAssignedToNgo = async (ngoId, { status, skip, limit, sort }) => {
  const filter = { agent_id: ngoId };
  if (status) filter.status = status;

  const [pickups, total] = await Promise.all([
    Pickup.find(filter)
      .populate('user_id', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Pickup.countDocuments(filter),
  ]);

  return { pickups: formatPickupResponse(pickups), total };
};

/**
 * Get every pickup in the system — admin-only oversight view.
 *
 * @param {{ status?, skip, limit, sort }} opts
 * @returns {Promise<{ pickups, total }>}
 */
const getAllPickups = async ({ status, skip, limit, sort }) => {
  const filter = {};
  if (status) filter.status = status;

  const [pickups, total] = await Promise.all([
    Pickup.find(filter)
      .populate('user_id',  'name email role')
      .populate('agent_id', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Pickup.countDocuments(filter),
  ]);

  return { pickups: formatPickupResponse(pickups), total };
};

// ---------------------------------------------------------------------------
// Volunteer writes
// ---------------------------------------------------------------------------

/**
 * Update a Pending pickup's editable fields (address, date, slot, types,
 * notes). Also recomputes missedCutoffAt if scheduledDate or
 * preferredTimeSlot changes.
 *
 * ATOMIC: a single conditional findOneAndUpdate that re-asserts
 * status === 'Pending' and ownership at write time — not a fetch-then-.save().
 * If the pickup was claimed by an NGO (or otherwise moved out of Pending)
 * between the caller's earlier fetch and this write, the filter won't match
 * and this returns null; the caller must treat that as a 409, same as every
 * other write in this file. `pickup` (the caller's earlier-fetched doc) is
 * used only as an id/owner reference and as a merge source for recomputing
 * missedCutoffAt when a partial update only supplies one of
 * scheduledDate/preferredTimeSlot — it is never written back, so its own
 * staleness is harmless.
 *
 * @param {object} pickup      - the volunteer's pickup as fetched by earlier middleware (id/user/merge source only)
 * @param {object} updateData
 * @returns {Promise<object|null>}  formatted updated doc, or null on a status/ownership race
 */
const updatePickupInstance = async (pickup, updateData) => {
  const $set = {};
  const flatFields = ['scheduledDate', 'wasteTypes', 'notes'];

  flatFields.forEach((field) => {
    if (updateData[field] !== undefined) $set[field] = updateData[field];
  });

  if (updateData.address !== undefined) {
    if (updateData.address.city !== undefined) $set['address.city'] = updateData.address.city;
    if (updateData.address.area !== undefined) $set['address.area'] = updateData.address.area;
  }

  if (updateData.preferredTimeSlot !== undefined) {
    if (updateData.preferredTimeSlot.start !== undefined) {
      $set['preferredTimeSlot.start'] = updateData.preferredTimeSlot.start;
    }
    if (updateData.preferredTimeSlot.end !== undefined) {
      $set['preferredTimeSlot.end'] = updateData.preferredTimeSlot.end;
    }
  }

  // Recompute the sweep anchor whenever date or slot changes. A partial
  // update may only touch one of the two, so merge against the caller's
  // already-fetched pickup for whichever half wasn't provided.
  if (updateData.scheduledDate !== undefined || updateData.preferredTimeSlot !== undefined) {
    const mergedDate = updateData.scheduledDate !== undefined
      ? updateData.scheduledDate
      : pickup.scheduledDate;
    const mergedSlot = {
      start: updateData.preferredTimeSlot?.start !== undefined
        ? updateData.preferredTimeSlot.start
        : pickup.preferredTimeSlot?.start,
      end: updateData.preferredTimeSlot?.end !== undefined
        ? updateData.preferredTimeSlot.end
        : pickup.preferredTimeSlot?.end,
    };
    $set.missedCutoffAt = computeMissedCutoff(mergedDate, mergedSlot);
  }

  const updated = await Pickup.findOneAndUpdate(
    { _id: pickup._id, status: 'Pending', user_id: pickup.user_id },
    { $set },
    { new: true, runValidators: true }
  ).lean();

  return formatPickupResponse(updated);
};

/**
 * Atomically cancel a volunteer's own Pending pickup.
 * Returns null if the pickup was already moved out of Pending (race → 409).
 *
 * @param {string} pickupId
 * @param {string} volunteerId
 * @returns {Promise<object|null>}
 */
const cancelPendingPickup = async (pickupId, volunteerId) => {
  const updated = await Pickup.findOneAndUpdate(
    { _id: pickupId, status: 'Pending', user_id: volunteerId },
    { $set: { status: 'Cancelled' } },
    { new: true }
  ).lean();

  return formatPickupResponse(updated);
};

/**
 * Atomically reschedule a Missed pickup — Volunteer (owner) only.
 *
 * Enforces the reschedule cap INSIDE the update filter (`rescheduleCount: { $lt: cap }`)
 * so concurrent reschedule attempts cannot both slip through a pre-check that
 * passes for both but only one of them should win.
 *
 * On success:
 *   status          → Pending
 *   scheduledDate   → new value (required — old values are stale by definition)
 *   preferredTimeSlot → new value (required)
 *   missedCutoffAt  → recomputed from new date + slot
 *   agent_id        → null (pickup re-enters the open pool; old NGO not auto-reassigned)
 *   missedAt        → null
 *   completedAt     → null
 *   rescheduleCount → incremented by 1
 *
 * Returns null if:
 *   - pickup not found in Missed state owned by this volunteer, OR
 *   - rescheduleCount is already at cap (race condition or legitimate cap hit)
 *
 * @param {string} pickupId
 * @param {string} volunteerId
 * @param {{ scheduledDate, preferredTimeSlot }} newData
 * @returns {Promise<object|null>}
 */
const reschedulePickup = async (pickupId, volunteerId, newData) => {
  const { scheduledDate, preferredTimeSlot } = newData;
  const missedCutoffAt = computeMissedCutoff(scheduledDate, preferredTimeSlot);

  const updated = await Pickup.findOneAndUpdate(
    {
      _id:             pickupId,
      status:          'Missed',
      user_id:         volunteerId,
      rescheduleCount: { $lt: Pickup.RESCHEDULE_CAP },
    },
    {
      $set: {
        status:            'Pending',
        scheduledDate,
        preferredTimeSlot,
        missedCutoffAt,
        agent_id:          null,
        missedAt:          null,
        completedAt:       null,
      },
      $inc: { rescheduleCount: 1 },
    },
    { new: true }
  ).lean();

  return formatPickupResponse(updated);
};

// ---------------------------------------------------------------------------
// NGO writes
// ---------------------------------------------------------------------------

/**
 * Atomically transition a pickup's status — used by the NGO status endpoint
 * and the reschedule-triggered re-claim path.
 *
 * The update filter re-asserts:
 *   - current status === fromStatus
 *   - if fromStatus is 'Assigned': agent_id === ngoId (only the holding NGO acts)
 *
 * Handles side effects:
 *   - Pending → Assigned:  sets agent_id
 *   - Assigned → Completed: sets completedAt
 *   - Assigned → Cancelled:  clears agent_id (stale agent_id on non-Assigned = data bug)
 *
 * Returns null if the atomic filter didn't match (race → 409).
 *
 * @param {{ pickupId, fromStatus, nextStatus, ngoId }} opts
 * @returns {Promise<object|null>}
 */
const transitionPickupStatus = async ({ pickupId, fromStatus, nextStatus, ngoId }) => {
  // Verify transition is legal for the NGO role before touching the DB
  if (!canTransition('ngo', fromStatus, nextStatus)) {
    const err = new Error(`NGO cannot transition pickup from ${fromStatus} to ${nextStatus}`);
    err.statusCode = 400;
    throw err;
  }

  const filter = { _id: pickupId, status: fromStatus };
  // When acting on an Assigned pickup, the filter also asserts agent ownership
  if (fromStatus === 'Assigned') {
    filter.agent_id = ngoId;
  }

  const $set = { status: nextStatus };

  if (nextStatus === 'Assigned')   $set.agent_id    = ngoId;
  if (nextStatus === 'Completed')  $set.completedAt  = new Date();
  // Cancelling an Assigned pickup — clear agent_id so it's not stale
  if (nextStatus === 'Cancelled' && fromStatus === 'Assigned') $set.agent_id = null;

  const updated = await Pickup.findOneAndUpdate(filter, { $set }, { new: true }).lean();
  emitDashboardUpdate(`pickup:${nextStatus.toLowerCase()}`);
  return formatPickupResponse(updated);
};

// ---------------------------------------------------------------------------
// WasteStats recording (M4)
// ---------------------------------------------------------------------------

/**
 * Record WasteStats entries for a pickup that has just been marked Completed.
 *
 * This is the "button to enter the details of waste collected" step: the NGO
 * (or an admin force-closing a pickup) reports what was actually found on
 * site — which may differ from the volunteer's original `wasteTypes` guess
 * at request time (extra categories they didn't mention, or listed ones that
 * didn't materialize). `wasteCollected` is that on-site report; this
 * function converts it into per-category WasteStats rows with CO₂ pre-computed,
 * which is what every analytics/dashboard pipeline in analytics.service.js reads.
 *
 * Called fire-and-forget from the controller — never let a WasteStats write
 * fail the pickup-completion response, but do let the caller `.catch()` it
 * for logging.
 *
 * IDEMPOTENT: a pickup can only reach Completed once (the transition table
 * makes Completed terminal), so if stats already exist for this pickup_id —
 * e.g. this got invoked twice due to a retried request — it's a no-op rather
 * than double-counting.
 *
 * @param {object} pickup           - the just-completed pickup (needs _id, user_id, agent_id, completedAt)
 * @param {Array<{category: string, weight: number}>} wasteCollected
 *   category must be one of ALLOWED_WASTE_TYPES; weight is in kilograms.
 * @returns {Promise<object[]>}  the inserted WasteStats docs (empty array if skipped)
 */
const recordWasteStatsForPickup = async (pickup, wasteCollected) => {
  if (!pickup || !Array.isArray(wasteCollected) || wasteCollected.length === 0) {
    return [];
  }

  const pickupId = pickup._id;

  // Guard against double-recording (a retry of the fire-and-forget call).
  const alreadyRecorded = await WasteStats.exists({ pickup_id: pickupId });
  if (alreadyRecorded) return [];

  // WasteStats.user_id is the volunteer whose pickup this was; ngo_id is the
  // NGO who entered these details (Pickup.agent_id at completion time — may
  // be null if an admin force-completed a pickup that was never claimed).
  const volunteerId = pickup.user_id?._id || pickup.user_id;
  const ngoId        = pickup.agent_id?._id || pickup.agent_id || null;
  const recordedAt  = pickup.completedAt || new Date();

  const docs = wasteCollected
    .map((item) => {
      if (!item || !item.category) return null;
      const numWeight = Number(item.weight);
      if (isNaN(numWeight) || numWeight <= 0) return null;
      return {
        user_id:      volunteerId,
        ngo_id:       ngoId,
        pickup_id:    pickupId,
        category:     item.category,
        weight:       numWeight,
        co2_saved_kg: calculateCO2Saved(item.category, numWeight),
        date:         recordedAt,
      };
    })
    .filter(Boolean);

  if (docs.length === 0) return [];

  try {
    const inserted = await WasteStats.insertMany(docs, { ordered: true });
    emitDashboardUpdate('waste:recorded');
    return inserted;
  } catch (err) {
    // E11000 = duplicate key on the {pickup_id, category} unique index —
    // this means a concurrent/retried call already inserted these rows
    // between our exists() check above and this insertMany (the check-then-
    // act race the unique index exists to close). That's the idempotency
    // guard doing its job, not a real failure, so swallow it here rather
    // than letting it surface as an unhandled rejection from this
    // fire-and-forget call. Any other error still propagates.
    if (err && err.code === 11000) {
      return [];
    }
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Admin writes
// ---------------------------------------------------------------------------

/**
 * Admin: edit a pickup's detail fields (address, date, slot, types, notes).
 * Admin can do this on ANY pickup, ANY status — no status restriction.
 * Also recomputes missedCutoffAt if scheduling fields change.
 *
 * ATOMIC: uses $set with dot-notation paths via findByIdAndUpdate rather
 * than fetch-then-.save(), so a concurrent edit to a sibling field (e.g.
 * another admin editing notes while this call edits address) can't be lost
 * by one write clobbering the other's in-memory copy of the document.
 *
 * @param {string} pickupId
 * @param {object} updateData
 * @returns {Promise<object|null>}  null if pickup not found
 */
const adminEditPickupFields = async (pickupId, updateData) => {
  const $set = {};
  const flatFields = ['scheduledDate', 'wasteTypes', 'notes'];
  flatFields.forEach((field) => {
    if (updateData[field] !== undefined) $set[field] = updateData[field];
  });

  if (updateData.address !== undefined) {
    if (updateData.address.city !== undefined) $set['address.city'] = updateData.address.city;
    if (updateData.address.area !== undefined) $set['address.area'] = updateData.address.area;
  }

  if (updateData.preferredTimeSlot !== undefined) {
    if (updateData.preferredTimeSlot.start !== undefined) {
      $set['preferredTimeSlot.start'] = updateData.preferredTimeSlot.start;
    }
    if (updateData.preferredTimeSlot.end !== undefined) {
      $set['preferredTimeSlot.end'] = updateData.preferredTimeSlot.end;
    }
  }

  if (updateData.scheduledDate !== undefined || updateData.preferredTimeSlot !== undefined) {
    // Need the current values to merge against for whichever half of
    // date/slot wasn't included in this partial update.
    const current = await Pickup.findById(pickupId)
      .select('scheduledDate preferredTimeSlot')
      .lean();
    if (!current) return null;

    const mergedDate = updateData.scheduledDate !== undefined
      ? updateData.scheduledDate
      : current.scheduledDate;
    const mergedSlot = {
      start: updateData.preferredTimeSlot?.start !== undefined
        ? updateData.preferredTimeSlot.start
        : current.preferredTimeSlot?.start,
      end: updateData.preferredTimeSlot?.end !== undefined
        ? updateData.preferredTimeSlot.end
        : current.preferredTimeSlot?.end,
    };
    $set.missedCutoffAt = computeMissedCutoff(mergedDate, mergedSlot);
  }

  const updated = await Pickup.findByIdAndUpdate(
    pickupId,
    { $set },
    { new: true, runValidators: true }
  ).lean();

  return formatPickupResponse(updated);
};

/**
 * Admin: force-close a pickup to Completed or Cancelled.
 *
 * TWO independent enforcement layers (per spec §6):
 *   Layer 1 — input validation (validation middleware): ensures `status` ∈ {Completed, Cancelled}
 *   Layer 2 — service guard (HERE): ensures current status ∈ {Pending, Assigned}
 *
 * Both layers must pass. Relying on only one means a direct service-layer
 * call (from another internal module, a script, a future endpoint) bypasses
 * input validation.
 *
 * OPTIONAL AGENT ASSIGNMENT:
 *   An admin force-completing a pickup may optionally pass `agentId` to
 *   attribute the pickup to a specific NGO — e.g. resolving a dispute where
 *   an NGO actually did the pickup but it was never formally claimed through
 *   the normal Pending→Assigned flow. Only meaningful for `nextStatus ===
 *   'Completed'`: a Cancelled pickup always has agent_id cleared (see below),
 *   and Missed is never reachable from this path. `agentId` must reference
 *   an existing user with role 'ngo' — throws a typed 400 error otherwise,
 *   so a malformed or wrong-role ID can never silently attribute a pickup.
 *   Downstream, `agent_id` is what recordWasteStatsForPickup() uses to set
 *   WasteStats.ngo_id, so getting this right matters for analytics/reports.
 *
 * Returns null if the pickup doesn't exist or is not in an open state.
 * Throws a typed error (statusCode: 400) if `agentId` is provided but
 * invalid/not an NGO, or (statusCode: 409) if the pickup exists but is in a
 * non-open state, so the controller can distinguish "not found" from
 * "wrong state" from "bad input".
 *
 * @param {string} pickupId
 * @param {'Completed'|'Cancelled'} nextStatus
 * @param {string|null} [agentId] - optional NGO user ID to assign on force-complete
 * @returns {Promise<object|null>}
 */
const adminForceStatus = async (pickupId, nextStatus, agentId = null) => {
  // Layer 2: transition table guard
  // We check against the admin role in canTransition, which only allows
  // open states → {Completed, Cancelled}.
  // If the pickup is already Completed, Cancelled, or Missed this will return
  // null from findOneAndUpdate because $in won't match the current status.

  const $set = { status: nextStatus };
  if (nextStatus === 'Completed') $set.completedAt = new Date();
  // If forcing Cancelled on an Assigned pickup, clear agent_id
  if (nextStatus === 'Cancelled') $set.agent_id = null;

  // Optional admin-supplied agent assignment — only applies on Completed.
  if (nextStatus === 'Completed' && agentId) {
    const ngo = await User.findById(agentId).select('role').lean();
    if (!ngo || ngo.role !== 'ngo') {
      const err = new Error('agent_id must reference an existing NGO user.');
      err.statusCode = 400;
      throw err;
    }
    $set.agent_id = agentId;
  }

  const updated = await Pickup.findOneAndUpdate(
    {
      _id:    pickupId,
      status: { $in: ADMIN_OPEN_STATUSES }, // ['Pending', 'Assigned']
    },
    { $set },
    { new: true }
  ).lean();

  if (updated) emitDashboardUpdate(`pickup:${nextStatus.toLowerCase()}`);
  return formatPickupResponse(updated);
};

/**
 * Admin: hard-delete a pickup regardless of status or owner.
 * Returns the deleted document or null if not found.
 *
 * @param {string} pickupId
 * @returns {Promise<object|null>}
 */
const adminDeletePickup = async (pickupId) => {
  const deleted = await Pickup.findByIdAndDelete(pickupId).lean();
  return formatPickupResponse(deleted);
};

// ---------------------------------------------------------------------------
// Delete (volunteer)
// ---------------------------------------------------------------------------

/**
 * Volunteer: delete their own Pending pickup.
 * Atomic: filter re-asserts status + ownership.
 * Returns null if the pickup was already moved out of Pending (race → 409).
 *
 * @param {string} pickupId
 * @param {string} volunteerId
 * @returns {Promise<object|null>}
 */
const deletePickupById = async (pickupId, volunteerId) => {
  const deleted = await Pickup.findOneAndDelete({
    _id:     pickupId,
    status:  'Pending',
    user_id: volunteerId,
  }).lean();
  return formatPickupResponse(deleted);
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // helpers (used by matching.service.js)
  isNgoEligibleForPickup,
  getUserCities,
  formatPickupResponse,

  // read
  getPickupById,
  getPickupsByVolunteer,
  getPickupsForNgo,
  getPickupsAssignedToNgo,
  getAllPickups,

  // volunteer writes
  createPickup,
  updatePickupInstance,
  cancelPendingPickup,
  reschedulePickup,
  deletePickupById,

  // ngo writes
  transitionPickupStatus,
  recordWasteStatsForPickup,

  // admin writes
  adminEditPickupFields,
  adminForceStatus,
  adminDeletePickup,
};