// Backend/utils/csvExporter.js
//
// Streaming CSV export utility.
//
// ARCHITECTURE:
//   MongoDB Cursor → Transform Stream → HTTP Response
//
// CRITICAL DESIGN RULE:
//   NEVER do: const data = await Model.find().lean()  — then convert array.
//   This will OOM on large datasets (50k+ records).
//   Instead: pipe a Mongoose cursor through a Transform stream directly to res.
//
// USAGE (in report.service.js):
//   await streamCSV({
//     cursor: User.find(filter).lean().cursor(),
//     res,
//     filename: 'users_report_2026-08-12.csv',
//     columns: [
//       { header: 'ID',        key: '_id' },
//       { header: 'Name',      key: 'name' },
//       { header: 'Email',     key: 'email' },
//     ],
//     transform: (doc) => ({ ...doc, _id: doc._id.toString() }),
//   });

const { Transform } = require('stream');
const { formatCellValue } = require('./cellFormatter');

/**
 * VUL-004 mitigation: neutralize CSV/Excel formula injection.
 * If a field's first character is one that spreadsheet apps (Excel, Sheets,
 * LibreOffice) treat as the start of a formula, prefix it with a single
 * quote. Excel renders the value as plain text instead of evaluating it,
 * so `=cmd|'/c calc'!A0` in a user-supplied field (notes, bio, title, ...)
 * can no longer execute when an admin opens the exported report.
 *
 * @param {string} str
 * @returns {string}
 */
const sanitizeFormula = (str) =>
  /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;

/**
 * Escape a single CSV field value.
 * Neutralizes leading formula-trigger characters (VUL-004), then wraps in
 * quotes if it contains commas, quotes, or newlines. Doubles any internal
 * quotes.
 *
 * @param {*} value
 * @returns {string}
 */
const escapeCsvField = (value) => {
  if (value === null || value === undefined) return '';
  const str = sanitizeFormula(String(value));
  // Must quote if contains comma, double-quote, or newline
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
};

/**
 * Convert a document to a CSV row string.
 *
 * @param {object} doc        - The raw document from MongoDB cursor
 * @param {{ key: string, format?: string }[]} columns - Ordered column definitions
 * @param {Function} [transform] - Optional transform applied before field extraction
 * @returns {string}          - CSV row ending with \n
 */
const docToRow = (doc, columns, transform) => {
  const processed = transform ? transform(doc) : doc;
  const fields = columns.map(({ key, format }) => {
    // Support dot-notation: 'address.city'
    const val = key.split('.').reduce((obj, k) => obj?.[k], processed);
    // Apply the column's format (date/bool-status/bool-yn/array/kg/number)
    // before escaping — previously this did String(val) directly, so
    // booleans rendered as "true"/"false" and dates as full JS Date strings
    // instead of the labels/format the report column defines.
    const formatted = val === null || val === undefined ? '' : formatCellValue(val, format);
    return escapeCsvField(formatted);
  });
  return fields.join(',') + '\n';
};

/**
 * Stream a MongoDB cursor to a CSV HTTP response.
 *
 * @param {object}   opts
 * @param {import('mongoose').QueryCursor} opts.cursor   - Mongoose lean cursor
 * @param {import('express').Response}     opts.res      - Express response object
 * @param {string}                         opts.filename - Download filename (e.g. 'report.csv')
 * @param {{ header: string, key: string }[]} opts.columns - Column definitions
 * @param {Function}                       [opts.transform] - Optional doc transformer
 * @param {[string, string|number][]}      [opts.summaryRows] - Extra [label, value] rows
 *   written as a "REPORT SUMMARY" block after the data, e.g. [['Total Users', 250], ...].
 *   Same formula-injection sanitization applied as data cells.
 * @returns {Promise<void>}
 */
const streamCSV = ({ cursor, res, filename, columns, transform, summaryRows }) => {
  return new Promise((resolve, reject) => {
    // Set streaming headers BEFORE data flows
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    const headers = columns.map((c) => c.header);

    // Write CSV header row immediately so client starts receiving data fast
    res.write(headers.map(escapeCsvField).join(',') + '\n');

    let rowCount = 0;

    const csvTransform = new Transform({
      objectMode: true, // input: JS objects; output: strings
      transform(doc, _encoding, callback) {
        try {
          const row = docToRow(doc, columns, transform);
          rowCount++;
          callback(null, row);
        } catch (err) {
          callback(err);
        }
      },
    });

    csvTransform.on('error', (err) => {
      console.error('[csvExporter] Transform error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'CSV export failed.' });
      }
      reject(err);
    });

    cursor.on('error', (err) => {
      console.error('[csvExporter] Cursor error:', err.message);
      csvTransform.destroy(err);
      reject(err);
    });

    res.on('finish', () => resolve());
    res.on('error', reject);

    // After the data stream finishes, append the headline summary block
    // (totals + status breakdown) as extra rows at the BOTTOM of the file —
    // matches whatever filters were applied to the data above it.
    csvTransform.on('end', () => {
      if (summaryRows && summaryRows.length) {
        res.write('\n');
        res.write('REPORT SUMMARY\n');
        summaryRows.forEach(([label, value]) => {
          res.write(`${escapeCsvField(label)},${escapeCsvField(value)}\n`);
        });
      }
      res.end();
    });

    // Pipe: cursor → transform → response (manual .end() above, so don't
    // let .pipe() close res itself)
    cursor.pipe(csvTransform).pipe(res, { end: false });
  });
};

module.exports = { streamCSV, escapeCsvField, sanitizeFormula };