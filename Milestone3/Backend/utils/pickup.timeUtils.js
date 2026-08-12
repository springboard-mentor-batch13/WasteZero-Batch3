// Backend/utils/pickup.timeUtils.js
//
// ── Time utilities for the Pickup module ─────────────────────────────────────
//
// Two concerns live here, kept together because both deal with
// preferredTimeSlot HH:mm strings:
//
//   1. computeMissedCutoff  — converts (scheduledDate, preferredTimeSlot) into
//      a single absolute Date that the sweep compares against now().
//      Stored as `missedCutoffAt` on every Pickup document.
//
//   2. addTimeDisplayFields — enriches a lean pickup object with
//      startDisplay / endDisplay 12-hour strings for API responses.
//      Applied once at the response boundary, not scattered through N endpoints.

// ---------------------------------------------------------------------------
// 1. computeMissedCutoff
// ---------------------------------------------------------------------------

/**
 * Parse a "HH:mm" 24-hour string into { hours, minutes }.
 * Returns null on missing or malformed input.
 *
 * @param {string|undefined} timeStr
 * @returns {{ hours: number, minutes: number } | null}
 */
const parseHHmm = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;

  const match = timeStr.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;

  return {
    hours:   parseInt(match[1], 10),
    minutes: parseInt(match[2], 10),
  };
};

// ---------------------------------------------------------------------------
// Timezone configuration
// ---------------------------------------------------------------------------
// preferredTimeSlot.start/end are wall-clock times entered by the user in
// the app's operating timezone — NOT UTC. APP_TZ_OFFSET_MINUTES is the fixed
// offset (in minutes) of that local timezone from UTC (e.g. IST = +330,
// EST = -300). Default is 0 (UTC), which preserves prior behavior for any
// deployment that hasn't set it.
//
// This is a fixed-offset fix, not a full IANA-timezone fix — it does not
// account for daylight saving transitions. If the app ever needs to support
// users across multiple timezones, or a region with DST, the right long-term
// fix is to store an explicit timezone per user/pickup and use a proper
// timezone library (e.g. luxon) instead of a single global offset.
const APP_TZ_OFFSET_MINUTES = (() => {
  const raw = parseInt(process.env.APP_TZ_OFFSET_MINUTES, 10);
  return Number.isFinite(raw) ? raw : 0;
})();

/**
 * Compute the absolute Date at which a pickup becomes "missed" — i.e. its
 * scheduled slot end has passed without reaching Completed.
 *
 * Algorithm:
 *   1. Take the date portion of `scheduledDate` (year/month/day in UTC —
 *      this part is just a calendar date, so UTC components are safe here).
 *   2. Combine it with the hours + minutes from `preferredTimeSlot.end`,
 *      treating that combination as local wall-clock time in the app's
 *      configured timezone (APP_TZ_OFFSET_MINUTES), then convert to the
 *      correct UTC instant.
 *   3. If the end time is missing or malformed, fall back to 23:59:59.999
 *      local time on that date (avoids false-positive misses for bad data).
 *
 * @param {Date|string} scheduledDate
 * @param {{ start: string, end: string } | undefined} preferredTimeSlot
 * @returns {Date}
 */
const computeMissedCutoff = (scheduledDate, preferredTimeSlot) => {
  // Normalise to a Date object
  const d = scheduledDate instanceof Date ? scheduledDate : new Date(scheduledDate);

  // Snapshot the UTC date components from scheduledDate — this is just the
  // calendar date (year/month/day), not a time, so no offset math needed yet.
  const year  = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day   = d.getUTCDate();

  const parsed = parseHHmm(preferredTimeSlot?.end);

  // Wall-clock local time, expressed as if it were UTC — this is the
  // intermediate value we then correct by the configured offset.
  const localAsUtcMs = parsed
    ? Date.UTC(year, month, day, parsed.hours, parsed.minutes, 0, 0)
    : Date.UTC(year, month, day, 23, 59, 59, 999); // missing/malformed end time → end-of-day local

  // Shift from "local wall clock" to the real UTC instant.
  // If local = UTC + offset, then UTC = local - offset.
  return new Date(localAsUtcMs - APP_TZ_OFFSET_MINUTES * 60 * 1000);
};

// ---------------------------------------------------------------------------
// 2. 12-hour display transform
// ---------------------------------------------------------------------------

/**
 * Convert a "HH:mm" 24-hour string to a 12-hour "h:mm AM/PM" display string.
 * Returns the original string unchanged if parsing fails (safe fallback).
 *
 * @param {string} timeStr  e.g. "14:30"
 * @returns {string}        e.g. "2:30 PM"
 */
const to12Hour = (timeStr) => {
  const parsed = parseHHmm(timeStr);
  if (!parsed) return timeStr; // safe fallback: return as-is

  const { hours, minutes } = parsed;
  const period  = hours >= 12 ? 'PM' : 'AM';
  const h12     = hours % 12 || 12; // 0 → 12, 13 → 1, etc.
  const mm      = String(minutes).padStart(2, '0');

  return `${h12}:${mm} ${period}`;
};

/**
 * Enrich a preferredTimeSlot object (or plain-object copy of one) with
 * `startDisplay` and `endDisplay` 12-hour strings.
 *
 * Does NOT mutate the input — returns a new object.
 * Safe to call with null / undefined (returns empty object).
 *
 * @param {{ start?: string, end?: string } | null | undefined} slot
 * @returns {{ start?: string, end?: string, startDisplay?: string, endDisplay?: string }}
 */
const enrichTimeSlot = (slot) => {
  if (!slot) return {};

  return {
    ...slot,
    startDisplay: slot.start != null ? to12Hour(slot.start) : undefined,
    endDisplay:   slot.end   != null ? to12Hour(slot.end)   : undefined,
  };
};

/**
 * Add 12-hour display fields to a lean pickup object (or Mongoose .toObject()
 * result). Returns a new plain object — never mutates the argument.
 *
 * Call this at the single response boundary in every endpoint that returns a
 * pickup (list or single) so there is exactly one place to maintain.
 *
 * @param {object|null} pickup  - lean pickup document
 * @returns {object|null}
 */
const addTimeDisplayFields = (pickup) => {
  if (!pickup) return pickup;

  // Handle both Mongoose documents (need .toObject()) and plain objects
  const plain = typeof pickup.toObject === 'function' ? pickup.toObject() : { ...pickup };

  return {
    ...plain,
    preferredTimeSlot: enrichTimeSlot(plain.preferredTimeSlot),
  };
};

module.exports = {
  parseHHmm,
  computeMissedCutoff,
  to12Hour,
  enrichTimeSlot,
  addTimeDisplayFields,
  APP_TZ_OFFSET_MINUTES,
};
