// Backend/services/pickup.sweep.js
//
// ── Automatic "Missed" detection background job ───────────────────────────────
//
// HOW IT WORKS:
//   1. Query Mongo for pickups whose status is Pending or Assigned AND whose
//      precomputed `missedCutoffAt` has already passed (≤ now).
//      This is a single indexed query — no per-document JS parsing.
//
//   2. For each candidate, issue an atomic conditional findOneAndUpdate that
//      re-asserts status ∈ {Pending, Assigned} in its filter.
//      If the pickup was completed/cancelled/claimed between the read and the
//      write, the filter won't match and the pickup is skipped — no double-write.
//
//   3. Fire pickup_missed notifications (fire-and-forget, logged on failure).
//      Notification failure NEVER rolls back the status change.
//
// SCHEDULING:
//   Runs once on process startup (catches anything missed during downtime),
//   then every SWEEP_INTERVAL_MS (15 minutes default).
//
// HORIZONTAL SCALING:
//   Each run first tries to acquire a Mongo-backed lock (SweepLock model,
//   TTL-style expiry). If another instance already holds it, this instance
//   skips the pass entirely — only the lock holder reads candidates, so
//   duplicate notifications across instances are no longer possible (not
//   just duplicate writes, which the atomic per-document update already
//   prevented on its own).
//
// RESCHEDULE-CAP EXHAUSTION:
//   A pickup that has already used up its RESCHEDULE_CAP reschedules and
//   then times out again has nowhere left to go — the volunteer can't
//   reschedule past the cap, and admin cannot act on a Missed pickup. So
//   instead of flipping it to Missed (a dead end), the sweep closes it
//   straight to Cancelled. See dispatchAutoCancelledNotifications below.

const Pickup              = require('../models/pickup.model');
const SweepLock            = require('../models/sweepLock.model');
const notificationService = require('./notification.service');
const { SWEEP_CANDIDATE_STATUSES } = require('../utils/pickup.transitions');
const crypto = require('crypto');
const os     = require('os');

const SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// Distributed lock
// ---------------------------------------------------------------------------

const SWEEP_LOCK_ID  = 'missed-pickup-sweep';
const LOCK_TTL_MS    = 5 * 60 * 1000; // generous vs. expected sweep duration
const INSTANCE_ID    = `${os.hostname()}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

/**
 * Try to acquire the sweep lock for this instance.
 * Succeeds if the lock is free, or stale (lockedUntil has already passed —
 * covers a crashed instance that never released it).
 *
 * @returns {Promise<boolean>} true if this instance now holds the lock
 */
const acquireSweepLock = async () => {
  const now       = new Date();
  const lockedUntil = new Date(now.getTime() + LOCK_TTL_MS);

  try {
    const doc = await SweepLock.findOneAndUpdate(
      {
        _id: SWEEP_LOCK_ID,
        $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
      },
      { $set: { lockedAt: now, lockedUntil, instanceId: INSTANCE_ID } },
      { upsert: true, new: true }
    );

    return doc?.instanceId === INSTANCE_ID;
  } catch (err) {
    // Two instances racing the initial upsert can hit a duplicate-key error
    // instead of a clean filter mismatch — that just means we lost the race.
    if (err?.code === 11000) return false;
    console.error('[Sweep] Lock acquisition error:', err.message);
    return false;
  }
};

/**
 * Release the sweep lock — only if this instance still holds it (a stale
 * lock reclaimed by another instance must not be released out from under
 * that instance).
 */
const releaseSweepLock = async () => {
  try {
    await SweepLock.updateOne(
      { _id: SWEEP_LOCK_ID, instanceId: INSTANCE_ID },
      { $set: { lockedUntil: null } }
    );
  } catch (err) {
    // Best-effort — if this fails, the lock simply expires via its TTL.
    console.error('[Sweep] Lock release error:', err.message);
  }
};

// ---------------------------------------------------------------------------
// Notification dispatch helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date for use in notification messages.
 * ISO date portion only (YYYY-MM-DD) — keeps messages timezone-neutral.
 *
 * @param {Date} date
 * @returns {string}
 */
const fmtDate = (date) =>
  date instanceof Date
    ? date.toISOString().split('T')[0]
    : String(date);

/**
 * Fire pickup_missed notifications for a pickup that was just flipped.
 * Fire-and-forget: a notification error is logged but never thrown.
 *
 * Branching per spec §10:
 *   - agent_id present  → notify BOTH the NGO and the volunteer
 *   - agent_id null     → notify volunteer only
 *
 * @param {object} pickup  - plain (lean) Pickup document after the status flip
 */
const dispatchMissedNotifications = async (pickup) => {
  const date = fmtDate(pickup.scheduledDate);
  const city = pickup.address?.city ?? 'unknown location';

  const notifications = [];

  if (pickup.agent_id) {
    // NGO had claimed the pickup and it lapsed anyway
    notifications.push(
      notificationService.dispatch({
        user_id:      pickup.agent_id,
        type:         'pickup_missed',
        message:      `You missed the pickup scheduled for ${date} in ${city}. It has been marked as Missed and reopened for the volunteer to reschedule.`,
        reference_id: pickup._id,
      })
    );

    notifications.push(
      notificationService.dispatch({
        user_id:      pickup.user_id,
        type:         'pickup_missed',
        message:      `The NGO assigned to your pickup on ${date} in ${city} missed it. You can reschedule it for another day, create a new pickup request, or simply ignore this if you no longer need it.`,
        reference_id: pickup._id,
      })
    );
  } else {
    // Nobody had claimed the pickup before the slot passed
    notifications.push(
      notificationService.dispatch({
        user_id:      pickup.user_id,
        type:         'pickup_missed',
        message:      `Your pickup scheduled for ${date} in ${city} wasn't claimed in time and has been marked as Missed. You can reschedule it for another day, create a new pickup request, or simply ignore this if you no longer need it.`,
        reference_id: pickup._id,
      })
    );
  }

  const results = await Promise.allSettled(notifications);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(
        `[Sweep] Notification #${i + 1} failed for pickup ${pickup._id}:`,
        r.reason?.message ?? r.reason
      );
    }
  });
};

/**
 * Fire notifications for a pickup that was auto-cancelled because it timed
 * out again after already exhausting RESCHEDULE_CAP. Distinct wording from
 * dispatchMissedNotifications because there's no reschedule option to
 * mention — this is terminal.
 *
 * @param {object} pickup  - plain (lean) Pickup document after the status flip
 */
const dispatchAutoCancelledNotifications = async (pickup) => {
  const date = fmtDate(pickup.scheduledDate);
  const city = pickup.address?.city ?? 'unknown location';

  const notifications = [];

  if (pickup.agent_id) {
    notifications.push(
      notificationService.dispatch({
        user_id:      pickup.agent_id,
        type:         'pickup_cancelled',
        message:      `The pickup scheduled for ${date} in ${city} was missed and has reached its reschedule limit, so it has been automatically cancelled.`,
        reference_id: pickup._id,
      })
    );
  }

  notifications.push(
    notificationService.dispatch({
      user_id:      pickup.user_id,
      type:         'pickup_cancelled',
      message:      `Your pickup scheduled for ${date} in ${city} was missed and has reached its reschedule limit (${Pickup.RESCHEDULE_CAP}x), so it has been automatically cancelled. You're welcome to create a new pickup request.`,
      reference_id: pickup._id,
    })
  );

  const results = await Promise.allSettled(notifications);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(
        `[Sweep] Auto-cancel notification #${i + 1} failed for pickup ${pickup._id}:`,
        r.reason?.message ?? r.reason
      );
    }
  });
};

// ---------------------------------------------------------------------------
// Core sweep
// ---------------------------------------------------------------------------

/**
 * Run one pass of the missed-pickup sweep.
 *
 * Returns a summary object for logging / testing:
 *   { candidates, flipped, skipped }
 */
const runMissedPickupSweep = async () => {
  const now = new Date();

  // ── Step 1: Narrow candidate query ──────────────────────────────────────
  // Pull only pickups that are open AND whose cutoff has already passed.
  // The (status, missedCutoffAt) compound index makes this a fast index scan.
  const candidates = await Pickup.find({
    status:        { $in: SWEEP_CANDIDATE_STATUSES },
    missedCutoffAt: { $lte: now },
  }).lean();

  if (candidates.length === 0) {
    return { candidates: 0, flipped: 0, autoCancelled: 0, skipped: 0 };
  }

  const missedAt = now; // consistent timestamp for this sweep pass

  let flipped       = 0;
  let autoCancelled = 0;
  let skipped       = 0;

  // ── Step 2 + 3: Atomic update per candidate ──────────────────────────────
  // Process sequentially to keep notification ordering predictable and to
  // avoid hammering Mongo with a burst of concurrent writes.
  // If performance becomes an issue, batch with Promise.allSettled in groups.
  for (const candidate of candidates) {
    try {
      // A pickup that already used up its reschedule allowance has nowhere
      // to go if it flips to Missed again — no one can act on it. Close it
      // out as Cancelled instead. See TRANSITION_TABLE.system in
      // pickup.transitions.js.
      const capReached = candidate.rescheduleCount >= Pickup.RESCHEDULE_CAP;

      const $set = capReached
        ? {
            status:   'Cancelled',
            // Clear agent_id — stale agent_id on a closed pickup is a data-integrity bug.
            agent_id: null,
          }
        : {
            status:   'Missed',
            missedAt,
            // Clear agent_id — stale agent_id on a Missed pickup is a data-integrity bug.
            // The pickup re-enters the open pool on reschedule anyway.
            agent_id: null,
          };

      // Atomic conditional update — re-asserts status is still open.
      // If the pickup was completed/cancelled/claimed between the read above
      // and this write, the filter won't match → result is null → skipped.
      const flippedDoc = await Pickup.findOneAndUpdate(
        {
          _id:    candidate._id,
          status: { $in: SWEEP_CANDIDATE_STATUSES }, // re-assert — race guard
        },
        { $set },
        { new: true }
      ).lean();

      if (!flippedDoc) {
        // Another request won the race (completed / cancelled / claimed)
        skipped++;
        continue;
      }

      // ── Step 4: Fire-and-forget notifications ────────────────────────────
      // Pass the ORIGINAL candidate (not flippedDoc) for agent_id — the update
      // already cleared agent_id in the DB, but we need the old value for the
      // notification branch (was an NGO assigned? if so, notify them too).
      if (capReached) {
        autoCancelled++;
        dispatchAutoCancelledNotifications({ ...flippedDoc, agent_id: candidate.agent_id }).catch((err) => {
          console.error(
            `[Sweep] Unexpected error dispatching auto-cancel notifications for pickup ${candidate._id}:`,
            err.message
          );
        });
      } else {
        flipped++;
        dispatchMissedNotifications({ ...flippedDoc, agent_id: candidate.agent_id }).catch((err) => {
          console.error(
            `[Sweep] Unexpected error dispatching notifications for pickup ${candidate._id}:`,
            err.message
          );
        });
      }
    } catch (err) {
      // Log per-document errors; never let one bad pickup abort the whole sweep.
      console.error(
        `[Sweep] Error processing pickup ${candidate._id}:`,
        err.message
      );
      skipped++;
    }
  }

  return { candidates: candidates.length, flipped, autoCancelled, skipped };
};

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * Start the missed-pickup sweep.
 * Runs immediately (to catch anything missed during downtime), then every
 * SWEEP_INTERVAL_MS.
 *
 * Call this once from server.js after the DB connection is established.
 */
const startMissedPickupSweep = () => {
  const run = async () => {
    const gotLock = await acquireSweepLock();
    if (!gotLock) {
      // Another instance holds the lock and is running this pass — skip.
      return;
    }

    try {
      const { candidates, flipped, autoCancelled, skipped } = await runMissedPickupSweep();
      if (candidates > 0) {
        console.log(
          `[Sweep] Missed-pickup sweep: ${candidates} candidate(s), ${flipped} flipped to Missed, ` +
          `${autoCancelled} auto-cancelled (reschedule cap exhausted), ${skipped} skipped (race / error).`
        );
      }
    } catch (err) {
      // Log but never crash the server — the sweep is a housekeeping job.
      console.error('[Sweep] Missed-pickup sweep failed:', err.message);
    } finally {
      await releaseSweepLock();
    }
  };

  // Immediate run on startup
  run();

  // Recurring run every 15 minutes
  setInterval(run, SWEEP_INTERVAL_MS);

  console.log(
    `[Sweep] Missed-pickup sweep started (every ${SWEEP_INTERVAL_MS / 60000} minutes).`
  );
};

module.exports = {
  startMissedPickupSweep,
  runMissedPickupSweep, // exported for testing
  acquireSweepLock,     // exported for testing
  releaseSweepLock,     // exported for testing
};
