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

/**
 * Escape a single CSV field value.
 * Wraps in quotes if it contains commas, quotes, or newlines.
 * Doubles any internal quotes.
 *
 * @param {*} value
 * @returns {string}
 */
const escapeCsvField = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
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
 * @param {string[]} keys     - Ordered list of field keys to extract
 * @param {Function} [transform] - Optional transform applied before field extraction
 * @returns {string}          - CSV row ending with \n
 */
const docToRow = (doc, keys, transform) => {
  const processed = transform ? transform(doc) : doc;
  const fields = keys.map((key) => {
    // Support dot-notation: 'address.city'
    const val = key.split('.').reduce((obj, k) => obj?.[k], processed);
    return escapeCsvField(val);
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
 * @returns {Promise<void>}
 */
const streamCSV = ({ cursor, res, filename, columns, transform }) => {
  return new Promise((resolve, reject) => {
    // Set streaming headers BEFORE data flows
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    const headers = columns.map((c) => c.header);
    const keys    = columns.map((c) => c.key);

    // Write CSV header row immediately so client starts receiving data fast
    res.write(headers.map(escapeCsvField).join(',') + '\n');

    let rowCount = 0;

    const csvTransform = new Transform({
      objectMode: true, // input: JS objects; output: strings
      transform(doc, _encoding, callback) {
        try {
          const row = docToRow(doc, keys, transform);
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

    // Pipe: cursor → transform → response
    cursor.pipe(csvTransform).pipe(res);
  });
};

module.exports = { streamCSV, escapeCsvField };
