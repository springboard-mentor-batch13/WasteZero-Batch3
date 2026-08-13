// Backend/tests/models.test.js
//
// Tests for P0-01 (User suspension fields), P0-05 (Opportunity soft-delete fields),
// P0-06 (AdminLog model), P0-07 (WasteStats model), and P1-06 (Pickup wasteTypes enum).
//
// These are pure unit tests — no DB connection. They test schema defaults,
// enum validation, and field presence using Mongoose's validate() method.

const mongoose = require('mongoose');
const User = require('../models/users.model');
const Opportunity = require('../models/opportunity.model');
const AdminLog = require('../models/admin-log.model');
const WasteStats = require('../models/wasteStats.model');
const Pickup = require('../models/pickup.model');
const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');

// ── P0-01: User suspension fields ────────────────────────────────────────────

describe('User model — suspension fields (P0-01)', () => {

  test('isSuspended defaults to false', () => {
    const user = new User({
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password1!',
      role: 'volunteer',
    });
    expect(user.isSuspended).toBe(false);
  });

  test('suspensionReason defaults to null', () => {
    const user = new User({
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password1!',
      role: 'volunteer',
    });
    expect(user.suspensionReason).toBeNull();
  });

  test('suspendedAt defaults to null', () => {
    const user = new User({
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password1!',
      role: 'volunteer',
    });
    expect(user.suspendedAt).toBeNull();
  });

  test('suspendedBy defaults to null', () => {
    const user = new User({
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password1!',
      role: 'volunteer',
    });
    expect(user.suspendedBy).toBeNull();
  });

  test('accepts isSuspended=true', () => {
    const user = new User({
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password1!',
      role: 'volunteer',
      isSuspended: true,
      suspensionReason: 'Violation of terms',
      suspendedAt: new Date(),
    });
    expect(user.isSuspended).toBe(true);
    expect(user.suspensionReason).toBe('Violation of terms');
  });

});

// ── P0-05: Opportunity soft-delete fields ────────────────────────────────────

describe('Opportunity model — soft-delete fields (P0-05)', () => {

  test('isRemovedByAdmin defaults to false', () => {
    const opp = new Opportunity({
      ngo_id: new mongoose.Types.ObjectId(),
      title: 'Test',
      description: 'Test description',
      required_skills: ['sorting'],
      duration: '2 hours',
      location: 'Karachi',
    });
    expect(opp.isRemovedByAdmin).toBe(false);
  });

  test('removalReason defaults to null', () => {
    const opp = new Opportunity({
      ngo_id: new mongoose.Types.ObjectId(),
      title: 'Test',
      description: 'Test description',
      required_skills: ['sorting'],
      duration: '2 hours',
      location: 'Karachi',
    });
    expect(opp.removalReason).toBeNull();
  });

  test('removedAt defaults to null', () => {
    const opp = new Opportunity({
      ngo_id: new mongoose.Types.ObjectId(),
      title: 'Test',
      description: 'Test description',
      required_skills: ['sorting'],
      duration: '2 hours',
      location: 'Karachi',
    });
    expect(opp.removedAt).toBeNull();
  });

  test('removedBy defaults to null', () => {
    const opp = new Opportunity({
      ngo_id: new mongoose.Types.ObjectId(),
      title: 'Test',
      description: 'Test description',
      required_skills: ['sorting'],
      duration: '2 hours',
      location: 'Karachi',
    });
    expect(opp.removedBy).toBeNull();
  });

});

// ── P0-06: AdminLog model ────────────────────────────────────────────────────

describe('AdminLog model (P0-06)', () => {

  test('requires admin_id', async () => {
    const log = new AdminLog({
      action: 'USER_SUSPENDED',
      target_type: 'User',
      target_id: new mongoose.Types.ObjectId(),
      details: 'User suspended for spam',
    });
    let err;
    try {
      await log.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors['admin_id']).toBeDefined();
  });

  test('rejects invalid action', async () => {
    const log = new AdminLog({
      admin_id: new mongoose.Types.ObjectId(),
      action: 'INVALID_ACTION',
      target_type: 'User',
      target_id: new mongoose.Types.ObjectId(),
      details: 'Test',
    });
    let err;
    try {
      await log.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors['action']).toBeDefined();
  });

  test('accepts valid action USER_SUSPENDED', async () => {
    const log = new AdminLog({
      admin_id: new mongoose.Types.ObjectId(),
      action: 'USER_SUSPENDED',
      target_type: 'User',
      target_id: new mongoose.Types.ObjectId(),
      details: 'Suspended for abuse',
    });
    let err;
    try {
      await log.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeUndefined();
  });

  test('rejects invalid target_type', async () => {
    const log = new AdminLog({
      admin_id: new mongoose.Types.ObjectId(),
      action: 'USER_SUSPENDED',
      target_type: 'Transaction',
      target_id: new mongoose.Types.ObjectId(),
      details: 'Test',
    });
    let err;
    try {
      await log.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors['target_type']).toBeDefined();
  });

  test('exports ADMIN_LOG_ACTIONS and ADMIN_LOG_TARGET_TYPES', () => {
    const { ADMIN_LOG_ACTIONS, ADMIN_LOG_TARGET_TYPES } = require('../models/admin-log.model');
    expect(Array.isArray(ADMIN_LOG_ACTIONS)).toBe(true);
    expect(ADMIN_LOG_ACTIONS).toContain('USER_SUSPENDED');
    expect(ADMIN_LOG_TARGET_TYPES).toContain('User');
  });

});

// ── P0-07: WasteStats model ──────────────────────────────────────────────────

describe('WasteStats model (P0-07)', () => {

  test('rejects invalid waste category', async () => {
    const stat = new WasteStats({
      user_id: new mongoose.Types.ObjectId(),
      pickup_id: new mongoose.Types.ObjectId(),
      category: 'InvalidGarbage',
      weight: 5,
      co2_saved_kg: 1.5,
    });
    let err;
    try {
      await stat.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors['category']).toBeDefined();
  });

  test('accepts all ALLOWED_WASTE_TYPES', async () => {
    for (const cat of ALLOWED_WASTE_TYPES) {
      const stat = new WasteStats({
        user_id: new mongoose.Types.ObjectId(),
        pickup_id: new mongoose.Types.ObjectId(),
        category: cat,
        weight: 2,
        co2_saved_kg: 0.5,
      });
      let err;
      try {
        await stat.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
    }
  });

  test('rejects weight below 0.01', async () => {
    const stat = new WasteStats({
      user_id: new mongoose.Types.ObjectId(),
      pickup_id: new mongoose.Types.ObjectId(),
      category: 'Plastic',
      weight: 0,
      co2_saved_kg: 0.5,
    });
    let err;
    try {
      await stat.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors['weight']).toBeDefined();
  });

});

// ── P1-06: Pickup wasteTypes enum ───────────────────────────────────────────

describe('Pickup model — wasteTypes enum (P1-06)', () => {

  const basePickup = {
    user_id: new mongoose.Types.ObjectId(),
    'address.city': 'Karachi',
    scheduledDate: new Date(Date.now() + 86400000),
    'preferredTimeSlot.start': '09:00',
    'preferredTimeSlot.end': '11:00',
  };

  test('ALLOWED_WASTE_TYPES constant exports the correct 6 categories', () => {
    expect(ALLOWED_WASTE_TYPES).toHaveLength(6);
    expect(ALLOWED_WASTE_TYPES).toContain('Plastic');
    expect(ALLOWED_WASTE_TYPES).toContain('Paper');
    expect(ALLOWED_WASTE_TYPES).toContain('Glass');
    expect(ALLOWED_WASTE_TYPES).toContain('E-Waste');
    expect(ALLOWED_WASTE_TYPES).toContain('Organic');
    expect(ALLOWED_WASTE_TYPES).toContain('Metal');
  });

  test('pickup schema wasteTypes field has enum constraint', () => {
    // Inspect the schema path directly — no DB needed.
    // In Mongoose 9.x (confirmed 9.7.3), array element schema type is accessed
    // via `embeddedSchemaType` (an own instance property on SchemaArray).
    const schemaPath = Pickup.schema.path('wasteTypes');
    expect(schemaPath).toBeDefined();
    expect(schemaPath.constructor.name).toBe('SchemaArray');

    const embeddedType = schemaPath.embeddedSchemaType;
    expect(embeddedType).toBeDefined();
    expect(embeddedType.enumValues).toBeDefined();
    expect(embeddedType.enumValues).toEqual(expect.arrayContaining(ALLOWED_WASTE_TYPES));
  });

});
