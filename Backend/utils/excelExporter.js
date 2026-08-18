// Backend/utils/excelExporter.js
//
// Streaming XLSX export using ExcelJS WorkbookWriter.
//
// ARCHITECTURE:
//   MongoDB Cursor → ExcelJS Streaming Workbook → HTTP Response
//
// WHY ExcelJS streaming:
//   ExcelJS.stream.xlsx.WorkbookWriter writes chunks to the output stream
//   as rows are added — it NEVER buffers the entire workbook in memory.
//   This is critical for large datasets (50k+ rows).
//
// USAGE (in report.service.js):
//   await streamXLSX({
//     cursor: User.find(filter).lean().cursor(),
//     res,
//     filename: 'users_report_2026-08-12.xlsx',
//     sheetName: 'Users',
//     columns: [
//       { header: 'ID',    key: '_id',   width: 28 },
//       { header: 'Name',  key: 'name',  width: 25 },
//       { header: 'Email', key: 'email', width: 35 },
//     ],
//     transform: (doc) => ({ ...doc, _id: doc._id.toString() }),
//   });
//
// BUGS FIXED:
//   XL-1  Crash — sheet.columns with header: set collided with the already-
//          committed title row → "Out of bounds: this row has been committed".
//          Fix: set sheet.columns WITHOUT header: and add the header row
//          manually via sheet.addRow(columns.map(c => c.header)).
//   XL-2  Hung export — cursor.pause() called before any 'data' listener
//          pinned the stream paused permanently. Fix: removed the pre-listener
//          cursor.pause(); backpressure is handled by the cursor.pause()
//          already present as the first statement inside the 'data' handler.
//   XL-3  Silent merge-cell breakage past 26 columns — String.fromCharCode
//          (64+n) only works for n≤26; a 27th+ column produced an invalid
//          range. Fix: added columnLetter() that handles AA, AB, … correctly.
//   XL-4  Dead code / no thousands separator — fixed in cellFormatter.js CF-1.
//   XL-5  Summary rows bypassed formula sanitization — the REPORT SUMMARY
//          label/value cells weren't passed through sanitizeFormula(). Fixed.
//   XL-6  Hung/dangling connection on cursor error — on a DB error mid-stream
//          the code just reject()ed without closing res; since headers were
//          already sent the controller can't respond, so the client hangs
//          forever. Fix: handleFatalError() calls res.destroy(err).
//   XL-7  Multiple rejection + no cleanup on 'data' catch — reject was called
//          but cursor kept emitting; res was never destroyed. Fix: once-guarded
//          handleFatalError() + cursor.destroy() stops the flow immediately.

const ExcelJS = require('exceljs');
const { sanitizeFormula } = require('./csvExporter');
const { formatCellValue } = require('./cellFormatter');

// Brand colours for consistent report styling
const BRAND = {
  headerBg:    '1B5E20',   // dark green
  headerFont:  'FFFFFF',   // white
  altRowBg:    'E8F5E9',   // light green (even rows)
  borderColor: 'BDBDBD',
};

/**
 * Convert a 1-based column index to an Excel column letter string.
 * Handles any number of columns: 1→A, 26→Z, 27→AA, 52→AZ, 53→BA, …
 *
 * XL-3 fix: String.fromCharCode(64 + n) only works for n ≤ 26.
 * Columns 27+ silently produced invalid range strings like "[1" or "\\1"
 * that ExcelJS accepted without error but collapsed the merged cell to a
 * single cell, so the title/summary bar appeared un-merged.
 *
 * @param {number} colIndex - 1-based column index
 * @returns {string} e.g. 1→'A', 27→'AA', 703→'AAA'
 */
const columnLetter = (colIndex) => {
  let letter = '';
  let n = colIndex;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
};

/**
 * Apply professional styling to a header row.
 *
 * @param {import('exceljs').Row} row
 * @param {number} colCount
 */
const styleHeaderRow = (row, colCount) => {
  row.height = 22;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF' + BRAND.headerBg },
    };
    cell.font = {
      bold: true,
      color: { argb: 'FF' + BRAND.headerFont },
      size: 11,
      name: 'Calibri',
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top:    { style: 'thin',   color: { argb: 'FF' + BRAND.borderColor } },
      left:   { style: 'thin',   color: { argb: 'FF' + BRAND.borderColor } },
      bottom: { style: 'medium', color: { argb: 'FF' + BRAND.headerBg    } },
      right:  { style: 'thin',   color: { argb: 'FF' + BRAND.borderColor } },
    };
  }
};

/**
 * Apply alternating row style to a data row.
 *
 * @param {import('exceljs').Row} row
 * @param {number} rowIndex   - 1-based data row index (1 = first data row)
 * @param {number} colCount
 */
const styleDataRow = (row, rowIndex, colCount) => {
  const isEven = rowIndex % 2 === 0;
  row.height = 18;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    if (isEven) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF' + BRAND.altRowBg },
      };
    }
    cell.alignment = { vertical: 'middle', wrapText: false };
    cell.font = { size: 10, name: 'Calibri' };
    cell.border = {
      top:    { style: 'hair', color: { argb: 'FFE0E0E0' } },
      bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } },
      left:   { style: 'hair', color: { argb: 'FFE0E0E0' } },
      right:  { style: 'hair', color: { argb: 'FFE0E0E0' } },
    };
  }
};

/**
 * Stream a MongoDB cursor to an XLSX HTTP response using ExcelJS streaming workbook.
 *
 * @param {object} opts
 * @param {import('mongoose').QueryCursor} opts.cursor   - Mongoose lean cursor
 * @param {import('express').Response}     opts.res      - Express response object
 * @param {string}                         opts.filename - Download filename
 * @param {string}                         opts.sheetName
 * @param {{ header: string, key: string, width?: number }[]} opts.columns
 * @param {Function}                       [opts.transform] - Optional doc transformer
 * @param {string}                         [opts.reportTitle] - Title row text
 * @param {[string, string|number][]}      [opts.summaryRows] - Extra [label, value] rows
 *   rendered as a styled "REPORT SUMMARY" section after the data rows, e.g.
 *   [['Total Users', 250], ['NGOs', 40], ...].
 * @returns {Promise<void>}
 */
const streamXLSX = async ({ cursor, res, filename, sheetName, columns, transform, reportTitle, summaryRows }) => {
  // Set XLSX headers BEFORE any data flows
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-cache');

  // ExcelJS streaming workbook — writes to the HTTP response directly
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
    useSharedStrings: false, // false = better memory efficiency for large reports
  });

  // Determine the freeze row: if we have a title row the column headers are
  // on row 2, otherwise row 1.
  const headerRowNum = reportTitle ? 2 : 1;

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: headerRowNum }], // Freeze header row(s)
    properties: { defaultRowHeight: 18 },
  });

  // ── Report title row (optional) ─────────────────────────────────────────
  if (reportTitle) {
    // XL-1 fix: previously sheet.addRow() then sheet.columns = [{ header }]
    // caused "Out of bounds: this row has been committed" because setting
    // sheet.columns with a header: property writes to row 1 again after it
    // was already committed. Title row must be committed first; columns are
    // set without header: below; then the header row is added manually.
    sheet.addRow([reportTitle]);
    const titleRow = sheet.lastRow;
    titleRow.height = 28;
    titleRow.getCell(1).font = {
      bold: true,
      size: 14,
      name: 'Calibri',
      color: { argb: 'FF' + BRAND.headerBg },
    };
    // XL-3 fix: use columnLetter() instead of String.fromCharCode(64+n)
    sheet.mergeCells(`A1:${columnLetter(columns.length)}1`);
    await titleRow.commit();
  }

  // ── Column definitions ──────────────────────────────────────────────────
  // XL-1 fix: do NOT include header: here — ExcelJS would attempt to write
  // the header values into the current row position (already committed if
  // we have a title row), causing "Out of bounds: this row has been
  // committed". We add the header row manually as a plain addRow() call.
  sheet.columns = columns.map((col) => ({
    key:   col.key,
    width: col.width || 20,
  }));

  // Add header row manually so we control exactly when it is committed and
  // which row number it occupies.
  const headerRow = sheet.addRow(columns.map((col) => col.header));
  styleHeaderRow(headerRow, columns.length);
  await headerRow.commit();

  // ── Stream data rows ────────────────────────────────────────────────────
  let rowIndex = 0;

  return new Promise((resolve, reject) => {
    // XL-6/7 fix: once-guarded fatal-error handler.
    // On any error mid-stream we must:
    //   1. Prevent further events from calling reject() again (once flag).
    //   2. Destroy the cursor so Mongo stops emitting rows.
    //   3. Destroy the response so the client gets a connection-level error
    //      instead of hanging forever waiting for more data (headers were
    //      already sent so we cannot send a 500 JSON body).
    let done = false;
    const handleFatalError = (err) => {
      if (done) return;
      done = true;
      try { cursor.destroy(); } catch (_) { /* ignore */ }
      res.destroy(err);
      reject(err);
    };

    // Backpressure: pause the cursor inside the first 'data' event (XL-2
    // fix: the cursor.pause() that previously appeared HERE — before any
    // 'data' listener was attached — was effectively a no-op because Node
    // only puts the cursor in flowing mode when the first 'data' listener is
    // added; calling pause() before that has no meaningful effect for Mongoose
    // cursors and could pin the stream in a paused state before flowing even
    // begins, making it impossible for the subsequent resume() calls to
    // re-start it reliably). The pause() inside the 'data' handler below is
    // all that's needed for correct backpressure.

    cursor.on('data', async (doc) => {
      // Pause immediately so Mongoose doesn't keep emitting while we await
      // the async ExcelJS commit() for this row.
      cursor.pause();
      try {
        if (done) return; // fatal error already fired — discard remaining rows
        const processed = transform ? transform(doc) : doc;
        rowIndex++;

        // Build row values in column key order, applying the column's
        // `format` (date/bool-status/bool-yn/array/kg/number).
        // VUL-004: sanitize formula-trigger characters before writing the
        // cell — Excel/Sheets would otherwise evaluate a leading =, +, -, @
        // as a formula (e.g. a user-supplied `notes` or `title` field).
        const rowValues = columns.map((col) => {
          const val = col.key.split('.').reduce((obj, k) => obj?.[k], processed);
          if (val === null || val === undefined) return '';
          return sanitizeFormula(formatCellValue(val, col.format));
        });

        const dataRow = sheet.addRow(rowValues);
        styleDataRow(dataRow, rowIndex, columns.length);
        await dataRow.commit();
        cursor.resume();
      } catch (err) {
        // XL-7 fix: destroy the connection; don't just reject silently.
        handleFatalError(err);
      }
    });

    // XL-6 fix: was `cursor.on('error', reject)` — never destroyed res,
    // leaving the client hanging forever with an open connection.
    cursor.on('error', handleFatalError);

    cursor.on('end', async () => {
      if (done) return; // fatal error already handled
      try {
        // ── Headline summary section ────────────────────────────────────
        // Same numbers the browse/preview UI shows at the TOP of the page —
        // rendered here as a styled block at the BOTTOM of the sheet,
        // scoped with the exact same filters as the rows above it.
        if (summaryRows && summaryRows.length) {
          const blankRow = sheet.addRow([]);
          await blankRow.commit();

          const summaryTitleRow = sheet.addRow(['REPORT SUMMARY']);
          summaryTitleRow.getCell(1).font = {
            bold: true,
            size: 12,
            name: 'Calibri',
            color: { argb: 'FF' + BRAND.headerBg },
          };
          // XL-3 fix: columnLetter() instead of String.fromCharCode(64+n)
          sheet.mergeCells(`A${summaryTitleRow.number}:${columnLetter(columns.length)}${summaryTitleRow.number}`);
          await summaryTitleRow.commit();

          // eslint-disable-next-line no-restricted-syntax
          for (const [label, value] of summaryRows) {
            // XL-5 fix: summary rows previously bypassed formula sanitization.
            // Apply sanitizeFormula() to both label and value for defense-in-depth.
            const safeLabel = sanitizeFormula(String(label ?? ''));
            const safeValue = sanitizeFormula(String(value ?? ''));
            const row = sheet.addRow([safeLabel, safeValue]);
            row.getCell(1).font = { bold: true, size: 10, name: 'Calibri' };
            row.getCell(2).font = { size: 10, name: 'Calibri' };
            // eslint-disable-next-line no-await-in-loop
            await row.commit();
          }
        }

        // ── Summary footer row ─────────────────────────────────────────
        const footerRow = sheet.addRow([
          `Report generated: ${new Date().toUTCString()}  |  Total records: ${rowIndex}`,
        ]);
        footerRow.height = 16;
        footerRow.getCell(1).font = {
          italic: true,
          size: 9,
          color: { argb: 'FF757575' },
        };
        // XL-3 fix: columnLetter() instead of String.fromCharCode(64+n)
        sheet.mergeCells(
          `A${footerRow.number}:${columnLetter(columns.length)}${footerRow.number}`
        );
        await footerRow.commit();

        await sheet.commit();
        await workbook.commit();

        done = true;
        resolve();
      } catch (err) {
        handleFatalError(err);
      }
    });

    res.on('error', handleFatalError);
  });
};

module.exports = { streamXLSX };