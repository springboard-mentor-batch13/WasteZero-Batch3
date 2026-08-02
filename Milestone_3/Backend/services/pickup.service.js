// Backend/services/pickup.service.js

const Pickup = require('../models/pickup.model');
const User = require('../models/users.model');

/**
 * @internal
 * Escape regex special characters in user-supplied string input before it
 * is passed into `new RegExp()`. Prevents ReDoS and unintended metacharacter
 * behavior (same convention as opportunity.service.js).
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @internal
 * Build a case-insensitive "exact match against any of these cities" regex
 * array. City names aren't normalized (lowercased) at the schema level for
 * either User or Pickup, so an anchored, case-insensitive regex is the
 * safest way to match "City" against "city" without a migration.
 */
const cityRegexList = (cities = []) =>
  cities
    .filter(Boolean)
    .map((city) => new RegExp(`^${escapeRegex(city.trim())}$`, 'i'));

/**
 * @internal
 * Derive the list of cities a user (volunteer or NGO) is associated with,
 * from User.locations.primary.city AND every User.locations.secondary[].city.
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
 * Check whether a given NGO user is eligible to claim a specific pickup —
 * i.e. the pickup's address.city matches the NGO's coverage city
 * (case-insensitive) AND at least one of the pickup's
 * wasteTypes overlaps with the NGO's configured wasteTypes.
 * Shared by getPickupsForNgo (list-level filter) and checkPickupNgoMatch
 * (single-resource claim guard) so the matching rule can't drift between
 * the two call sites.
 */
const isNgoEligibleForPickup = (ngoUser, pickup) => {
  const ngoCities = getUserCities(ngoUser).map((c) => c.trim().toLowerCase());
  const ngoWasteTypes = Array.isArray(ngoUser?.wasteTypes)
    ? ngoUser.wasteTypes.map((w) => w.trim().toLowerCase())
    : [];

  if (ngoCities.length === 0 || ngoWasteTypes.length === 0) return false;

  const pickupCity = pickup?.address?.city?.trim().toLowerCase();
  const pickupWasteTypes = Array.isArray(pickup?.wasteTypes)
    ? pickup.wasteTypes.map((w) => w.trim().toLowerCase())
    : [];

  const cityMatches = Boolean(pickupCity) && ngoCities.includes(pickupCity);
  const wasteTypeMatches = pickupWasteTypes.some((w) => ngoWasteTypes.includes(w));

  return cityMatches && wasteTypeMatches;
};

// ── Create ──────────────────────────────────────────────────────────────

/**
 * Create a new pickup request on behalf of a volunteer.
 * Only whitelisted, volunteer-editable fields are pulled from pickupData —
 * mirrors the whitelist used by updatePickupInstance — so unexpected keys
 * in the request body (e.g. a stray _id) can never reach the document.
 */
const createPickup = async (volunteerId, pickupData) => {
  const { address, scheduledDate, preferredTimeSlot, wasteTypes, notes } = pickupData;

  const newPickup = new Pickup({
    address,
    scheduledDate,
    preferredTimeSlot,
    wasteTypes,
    notes,
    user_id: volunteerId,
    agent_id: null,
    status: 'Pending',
    completedAt: null,
  });
  return await newPickup.save();
};

// ── Read ────────────────────────────────────────────────────────────────

const getPickupById = async (id) => {
  return await Pickup.findById(id);
};

/**
 * Get pickups created by a specific volunteer (their own history), with
 * pagination and optional status filter.
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

  return { pickups, total };
};

/**
 * Get pickups matched to an NGO's coverage (location + wasteTypes),
 * regardless of status — used by the discovery feed with an optional
 * status filter (defaults to 'Pending' at the controller level).
 *
 * Matching rules:
 *   - address.city must equal (case-insensitively) the NGO's city.
 *   - wasteTypes must overlap with at least one of the NGO's wasteTypes.
 */
const getPickupsForNgo = async (ngoUser, { status, skip, limit, sort }) => {
  const cities = getUserCities(ngoUser);
  const wasteTypes = Array.isArray(ngoUser.wasteTypes) ? ngoUser.wasteTypes : [];

  // An NGO with no configured coverage area or waste types has nothing to
  // match against — return an empty result instead of leaking all pickups.
  if (cities.length === 0 || wasteTypes.length === 0) {
    return { pickups: [], total: 0 };
  }

  // Admins are not part of the NGO pickup workflow — a pickup an admin
  // created for themselves must never surface in an NGO's discovery feed,
  // even if it happens to match location/wasteType.
  const adminIds = await User.find({ role: 'admin' }).distinct('_id');

  const filter = {
    'address.city': { $in: cityRegexList(cities) },
    wasteTypes: { $in: wasteTypes.map((w) => new RegExp(`^${escapeRegex(w.trim())}$`, 'i')) },
    user_id: { $nin: adminIds },
  };

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

  return { pickups, total };
};

/**
 * Get pickups currently assigned to a specific NGO (agent_id === ngoId),
 * with pagination and optional status filter.
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

  return { pickups, total };
};

/**
 * Get every pickup in the system, regardless of owner or status — admin-only
 * system-management view (not an NGO-workflow query, so no coverage
 * matching or agent_id filtering here).
 */
const getAllPickups = async ({ status, skip, limit, sort }) => {
  const filter = {};
  if (status) filter.status = status;

  const [pickups, total] = await Promise.all([
    Pickup.find(filter)
      .populate('user_id', 'name email role')
      .populate('agent_id', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Pickup.countDocuments(filter),
  ]);

  return { pickups, total };
};

/**
 * Transition a pickup's status (NGO action) — ATOMICALLY.
 *
 * Why atomic: two NGOs could both pass the pre-check (coverage-area match /
 * "am I the assigned agent") in checkPickupNgoMatch and then both attempt
 * to write. A plain findById -> mutate -> save() has a check-then-act gap
 * between the read and the write, so the second writer would silently
 * overwrite the first (lost update / double-claim race).
 *
 * findOneAndUpdate's filter re-asserts the expected CURRENT state
 * (status, and agent_id when leaving 'Assigned') as part of the same atomic
 * operation that performs the write. Mongo guarantees only one concurrent
 * request can match a given document + filter combo and succeed; the loser
 * gets `null` back and the controller returns a 409 instead of corrupting
 * state.
 *
 *   - Pending -> Assigned:  filter requires status === 'Pending'; sets agent_id.
 *   - Assigned -> *:        filter requires status === 'Assigned' AND
 *                            agent_id === ngoId; sets completedAt when
 *                            moving to Completed.
 *
 *   NGO-only operation — admins never call this (they are blocked at the
 *   route/middleware layer), so there is no admin bypass in the filter.
 */
const transitionPickupStatus = async ({ pickupId, fromStatus, nextStatus, ngoId }) => {
  const filter = { _id: pickupId, status: fromStatus };

  // Once a pickup is Assigned, only the NGO on record may move it further.
  // Baking this into the filter — rather than checking it beforehand — is
  // what makes the whole operation atomic.
  if (fromStatus === 'Assigned') {
    filter.agent_id = ngoId;
  }

  const update = { status: nextStatus };
  if (nextStatus === 'Assigned') update.agent_id = ngoId;
  if (nextStatus === 'Completed') update.completedAt = new Date();

  // Returns null if another request already changed the document's status
  // (or agent_id) since it was read — i.e. someone else won the race.
  return await Pickup.findOneAndUpdate(filter, update, { new: true });
};

/**
 * Cancel a Pending pickup on behalf of the volunteer who owns it — ATOMICALLY.
 *
 * Why atomic: a matching NGO could be claiming this same pickup
 * (Pending -> Assigned) at the same moment the volunteer cancels it. The
 * filter re-asserts status === 'Pending' AND user_id === volunteerId as
 * part of the same operation that performs the write, so only one of the
 * two concurrent requests (the NGO's claim or the volunteer's cancel) can
 * win. The loser gets `null` back and the controller returns a 409.
 */
const cancelPendingPickup = async (pickupId, volunteerId) => {
  return await Pickup.findOneAndUpdate(
    { _id: pickupId, status: 'Pending', user_id: volunteerId },
    { status: 'Cancelled' },
    { new: true }
  );
};

// ── Update ──────────────────────────────────────────────────────────────

/**
 * Update a pickup's editable fields (volunteer-owned, Pending-only —
 * enforced by the controller/middleware before this is called).
 */
const updatePickupInstance = async (pickupInstance, updateData) => {
  // Flat (top-level) fields are safe to overwrite wholesale — the client is
  // always sending the field's full intended value.
  const flatFieldsToUpdate = ['scheduledDate', 'wasteTypes', 'notes'];

  flatFieldsToUpdate.forEach((field) => {
    if (updateData[field] !== undefined) {
      pickupInstance[field] = updateData[field];
    }
  });

  // Nested fields (address, preferredTimeSlot) are merged key-by-key instead
  // of replaced wholesale. Whole-object assignment (e.g.
  // `pickupInstance.address = { city: 'X' }`) would silently drop sibling
  // keys the client didn't send (e.g. `area`) — city is required whenever
  // `address` is sent, but `area` is always optional, so a request that only
  // means to change the city can legally omit `area` entirely. Merging by
  // key preserves whatever wasn't explicitly touched.
  if (updateData.address !== undefined) {
    if (updateData.address.city !== undefined) {
      pickupInstance.address.city = updateData.address.city;
    }
    if (updateData.address.area !== undefined) {
      pickupInstance.address.area = updateData.address.area;
    }
  }

  // preferredTimeSlot.start/.end are both required whenever the key is
  // present (enforced in pickup.validation.js), so this can't currently be
  // partial in practice — merging anyway is defense-in-depth in case that
  // validation ever loosens.
  if (updateData.preferredTimeSlot !== undefined) {
    if (updateData.preferredTimeSlot.start !== undefined) {
      pickupInstance.preferredTimeSlot.start = updateData.preferredTimeSlot.start;
    }
    if (updateData.preferredTimeSlot.end !== undefined) {
      pickupInstance.preferredTimeSlot.end = updateData.preferredTimeSlot.end;
    }
  }

  return await pickupInstance.save();
};

// ── Delete ──────────────────────────────────────────────────────────────

/**
 * Delete a pickup by ID — ATOMICALLY.
 *
 * Why atomic: the controller's Pending-only check runs against req.pickup,
 * which was fetched earlier by the checkPickupOwnershipByVolunteer
 * middleware — a stale snapshot by the time this actually executes. An NGO
 * could claim this same pickup (Pending -> Assigned, atomically, via
 * transitionPickupStatus) in the gap between that read and this delete. A
 * plain findByIdAndDelete would still go through, silently destroying a
 * pickup an NGO has just been assigned to (no 409, no trace, agent_id
 * reference just disappears). The filter re-asserts status === 'Pending'
 * AND user_id === volunteerId as part of the same operation that performs
 * the delete, mirroring the pattern already used by
 * transitionPickupStatus/cancelPendingPickup above — only one of the two
 * concurrent requests (the NGO's claim or the volunteer's delete) can win.
 * The loser gets `null` back and the controller returns a 409.
 */
const deletePickupById = async (id, volunteerId) => {
  return await Pickup.findOneAndDelete({
    _id: id,
    status: 'Pending',
    user_id: volunteerId,
  });
};

module.exports = {
  createPickup,
  getPickupById,
  getPickupsByVolunteer,
  getPickupsForNgo,
  getPickupsAssignedToNgo,
  getAllPickups,
  updatePickupInstance,
  transitionPickupStatus,
  cancelPendingPickup,
  deletePickupById,
  isNgoEligibleForPickup,
};