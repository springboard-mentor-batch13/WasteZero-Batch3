// Backend/services/pickup.service.js

const Pickup = require('../models/pickup.model');
const User = require('../models/users.model');


const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


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


const getPickupsForNgo = async (ngoUser, { status, skip, limit, sort }) => {
  const cities = getUserCities(ngoUser);
  const wasteTypes = Array.isArray(ngoUser.wasteTypes) ? ngoUser.wasteTypes : [];

 
  if (cities.length === 0 || wasteTypes.length === 0) {
    return { pickups: [], total: 0 };
  }

  
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

const transitionPickupStatus = async ({ pickupId, fromStatus, nextStatus, ngoId }) => {
  const filter = { _id: pickupId, status: fromStatus };

  
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


const cancelPendingPickup = async (pickupId, volunteerId) => {
  return await Pickup.findOneAndUpdate(
    { _id: pickupId, status: 'Pending', user_id: volunteerId },
    { status: 'Cancelled' },
    { new: true }
  );
};


const updatePickupInstance = async (pickupInstance, updateData) => {
  // Flat (top-level) fields are safe to overwrite wholesale — the client is
  // always sending the field's full intended value.
  const flatFieldsToUpdate = ['scheduledDate', 'wasteTypes', 'notes'];

  flatFieldsToUpdate.forEach((field) => {
    if (updateData[field] !== undefined) {
      pickupInstance[field] = updateData[field];
    }
  });

  
  if (updateData.address !== undefined) {
    if (updateData.address.city !== undefined) {
      pickupInstance.address.city = updateData.address.city;
    }
    if (updateData.address.area !== undefined) {
      pickupInstance.address.area = updateData.address.area;
    }
  }

 
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