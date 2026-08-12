// Backend/models/sweepLock.model.js
//
// ── Distributed lock for background sweep jobs ────────────────────────────
//
// WHY THIS EXISTS:
//   pickup.sweep.js runs on a setInterval in every backend process. With a
//   single instance that's fine; with more than one, every instance runs
//   its own sweep independently. The atomic conditional update in the sweep
//   already prevents two instances from both WRITING the same pickup, but
//   it does NOT stop two instances from both reading the same candidate
//   before either writes — which produces duplicate notifications.
//
//   This collection holds a single lock document per named job. An instance
//   must acquire the lock before running a sweep pass; if it can't, it skips
//   that pass and lets whichever instance holds the lock finish. The lock
//   has a TTL-style expiry (lockedUntil) so a crashed instance can't hold
//   the lock forever — another instance can reclaim it once it's stale.
//
// This is intentionally lightweight (no new dependency). If sweep jobs grow
// in number or complexity, replace with a proper scheduler (agenda/bullmq).

const mongoose = require('mongoose');

const sweepLockSchema = new mongoose.Schema({
  // Name of the job this lock guards, e.g. 'missed-pickup-sweep'.
  _id: {
    type: String,
  },

  lockedAt: {
    type:    Date,
    default: null,
  },

  // Lock is considered free once now() >= lockedUntil, even if never
  // explicitly released (covers a crashed/killed instance).
  lockedUntil: {
    type:    Date,
    default: null,
  },

  // Identifies which process instance currently holds the lock — used to
  // make release() a no-op if a different instance already reclaimed it
  // after this one's TTL expired.
  instanceId: {
    type:    String,
    default: null,
  },
});

const SweepLock = mongoose.model('SweepLock', sweepLockSchema);

module.exports = SweepLock;
