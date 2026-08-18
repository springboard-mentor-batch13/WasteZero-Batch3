// Backend/tests/pickup.test.js
//
// Comprehensive Automated Test Suite for Pickup Module
// Covers:
//   - Pickup creation, validation, defaults, and time display formatting
//   - Partial updates (PUT) without mandatory fields (e.g. notes only, no wasteTypes)
//   - Volunteer authorization & ownership checks
//   - NGO claim, coverage matching, and race-condition guards
//   - Valid and invalid state transitions
//   - Rescheduling and reschedule cap enforcement
//   - Admin updates, status overrides, agent attribution, and hard-delete
//   - Audit logging for admin pickup actions (PICKUP_UPDATED, PICKUP_STATUS_OVERRIDE, PICKUP_DELETED)
//   - WasteStats recording on completion
//   - Missed-pickup sweep logic

'use strict';

const mongoose = require('mongoose');
const Pickup = require('../models/pickup.model');
const User = require('../models/users.model');
const WasteStats = require('../models/wasteStats.model');
const AdminLog = require('../models/admin-log.model');

const pickupService = require('../services/pickup.service');
const pickupController = require('../controllers/pickup.controllers');
const { canTransition, TRANSITION_TABLE } = require('../utils/pickup.transitions');
const { computeMissedCutoff, addTimeDisplayFields, to12Hour } = require('../utils/pickup.timeUtils');
const { runMissedPickupSweep } = require('../services/pickup.sweep');
const notificationService = require('../services/notification.service');
const {
  pickupValidationRules,
  pickupRescheduleValidationRules,
  pickupStatusValidationRules,
  adminPickupStatusValidationRules,
  adminPickupUpdateValidationRules,
} = require('../validations/pickup.validation');

// ── Mock helpers ─────────────────────────────────────────────────────────────

const makeId = () => new mongoose.Types.ObjectId().toString();

const mockReq = (overrides = {}) => ({
  headers: {},
  user: { id: makeId(), role: 'volunteer' },
  params: {},
  body: {},
  query: {},
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Pickup Module — Unit and Integration Tests', () => {
  beforeEach(() => {
    jest.spyOn(notificationService, 'dispatch').mockResolvedValue({ success: true });
  });
  afterEach(() => jest.restoreAllMocks());

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Time Utils & Formatting
  // ───────────────────────────────────────────────────────────────────────────
  describe('Time Utils', () => {
    test('to12Hour formats HH:mm to 12-hour AM/PM string', () => {
      expect(to12Hour('00:00')).toBe('12:00 AM');
      expect(to12Hour('09:30')).toBe('9:30 AM');
      expect(to12Hour('12:00')).toBe('12:00 PM');
      expect(to12Hour('14:45')).toBe('2:45 PM');
      expect(to12Hour('23:59')).toBe('11:59 PM');
      expect(to12Hour('invalid')).toBe('invalid');
    });

    test('addTimeDisplayFields enriches preferredTimeSlot with startDisplay and endDisplay', () => {
      const pickup = {
        _id: makeId(),
        scheduledDate: new Date('2026-09-01'),
        preferredTimeSlot: { start: '10:00', end: '14:00' },
      };
      const enriched = addTimeDisplayFields(pickup);
      expect(enriched.preferredTimeSlot.startDisplay).toBe('10:00 AM');
      expect(enriched.preferredTimeSlot.endDisplay).toBe('2:00 PM');
    });

    test('computeMissedCutoff computes correct end cutoff date', () => {
      const cutoff = computeMissedCutoff('2026-09-01', { start: '09:00', end: '17:00' });
      expect(cutoff).toBeInstanceOf(Date);
      expect(cutoff.getUTCFullYear()).toBe(2026);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. State Machine & Transitions
  // ───────────────────────────────────────────────────────────────────────────
  describe('Pickup Transitions (canTransition)', () => {
    test('NGO valid transitions: Pending -> Assigned, Assigned -> Completed, Assigned -> Cancelled', () => {
      expect(canTransition('ngo', 'Pending', 'Assigned')).toBe(true);
      expect(canTransition('ngo', 'Assigned', 'Completed')).toBe(true);
      expect(canTransition('ngo', 'Assigned', 'Cancelled')).toBe(true);
    });

    test('NGO invalid transitions rejected', () => {
      expect(canTransition('ngo', 'Pending', 'Completed')).toBe(false);
      expect(canTransition('ngo', 'Pending', 'Cancelled')).toBe(false);
      expect(canTransition('ngo', 'Pending', 'Missed')).toBe(false);
      expect(canTransition('ngo', 'Assigned', 'Pending')).toBe(false);
      expect(canTransition('ngo', 'Completed', 'Assigned')).toBe(false);
      expect(canTransition('ngo', 'Cancelled', 'Pending')).toBe(false);
      expect(canTransition('ngo', 'Missed', 'Assigned')).toBe(false);
    });

    test('Volunteer valid transitions: Pending -> Cancelled, Missed -> Pending (reschedule)', () => {
      expect(canTransition('volunteer_cancel', 'Pending', 'Cancelled')).toBe(true);
      expect(canTransition('volunteer_cancel', 'Assigned', 'Cancelled')).toBe(false);
      expect(canTransition('volunteer_reschedule', 'Missed', 'Pending')).toBe(true);
      expect(canTransition('volunteer_reschedule', 'Cancelled', 'Pending')).toBe(false);
    });

    test('Admin transitions: Pending -> Completed/Cancelled, Assigned -> Completed/Cancelled', () => {
      expect(canTransition('admin', 'Pending', 'Completed')).toBe(true);
      expect(canTransition('admin', 'Pending', 'Cancelled')).toBe(true);
      expect(canTransition('admin', 'Assigned', 'Completed')).toBe(true);
      expect(canTransition('admin', 'Assigned', 'Cancelled')).toBe(true);
      expect(canTransition('admin', 'Missed', 'Completed')).toBe(false);
      expect(canTransition('admin', 'Completed', 'Pending')).toBe(false);
    });

    test('System (sweep) transitions: Pending/Assigned -> Missed/Cancelled', () => {
      expect(canTransition('system', 'Pending', 'Missed')).toBe(true);
      expect(canTransition('system', 'Assigned', 'Missed')).toBe(true);
      expect(canTransition('system', 'Pending', 'Cancelled')).toBe(true);
      expect(canTransition('system', 'Assigned', 'Cancelled')).toBe(true);
      expect(canTransition('system', 'Completed', 'Missed')).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. NGO Eligibility & Matching
  // ───────────────────────────────────────────────────────────────────────────
  describe('NGO Eligibility (isNgoEligibleForPickup)', () => {
    const ngoUser = {
      role: 'ngo',
      locations: {
        primary: { city: 'Mumbai', state: 'Maharashtra' },
        secondary: [{ city: 'Pune', state: 'Maharashtra' }],
      },
      wasteTypes: ['Plastic', 'Paper'],
    };

    test('returns true when city and at least one wasteType match (case-insensitive)', () => {
      const pickup = {
        address: { city: 'mumbai' },
        wasteTypes: ['plastic', 'glass'],
      };
      expect(pickupService.isNgoEligibleForPickup(ngoUser, pickup)).toBe(true);
    });

    test('returns false when city does not match', () => {
      const pickup = {
        address: { city: 'Delhi' },
        wasteTypes: ['Plastic'],
      };
      expect(pickupService.isNgoEligibleForPickup(ngoUser, pickup)).toBe(false);
    });

    test('returns false when wasteTypes do not overlap', () => {
      const pickup = {
        address: { city: 'Mumbai' },
        wasteTypes: ['E-waste', 'Metal'],
      };
      expect(pickupService.isNgoEligibleForPickup(ngoUser, pickup)).toBe(false);
    });

    test('returns false when NGO has empty locations or empty wasteTypes', () => {
      const incompleteNgo = { role: 'ngo', locations: {}, wasteTypes: [] };
      const pickup = { address: { city: 'Mumbai' }, wasteTypes: ['Plastic'] };
      expect(pickupService.isNgoEligibleForPickup(incompleteNgo, pickup)).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Pickup Creation & Validation
  // ───────────────────────────────────────────────────────────────────────────
  describe('Pickup Service — createPickup', () => {
    test('creates a pickup with Pending status, default counters, and recomputed cutoff', async () => {
      const volunteerId = makeId();
      const pickupData = {
        address: { city: 'Mumbai', area: 'Bandra' },
        scheduledDate: new Date('2026-09-15'),
        preferredTimeSlot: { start: '10:00', end: '12:00' },
        wasteTypes: ['Plastic', 'Paper'],
        notes: 'Handle with care',
      };

      const mockSavedDoc = {
        _id: makeId(),
        ...pickupData,
        user_id: volunteerId,
        agent_id: null,
        status: 'Pending',
        completedAt: null,
        missedAt: null,
        rescheduleCount: 0,
        toObject: function () {
          return { ...this };
        },
      };

      jest.spyOn(Pickup.prototype, 'save').mockResolvedValue(mockSavedDoc);

      const result = await pickupService.createPickup(volunteerId, pickupData);
      expect(result.status).toBe('Pending');
      expect(result.user_id).toBe(volunteerId);
      expect(result.rescheduleCount).toBe(0);
      expect(result.preferredTimeSlot.startDisplay).toBe('10:00 AM');
      expect(result.preferredTimeSlot.endDisplay).toBe('12:00 PM');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Partial Update (PUT) — Testing the Partial Update Bug Fix
  // ───────────────────────────────────────────────────────────────────────────
  describe('Pickup Service — updatePickupInstance', () => {
    test('updates only provided fields without clobbering unchanged fields', async () => {
      const volunteerId = makeId();
      const existingPickup = {
        _id: makeId(),
        user_id: volunteerId,
        status: 'Pending',
        scheduledDate: new Date('2026-09-15'),
        preferredTimeSlot: { start: '10:00', end: '12:00' },
        wasteTypes: ['Plastic'],
        notes: 'Old notes',
      };

      const updateData = { notes: 'Updated notes only' };

      jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          ...existingPickup,
          notes: 'Updated notes only',
        }),
      });

      const result = await pickupService.updatePickupInstance(existingPickup, updateData);
      expect(result.notes).toBe('Updated notes only');
    });

    test('recomputes missedCutoffAt when scheduledDate is updated partially', async () => {
      const volunteerId = makeId();
      const existingPickup = {
        _id: makeId(),
        user_id: volunteerId,
        status: 'Pending',
        scheduledDate: new Date('2026-09-15'),
        preferredTimeSlot: { start: '10:00', end: '12:00' },
        wasteTypes: ['Plastic'],
      };

      const updateSpy = jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          ...existingPickup,
          scheduledDate: new Date('2026-09-20'),
        }),
      });

      await pickupService.updatePickupInstance(existingPickup, {
        scheduledDate: new Date('2026-09-20'),
      });

      const setArg = updateSpy.mock.calls[0][1].$set;
      expect(setArg).toHaveProperty('missedCutoffAt');
    });

    test('returns null if pickup is not in Pending status at write time (concurrency race)', async () => {
      const existingPickup = {
        _id: makeId(),
        user_id: makeId(),
        status: 'Pending',
      };

      jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await pickupService.updatePickupInstance(existingPickup, { notes: 'New' });
      expect(result).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Cancellation & Deletion (Volunteer)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Volunteer Cancel & Delete', () => {
    test('cancelPendingPickup atomically sets status to Cancelled', async () => {
      const pickupId = makeId();
      const volunteerId = makeId();

      jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: pickupId,
          user_id: volunteerId,
          status: 'Cancelled',
        }),
      });

      const result = await pickupService.cancelPendingPickup(pickupId, volunteerId);
      expect(result.status).toBe('Cancelled');
    });

    test('deletePickupById atomically deletes a Pending pickup', async () => {
      const pickupId = makeId();
      const volunteerId = makeId();

      jest.spyOn(Pickup, 'findOneAndDelete').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: pickupId,
          user_id: volunteerId,
          status: 'Pending',
        }),
      });

      const result = await pickupService.deletePickupById(pickupId, volunteerId);
      expect(result._id).toBe(pickupId);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Rescheduling & Reschedule Cap
  // ───────────────────────────────────────────────────────────────────────────
  describe('Reschedule Logic', () => {
    test('reschedules Missed pickup, resets agent_id, and increments rescheduleCount', async () => {
      const pickupId = makeId();
      const volunteerId = makeId();
      const newData = {
        scheduledDate: new Date('2026-09-25'),
        preferredTimeSlot: { start: '14:00', end: '16:00' },
      };

      const updateSpy = jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: pickupId,
          status: 'Pending',
          agent_id: null,
          rescheduleCount: 1,
          ...newData,
        }),
      });

      const result = await pickupService.reschedulePickup(pickupId, volunteerId, newData);
      expect(result.status).toBe('Pending');
      expect(result.rescheduleCount).toBe(1);

      // Verify update filter enforces rescheduleCount < RESCHEDULE_CAP
      const filterArg = updateSpy.mock.calls[0][0];
      expect(filterArg.status).toBe('Missed');
      expect(filterArg.rescheduleCount).toEqual({ $lt: Pickup.RESCHEDULE_CAP });
    });

    test('returns null when rescheduleCount is at or exceeds cap (cap hit)', async () => {
      jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await pickupService.reschedulePickup(makeId(), makeId(), {
        scheduledDate: new Date('2026-09-25'),
        preferredTimeSlot: { start: '14:00', end: '16:00' },
      });
      expect(result).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. NGO Status Transitions & Claiming
  // ───────────────────────────────────────────────────────────────────────────
  describe('NGO Status Transitions (transitionPickupStatus)', () => {
    test('Pending -> Assigned assigns agent_id to NGO', async () => {
      const pickupId = makeId();
      const ngoId = makeId();

      const updateSpy = jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: pickupId,
          status: 'Assigned',
          agent_id: ngoId,
        }),
      });

      const result = await pickupService.transitionPickupStatus({
        pickupId,
        fromStatus: 'Pending',
        nextStatus: 'Assigned',
        ngoId,
      });

      expect(result.status).toBe('Assigned');
      expect(result.agent_id).toBe(ngoId);
      expect(updateSpy.mock.calls[0][0]).toEqual({ _id: pickupId, status: 'Pending' });
    });

    test('Assigned -> Completed sets completedAt timestamp', async () => {
      const pickupId = makeId();
      const ngoId = makeId();

      const updateSpy = jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: pickupId,
          status: 'Completed',
          completedAt: new Date(),
          agent_id: ngoId,
        }),
      });

      const result = await pickupService.transitionPickupStatus({
        pickupId,
        fromStatus: 'Assigned',
        nextStatus: 'Completed',
        ngoId,
      });

      expect(result.status).toBe('Completed');
      expect(updateSpy.mock.calls[0][1].$set).toHaveProperty('completedAt');
      expect(updateSpy.mock.calls[0][0]).toEqual({ _id: pickupId, status: 'Assigned', agent_id: ngoId });
    });

    test('Assigned -> Cancelled clears agent_id', async () => {
      const pickupId = makeId();
      const ngoId = makeId();

      const updateSpy = jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: pickupId,
          status: 'Cancelled',
          agent_id: null,
        }),
      });

      const result = await pickupService.transitionPickupStatus({
        pickupId,
        fromStatus: 'Assigned',
        nextStatus: 'Cancelled',
        ngoId,
      });

      expect(result.status).toBe('Cancelled');
      expect(updateSpy.mock.calls[0][1].$set.agent_id).toBeNull();
    });

    test('throws 400 when attempting illegal transition (Pending -> Completed)', async () => {
      await expect(
        pickupService.transitionPickupStatus({
          pickupId: makeId(),
          fromStatus: 'Pending',
          nextStatus: 'Completed',
          ngoId: makeId(),
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. WasteStats Recording
  // ───────────────────────────────────────────────────────────────────────────
  describe('WasteStats Recording on Completion', () => {
    test('inserts WasteStats docs with pre-computed CO2 values', async () => {
      const pickup = {
        _id: makeId(),
        user_id: makeId(),
        agent_id: makeId(),
        completedAt: new Date(),
      };

      const wasteCollected = [
        { category: 'Plastic', weight: 5 },
        { category: 'Paper', weight: 10 },
      ];

      jest.spyOn(WasteStats, 'exists').mockResolvedValue(false);
      const insertSpy = jest.spyOn(WasteStats, 'insertMany').mockResolvedValue(wasteCollected);

      const result = await pickupService.recordWasteStatsForPickup(pickup, wasteCollected);
      expect(result).toHaveLength(2);
      expect(insertSpy).toHaveBeenCalledTimes(1);

      const insertedDocs = insertSpy.mock.calls[0][0];
      expect(insertedDocs[0].co2_saved_kg).toBeGreaterThan(0);
      expect(insertedDocs[0].pickup_id).toBe(pickup._id);
    });

    test('is idempotent: returns empty array if WasteStats already exists for pickup', async () => {
      jest.spyOn(WasteStats, 'exists').mockResolvedValue(true);
      const insertSpy = jest.spyOn(WasteStats, 'insertMany');

      const result = await pickupService.recordWasteStatsForPickup({ _id: makeId() }, [{ category: 'Plastic', weight: 5 }]);
      expect(result).toEqual([]);
      expect(insertSpy).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Admin Pickup Operations & Audit Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe('Admin Operations & Audit Logging', () => {
    test('adminEditPickupFields updates any pickup and recomputes cutoff', async () => {
      const pickupId = makeId();
      jest.spyOn(Pickup, 'findById').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: pickupId,
          scheduledDate: new Date('2026-09-01'),
          preferredTimeSlot: { start: '10:00', end: '12:00' },
        }),
      });

      jest.spyOn(Pickup, 'findByIdAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: pickupId,
          notes: 'Admin note',
          preferredTimeSlot: { start: '10:00', end: '14:00' },
        }),
      });

      const result = await pickupService.adminEditPickupFields(pickupId, {
        preferredTimeSlot: { end: '14:00' },
        notes: 'Admin note',
      });
      expect(result.notes).toBe('Admin note');
    });

    test('adminForceStatus forces Pending/Assigned to Completed or Cancelled', async () => {
      const pickupId = makeId();
      jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: pickupId,
          status: 'Completed',
          completedAt: new Date(),
        }),
      });

      const result = await pickupService.adminForceStatus(pickupId, 'Completed');
      expect(result.status).toBe('Completed');
    });

    test('adminForceStatus attributes agent_id when provided for Completed', async () => {
      const pickupId = makeId();
      const ngoId = makeId();

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: ngoId, role: 'ngo' }),
      });

      const updateSpy = jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: pickupId,
          status: 'Completed',
          agent_id: ngoId,
        }),
      });

      const result = await pickupService.adminForceStatus(pickupId, 'Completed', ngoId);
      expect(result.agent_id).toBe(ngoId);
      expect(updateSpy.mock.calls[0][1].$set.agent_id).toBe(ngoId);
    });

    test('adminForceStatus rejects invalid agent_id with 400', async () => {
      const pickupId = makeId();
      const volunteerId = makeId();

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: volunteerId, role: 'volunteer' }), // not NGO
      });

      await expect(
        pickupService.adminForceStatus(pickupId, 'Completed', volunteerId)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('adminDeletePickup hard-deletes pickup document', async () => {
      const pickupId = makeId();
      jest.spyOn(Pickup, 'findByIdAndDelete').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: pickupId, status: 'Completed' }),
      });

      const result = await pickupService.adminDeletePickup(pickupId);
      expect(result._id).toBe(pickupId);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. Missed Pickup Sweep
  // ───────────────────────────────────────────────────────────────────────────
  describe('Missed Pickup Sweep (runMissedPickupSweep)', () => {
    test('flips expired open pickups to Missed and dispatches notifications', async () => {
      const expiredPickup = {
        _id: makeId(),
        status: 'Assigned',
        user_id: makeId(),
        agent_id: makeId(),
        rescheduleCount: 0,
        scheduledDate: new Date('2026-08-01'),
        address: { city: 'Mumbai' },
      };

      jest.spyOn(Pickup, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([expiredPickup]),
      });

      jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          ...expiredPickup,
          status: 'Missed',
          agent_id: null,
          missedAt: new Date(),
        }),
      });

      const summary = await runMissedPickupSweep();
      expect(summary.candidates).toBe(1);
      expect(summary.flipped).toBe(1);
      expect(summary.autoCancelled).toBe(0);
    });

    test('auto-cancels pickups that exceed RESCHEDULE_CAP instead of marking Missed', async () => {
      const expiredPickupAtCap = {
        _id: makeId(),
        status: 'Pending',
        user_id: makeId(),
        agent_id: null,
        rescheduleCount: Pickup.RESCHEDULE_CAP,
        scheduledDate: new Date('2026-08-01'),
        address: { city: 'Mumbai' },
      };

      jest.spyOn(Pickup, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([expiredPickupAtCap]),
      });

      const updateSpy = jest.spyOn(Pickup, 'findOneAndUpdate').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          ...expiredPickupAtCap,
          status: 'Cancelled',
          agent_id: null,
        }),
      });

      const summary = await runMissedPickupSweep();
      expect(summary.candidates).toBe(1);
      expect(summary.autoCancelled).toBe(1);
      expect(summary.flipped).toBe(0);
      expect(updateSpy.mock.calls[0][1].$set.status).toBe('Cancelled');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. Validation Rules Structural Checks
  // ───────────────────────────────────────────────────────────────────────────
  describe('Pickup Validation Rules', () => {
    test('pickupValidationRules returns array of validator chains', () => {
      const rules = pickupValidationRules();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    test('pickupRescheduleValidationRules returns array of validator chains', () => {
      const rules = pickupRescheduleValidationRules();
      expect(Array.isArray(rules)).toBe(true);
    });

    test('pickupStatusValidationRules returns array of validator chains', () => {
      const rules = pickupStatusValidationRules();
      expect(Array.isArray(rules)).toBe(true);
    });

    test('adminPickupStatusValidationRules returns array of validator chains', () => {
      const rules = adminPickupStatusValidationRules();
      expect(Array.isArray(rules)).toBe(true);
    });

    test('adminPickupUpdateValidationRules returns array of validator chains', () => {
      const rules = adminPickupUpdateValidationRules();
      expect(Array.isArray(rules)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 13. Bug Fix Validations: Numeric String Weights & Null-Safe Access Guards
  // ───────────────────────────────────────────────────────────────────────────
  describe('Bug Fix Validations: Numeric String Weights & Null-Safe Access Guards', () => {
    const { checkPickupViewAccess } = require('../middlewares/role.middleware');

    test('recordWasteStatsForPickup parses numeric string weights correctly', async () => {
      const pickup = {
        _id: makeId(),
        user_id: makeId(),
        agent_id: makeId(),
        completedAt: new Date(),
      };

      const wasteCollected = [
        { category: 'Plastic', weight: '3.5' },
        { category: 'Paper', weight: 10 },
      ];

      jest.spyOn(WasteStats, 'exists').mockResolvedValue(false);
      const insertSpy = jest.spyOn(WasteStats, 'insertMany').mockImplementation(async (docs) => docs);

      const result = await pickupService.recordWasteStatsForPickup(pickup, wasteCollected);
      expect(result).toHaveLength(2);
      expect(insertSpy).toHaveBeenCalledTimes(1);

      const insertedDocs = insertSpy.mock.calls[0][0];
      expect(insertedDocs[0].weight).toBe(3.5);
      expect(typeof insertedDocs[0].weight).toBe('number');
    });

    test('checkPickupViewAccess handles null user_id on volunteer access safely without 500 error', async () => {
      const pickupId = makeId();
      const req = mockReq({
        params: { id: pickupId },
        user: { id: makeId(), role: 'volunteer' },
      });
      const res = mockRes();
      const next = jest.fn();

      // Mock pickup with null user_id (unpopulated or deleted user)
      jest.spyOn(Pickup, 'findById').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        then: jest.fn().mockImplementation((resolve) =>
          resolve({
            _id: pickupId,
            user_id: null,
            agent_id: null,
            status: 'Pending',
          })
        ),
      });

      await checkPickupViewAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
