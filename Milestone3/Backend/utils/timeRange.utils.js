// Backend/utils/timeRange.utils.js
//
// Converts a named time-range selector into a { startDate, endDate } pair
// (YYYY-MM-DD strings) that the report services consume via buildDateFilter().
//
// SUPPORTED RANGE VALUES:
//   'all'    → no filter (returns { startDate: null, endDate: null })
//   'week'   → Monday–Sunday of the current week
//   'month'  → current month, or a specific month via opts.year + opts.month (1-12)
//   'year'   → current year, or a specific year via opts.year
//   'custom' → caller supplies opts.startDate / opts.endDate directly
//
// USAGE:
//   const { resolveTimeRange, timeRangeLabel } = require('../utils/timeRange.utils');
//
//   const { startDate, endDate } = resolveTimeRange(req.query.timeRange, {
//     year:      req.query.year,
//     month:     req.query.month,
//     startDate: req.query.startDate,
//     endDate:   req.query.endDate,
//   });

/**
 * Format a Date object as a YYYY-MM-DD string (local-time, not UTC).
 *
 * @param {Date} d
 * @returns {string}
 */
const toDateStr = (d) => {
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Resolve a named time range into { startDate, endDate } strings.
 *
 * @param {string} timeRange  'all' | 'week' | 'month' | 'year' | 'custom'
 * @param {object} [opts]
 * @param {string} [opts.startDate]   Used when timeRange='custom'
 * @param {string} [opts.endDate]     Used when timeRange='custom'
 * @param {string|number} [opts.year] Specific year (used with 'year' and 'month')
 * @param {string|number} [opts.month] Specific month 1–12 (used with 'month')
 * @returns {{ startDate: string|null, endDate: string|null }}
 */
const resolveTimeRange = (timeRange, { startDate, endDate, year, month } = {}) => {
  const effectiveRange = timeRange || (startDate || endDate ? 'custom' : 'all');
  const now = new Date();

  switch (effectiveRange) {
    case 'week': {
      // ISO week: Monday → Sunday
      const dayOfWeek   = now.getDay(); // 0=Sun, 1=Mon, ...
      const diffToMon   = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart   = new Date(now);
      weekStart.setDate(now.getDate() + diffToMon);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return { startDate: toDateStr(weekStart), endDate: toDateStr(weekEnd) };
    }

    case 'month': {
      const y  = year  ? parseInt(year, 10)      : now.getFullYear();
      const m  = month ? parseInt(month, 10) - 1 : now.getMonth();  // 0-indexed
      const monthStart = new Date(y, m, 1);
      const monthEnd   = new Date(y, m + 1, 0);  // last day of month
      return { startDate: toDateStr(monthStart), endDate: toDateStr(monthEnd) };
    }

    case 'year': {
      const y = year ? parseInt(year, 10) : now.getFullYear();
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
    }

    case 'custom':
      // Pass-through: frontend supplies startDate / endDate
      return { startDate: startDate || null, endDate: endDate || null };

    case 'all':
    default:
      return { startDate: null, endDate: null };
  }
};

/**
 * Build a human-readable date-range label for PDF / XLSX report headers.
 *
 * @param {string} timeRange
 * @param {object} [opts]  same as resolveTimeRange
 * @returns {string}  e.g. "January 2026", "Week 14 Jun–20 Jun", "2026", "All time"
 */
const timeRangeLabel = (timeRange, opts = {}) => {
  const effectiveRange = timeRange || (opts.startDate || opts.endDate ? 'custom' : 'all');
  const { startDate: s, endDate: e } = resolveTimeRange(effectiveRange, opts);
  if (!s && !e) return 'All time';
  if (s && e)   return `${s} → ${e}`;
  if (s)        return `From ${s}`;
  return `Until ${e}`;
};

/**
 * List of all valid timeRange values, for use in validation.
 */
const VALID_TIME_RANGES = ['all', 'week', 'month', 'year', 'custom'];

module.exports = { resolveTimeRange, timeRangeLabel, VALID_TIME_RANGES };
