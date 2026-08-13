// Backend/utils/cellFormatter.js
//
// Shared cell-value formatting for report exporters (CSV, XLSX, PDF).
//
// WHY THIS EXISTS:
//   REPORT_COLUMNS (report.service.js) defines a `format` per column:
//   'date' | 'datetime' | 'bool-status' | 'bool-yn' | 'array' | 'kg' | 'number'.
//   pdfExporter.js originally applied this correctly, but csvExporter.js and
//   excelExporter.js each did their own ad-hoc String(value)/Date handling
//   and silently ignored `format` — so the same report looked right in PDF
//   but showed raw values (true/false, joined arrays, full JS Date strings)
//   in CSV/XLSX. Centralizing the logic here means all three exporters stay
//   in sync by construction.
//
// BUGS FIXED:
//   CF-1 (dead code / no thousands separator) — the 'number' case previously
//         had `typeof value === 'number' ? String(value) : String(value)`;
//         both branches were identical so numbers never got comma-formatted.
//         Now uses toLocaleString('en-US') for proper thousands separators.
//   CF-2 (kg missing unit suffix) — the 'kg' case returned bare "1234.56"
//         while pdfExporter's private formatter added " kg", causing PDF vs
//         CSV/XLSX divergence on the same report. Now appends ' kg'.

/**
 * Format a cell value based on a REPORT_COLUMNS `format` type.
 *
 * Returns an empty string for null/undefined values (callers that need a
 * display placeholder such as '—' should apply it at the call site).
 *
 * @param {*} value
 * @param {string} [format]
 * @returns {string}
 */
const formatCellValue = (value, format) => {
  if (value === null || value === undefined) return '';
  switch (format) {
    case 'bool-status':
      return value ? 'Suspended' : 'Active';
    case 'bool-yn':
      return value ? 'Yes' : 'No';
    case 'date':
      return value instanceof Date
        ? value.toISOString().split('T')[0]
        : String(value).split('T')[0];
    case 'datetime':
      return value instanceof Date
        ? value.toISOString().replace('T', ' ').slice(0, 19)
        : String(value).replace('T', ' ').replace('Z', '').slice(0, 19);
    case 'number':
      // CF-1 fix: was `String(value)` in both branches — no thousands separator.
      // Now produces comma-formatted output (e.g. 1234567 → "1,234,567").
      return typeof value === 'number'
        ? value.toLocaleString('en-US')
        : String(value);
    case 'kg':
      // CF-2 fix: was missing ' kg' suffix, causing PDF vs CSV/XLSX divergence.
      return typeof value === 'number'
        ? `${value.toFixed(2)} kg`
        : String(value);
    case 'array':
      return Array.isArray(value) ? value.join(', ') : String(value);
    default:
      return value instanceof Date ? value.toISOString().split('T')[0] : String(value);
  }
};

module.exports = { formatCellValue };
