// Backend/utils/durationParser.js
//
// Opportunity.duration is a free-text String field (e.g. "4 hours", "2-3 hours",
// "1 day", "Half day", "2 weeks" — see models/opportunity.model.js). There is no
// structured numeric duration anywhere in the schema.
//
// This is a best-effort heuristic parser used ONLY to estimate volunteer hours
// for the volunteer dashboard headline card ("Volunteer hours — time from the
// opportunity's duration"). It intentionally never throws — unparseable input
// safely resolves to 0 hours rather than breaking the aggregation.
//
// USAGE:
//   const { parseDurationToHours } = require('./durationParser');
//   parseDurationToHours('4 hours')     // → 4
//   parseDurationToHours('2-3 hours')   // → 2.5   (range midpoint)
//   parseDurationToHours('1 day')       // → 8      (1 working day = 8 hrs)
//   parseDurationToHours('Half day')    // → 4
//   parseDurationToHours('2 weeks')     // → 80     (2 * 5 days * 8 hrs)
//   parseDurationToHours('TBD')         // → 0       (unparseable, safe fallback)

const HOURS_PER_DAY  = 8;
const DAYS_PER_WEEK  = 5;
const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK;   // 40
const HOURS_PER_MONTH = HOURS_PER_WEEK * 4;               // 160

const UNIT_TO_HOURS = {
  hour: 1, hours: 1, hr: 1, hrs: 1, h: 1,
  day: HOURS_PER_DAY, days: HOURS_PER_DAY,
  week: HOURS_PER_WEEK, weeks: HOURS_PER_WEEK,
  month: HOURS_PER_MONTH, months: HOURS_PER_MONTH,
};

// Sanity cap — guards against a garbage/typo'd duration blowing up the
// volunteer-hours sum (e.g. "999999 hours").
const MAX_REASONABLE_HOURS = 500;

/**
 * Strip anything but lowercase letters from a matched unit token.
 * @param {string} unitRaw
 * @returns {string}
 */
const normalizeUnit = (unitRaw) => unitRaw.replace(/[^a-z]/g, '');

/**
 * Parse a free-text duration string into an estimated number of hours.
 *
 * @param {string} input  e.g. "4 hours", "2-3 hours", "1 day", "Half day"
 * @returns {number} estimated hours, 0 if unparseable
 */
const parseDurationToHours = (input) => {
  if (!input || typeof input !== 'string') return 0;
  const str = input.trim().toLowerCase();
  if (!str) return 0;

  if (str.includes('half day') || str.includes('half-day')) return HOURS_PER_DAY / 2;
  if (str.includes('full day') || str.includes('full-day')) return HOURS_PER_DAY;

  // Range: "2-3 hours" / "2 to 3 hours" → midpoint of the range
  const rangeMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*([a-z]+)/);
  if (rangeMatch) {
    const [, lo, hi, unitRaw] = rangeMatch;
    const multiplier = UNIT_TO_HOURS[normalizeUnit(unitRaw)];
    if (multiplier) {
      const hours = ((parseFloat(lo) + parseFloat(hi)) / 2) * multiplier;
      return Math.min(hours, MAX_REASONABLE_HOURS);
    }
  }

  // Single value + unit: "4 hours", "1 day", "2 weeks"
  const singleMatch = str.match(/(\d+(?:\.\d+)?)\s*([a-z]+)/);
  if (singleMatch) {
    const [, value, unitRaw] = singleMatch;
    const multiplier = UNIT_TO_HOURS[normalizeUnit(unitRaw)];
    if (multiplier) {
      return Math.min(parseFloat(value) * multiplier, MAX_REASONABLE_HOURS);
    }
  }

  // Bare number, no recognizable unit → assume hours
  const bareNumber = str.match(/^(\d+(?:\.\d+)?)$/);
  if (bareNumber) return Math.min(parseFloat(bareNumber[1]), MAX_REASONABLE_HOURS);

  // Fully unparseable (e.g. "TBD", "Flexible") — safe fallback
  return 0;
};

module.exports = { parseDurationToHours };
