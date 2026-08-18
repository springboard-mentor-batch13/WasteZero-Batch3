// Backend/utils/pickup.transitions.js
//
// ── Single source of truth for pickup state-machine transitions ──────────────
//
// WHY THIS EXISTS:
//   Previously, transition logic lived in three places that had to stay in
//   sync by discipline:
//     1. NGO_ALLOWED_TRANSITIONS (model)       ← which NGO statuses are legal
//     2. .isIn([...]) in validation layer      ← which inputs to accept
//     3. open-state check in adminUpdatePickup ← which states admin can act on
//
//   Three places that a future edit can update two of and forget the third.
//   This module collapses all three into a single canTransition(role, from, to)
//   function called by every entry point.
//
// ROLES:
//   'ngo'                  — NGO claiming (Pending→Assigned) or acting on their own
//                            assigned pickup (Assigned→Completed / Assigned→Cancelled)
//   'volunteer_cancel'     — Volunteer explicitly cancelling their own Pending pickup
//   'volunteer_reschedule' — Volunteer rescheduling a Missed pickup (capped at 2x)
//   'admin'                — Admin force-closing any open pickup to Completed or Cancelled
//   'system'               — The automatic sweep; the ONLY actor that can set Missed
//
// INVARIANT (most important in the whole module):
//   'Missed' appears ONLY as the destination for role === 'system'.
//   No other role, ever, in any direction, touches 'Missed' as a target.
//   If you need to add a new transition that involves 'Missed', you must do it
//   here and update every test in §13 of the spec.
//
//   'system' may ALSO transition Pending/Assigned directly to 'Cancelled'.
//   This is used only when a pickup's rescheduleCount has already hit
//   RESCHEDULE_CAP and it times out again — at that point there is no actor
//   left who can move it (volunteer can't reschedule past the cap, admin
//   can't act on Missed), so the sweep closes it out as Cancelled instead of
//   leaving it stuck in Missed forever. See pickup.sweep.js.

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------
// Shape: { [role]: { [fromStatus]: [toStatus, ...] } }
// A transition (role, from, to) is legal iff TRANSITION_TABLE[role][from]
// exists and includes `to`.

const TRANSITION_TABLE = {
  ngo: {
    Pending:  ['Assigned'],
    Assigned: ['Completed', 'Cancelled'],
  },

  volunteer_cancel: {
    Pending: ['Cancelled'],
  },

  volunteer_reschedule: {
    Missed: ['Pending'],
  },

  admin: {
    // Admin can only close open pickups — never re-open, never touch terminal
    // states, never touch Missed (Missed is exclusively a system signal).
    Pending:  ['Completed', 'Cancelled'],
    Assigned: ['Completed', 'Cancelled'],
  },

  system: {
    // The sweep is the ONLY actor that can set Missed.
    // This must not appear in any other role's transitions.
    // 'Cancelled' here is the reschedule-cap-exhausted auto-close path —
    // see the invariant note above.
    Pending:  ['Missed', 'Cancelled'],
    Assigned: ['Missed', 'Cancelled'],
  },
};

// ---------------------------------------------------------------------------
// canTransition
// ---------------------------------------------------------------------------
/**
 * Returns true if the given role is permitted to move a pickup from
 * `fromStatus` to `toStatus`, false otherwise.
 *
 * @param {'ngo'|'volunteer_cancel'|'volunteer_reschedule'|'admin'|'system'} role
 * @param {string} fromStatus  - current pickup status
 * @param {string} toStatus    - desired next status
 * @returns {boolean}
 *
 * @example
 *   canTransition('ngo', 'Pending', 'Assigned')   // true
 *   canTransition('ngo', 'Pending', 'Missed')      // false — sweep-only
 *   canTransition('admin', 'Missed', 'Cancelled')  // false — admin cannot act on Missed
 *   canTransition('system', 'Assigned', 'Missed')  // true
 */
const canTransition = (role, fromStatus, toStatus) => {
  const allowed = TRANSITION_TABLE[role]?.[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
};

// ---------------------------------------------------------------------------
// Allowed input enums — used by validation layer to reject bad inputs BEFORE
// they reach business logic. Derived from the table above, not hand-typed,
// so they can never drift from the table.
// ---------------------------------------------------------------------------

/**
 * Status values the NGO status-patch endpoint will accept.
 * Note: 'Missed' is intentionally excluded — NGOs cannot self-report a miss.
 */
const NGO_STATUS_INPUT_ALLOWED = Object.values(TRANSITION_TABLE.ngo)
  .flat()
  .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe → ['Assigned','Completed','Cancelled']

/**
 * Status values the admin status-patch endpoint will accept.
 * Derived from admin transitions → ['Completed', 'Cancelled'].
 */
const ADMIN_STATUS_INPUT_ALLOWED = Object.values(TRANSITION_TABLE.admin)
  .flat()
  .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe → ['Completed','Cancelled']

/**
 * All statuses that are considered "open" (an admin can force-close them).
 * Derived from the admin table keys so it can't drift.
 */
const ADMIN_OPEN_STATUSES = Object.keys(TRANSITION_TABLE.admin); // ['Pending','Assigned']

/**
 * Statuses the system sweep targets as candidates.
 */
const SWEEP_CANDIDATE_STATUSES = Object.keys(TRANSITION_TABLE.system); // ['Pending','Assigned']

module.exports = {
  canTransition,
  TRANSITION_TABLE,
  NGO_STATUS_INPUT_ALLOWED,
  ADMIN_STATUS_INPUT_ALLOWED,
  ADMIN_OPEN_STATUSES,
  SWEEP_CANDIDATE_STATUSES,
};
