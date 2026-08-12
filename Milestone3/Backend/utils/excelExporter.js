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

const ExcelJS = require('exceljs');

// Brand colours for consistent report styling
const BRAND = {
  headerBg:   '1B5E20',   // dark green
  headerFont: 'FFFFFF',   // white
  altRowBg:   'E8F5E9',   // light green (even rows)
  borderColor:'BDBDBD',
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
      top:    { style: 'thin', color: { argb: 'FF' + BRAND.borderColor } },
      left:   { style: 'thin', color: { argb: 'FF' + BRAND.borderColor } },
      bottom: { style: 'medium', color: { argb: 'FF' + BRAND.headerBg } },
      right:  { style: 'thin', color: { argb: 'FF' + BRAND.borderColor } },
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
 * @returns {Promise<void>}
 */
const streamXLSX = async ({ cursor, res, filename, sheetName, columns, transform, reportTitle }) => {
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

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: reportTitle ? 2 : 1 }], // Freeze header row(s)
    properties: { defaultRowHeight: 18 },
  });

  // ── Report title row (optional) ─────────────────────────────────────────
  if (reportTitle) {
    sheet.addRow([reportTitle]);
    const titleRow = sheet.lastRow;
    titleRow.height = 28;
    titleRow.getCell(1).font = {
      bold: true,
      size: 14,
      name: 'Calibri',
      color: { argb: 'FF' + BRAND.headerBg },
    };
    sheet.mergeCells(`A1:${String.fromCharCode(64 + columns.length)}1`);
    await titleRow.commit();
  }

  // ── Column definitions ──────────────────────────────────────────────────
  sheet.columns = columns.map((col) => ({
    header:  col.header,
    key:     col.key,
    width:   col.width || 20,
  }));

  // Style the header row
  const headerRow = sheet.lastRow;
  styleHeaderRow(headerRow, columns.length);
  await headerRow.commit();

  // ── Stream data rows ────────────────────────────────────────────────────
  let rowIndex = 0;

  return new Promise((resolve, reject) => {
    cursor.on('data', async (doc) => {
      try {
        const processed = transform ? transform(doc) : doc;
        rowIndex++;

        // Build row values in column key order
        const rowValues = columns.map((col) => {
          const val = col.key.split('.').reduce((obj, k) => obj?.[k], processed);
          if (val instanceof Date) return val.toISOString().split('T')[0];
          if (val === null || val === undefined) return '';
          return String(val);
        });

        const dataRow = sheet.addRow(rowValues);
        styleDataRow(dataRow, rowIndex, columns.length);
        await dataRow.commit();
      } catch (err) {
        reject(err);
      }
    });

    cursor.on('error', reject);

    cursor.on('end', async () => {
      try {
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
        sheet.mergeCells(
          `A${footerRow.number}:${String.fromCharCode(64 + columns.length)}${footerRow.number}`
        );
        await footerRow.commit();

        await sheet.commit();
        await workbook.commit();
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    res.on('error', reject);
  });
};

module.exports = { streamXLSX };
