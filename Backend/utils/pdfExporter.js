// Backend/utils/pdfExporter.js
//
// PDF report generator using PDFKit.
//
// ARCHITECTURE:
//   MongoDB Cursor → PDFKit Doc (stream) → HTTP Response
//
// FEATURES:
//   - Professional header with WasteZero branding
//   - Dynamic tables with column formatting
//   - Automatic page breaks and page numbers
//   - Report footer with timestamp and admin info
//   - Colour-coded status cells
//
// USAGE (in report.service.js):
//   await streamPDF({
//     cursor: User.find(filter).lean().cursor(),
//     res,
//     filename: 'users_report_2026-08-12.pdf',
//     reportTitle: 'Users Report',
//     dateRange: '2026-01-01 → 2026-08-12',
//     generatedBy: 'admin@wastezero.io',
//     columns: [
//       { header: 'Name',   key: 'name',  width: 140 },
//       { header: 'Email',  key: 'email', width: 180 },
//       { header: 'Role',   key: 'role',  width: 80  },
//       { header: 'Status', key: 'isSuspended', width: 60, format: 'bool-status' },
//     ],
//     transform: (doc) => doc,
//   });
//
// BUGS FIXED:
//   PDF-1  Duplicate private formatter — local formatCellValue diverged from
//          the shared cellFormatter.js (different date format, " kg" suffix,
//          thousands separators). Same report showed different values in PDF
//          vs CSV/XLSX. Removed local copy; now imports the shared formatter.
//          PDF-specific empty→'—' behaviour preserved at the call site.
//   PDF-2  Unreadable columns — lineBreak:false + ellipsis:true hard-truncated
//          every cell/header to one line. With ~10 columns squeezed onto one
//          landscape page most values were unreadable slivers. Rewrote
//          drawTableRow/drawTableHeader to word-wrap with dynamic per-row
//          height (capped at 3 lines for data / 2 for headers, ellipsis only
//          if still overflowing).
//   PDF-3  ♻ glyph rendered as garbage ("&{") — that Unicode symbol isn't in
//          PDFKit's standard Helvetica encoding. Replaced with a simple drawn
//          filled circle marker via doc.circle().fill().
//   PDF-4  Duplicate footer draw — the first page's footer was drawn twice
//          (once right after setup, once at page-transition/end). Removed the
//          redundant call immediately after the initial drawTableHeader().
//   PDF-5  Same silent-truncation risk on cursor error — doc.end() produced a
//          structurally valid but silently incomplete PDF. Now res.destroy(err)
//          to give the client a connection-level error instead.
//   PDF-6  NaN column widths — a column missing width poisoned fitColumnsToWidth
//          scale math (NaN propagates to every column). Added defensive fallback.
//   PDF-7  Double resolve — both cursor 'end' handler and res 'finish' listener
//          called resolve(); harmless but semantically wrong. Removed the
//          res.on('finish', resolve) duplicate; resolve only once in 'end'.
//   PDF-8  Long title/subtitle could bleed outside the header bar — added
//          height caps + ellipsis on the title and subtitle text calls.
//   PDF-9  Fixed PAGE.rowHeight in addPageIfNeeded didn't account for dynamic
//          row heights after the PDF-2 fix. addPageIfNeeded now accepts the
//          actual computed row height for the upcoming row.
//   PDF-10 Data handler catch didn't clean up — drawTableRow errors left doc
//          open and res dangling. Now calls handleFatalError() like other sites.

const PDFDocument     = require('pdfkit');
const { formatCellValue } = require('./cellFormatter'); // PDF-1 fix: shared formatter

// ─────────────────────────────────────────────────────────────────────────────
// Brand palette
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = {
  primary:    '#1B5E20', // dark green
  secondary:  '#2E7D32', // medium green
  accent:     '#4CAF50', // bright green
  headerBg:   '#1B5E20',
  headerFg:   '#FFFFFF',
  rowAlt:     '#E8F5E9', // light green alternate row
  rowNormal:  '#FFFFFF',
  border:     '#BDBDBD',
  text:       '#212121',
  subtext:    '#757575',
  success:    '#2E7D32',
  danger:     '#C62828',
  warning:    '#F57F17',
  pageFooter: '#9E9E9E',
};

// 1cm expressed in PDF points (72pt / inch, 2.54cm / inch).
const CM_TO_PT = 72 / 2.54;

const PAGE = {
  margin:    CM_TO_PT, // 1cm on every side, per spec
  width:     792,      // Letter landscape
  height:    612,
  headerH:   30,       // column header row height (updated: 2-line cap)
  lineHeight: 11,      // approximate line height at fontSize 8
};

// Maximum lines before ellipsis kicks in.
const MAX_DATA_LINES   = 3;
const MAX_HEADER_LINES = 2;

/**
 * Draw a filled rectangle.
 */
const fillRect = (doc, x, y, w, h, color) => {
  doc.save().rect(x, y, w, h).fill(color).restore();
};

/**
 * Scale a set of caller-supplied column widths so they sum to exactly
 * `targetWidth` — the usable content width between the page's left and
 * right margins — while preserving each column's relative proportion.
 *
 * PDF-6 fix: a column missing `width` previously produced NaN which
 * propagated through all arithmetic. Now defaults to 80 per column.
 *
 * @param {{ header, key, width?, format? }[]} columns
 * @param {number} targetWidth
 * @param {number} [minWidth=24]
 * @returns {{ header, key, width, format? }[]} new array; input is not mutated
 */
const fitColumnsToWidth = (columns, targetWidth, minWidth = 24) => {
  // PDF-6 fix: guard against missing/NaN width values.
  const safeColumns = columns.map((c) => ({ ...c, width: c.width > 0 ? c.width : 80 }));
  const totalW = safeColumns.reduce((sum, c) => sum + c.width, 0);
  if (totalW <= 0) return safeColumns;

  const scale  = targetWidth / totalW;
  const scaled = safeColumns.map((c) => ({
    ...c,
    width: Math.max(minWidth, c.width * scale),
  }));

  // minWidth clamping (or plain rounding) can leave the scaled sum a hair
  // off target — push the drift onto the widest column so the table's
  // right edge lines up exactly with the page's usable width.
  const scaledTotal = scaled.reduce((sum, c) => sum + c.width, 0);
  const drift = targetWidth - scaledTotal;
  if (Math.abs(drift) > 0.01) {
    scaled.reduce((a, b) => (b.width > a.width ? b : a), scaled[0]).width += drift;
  }

  return scaled;
};

/**
 * Render the WasteZero PDF report header block.
 *
 * PDF-3 fix: replaced the ♻ Unicode glyph (not in Helvetica's encoding,
 * rendered as "&{" garbage) with a programmatically drawn filled circle.
 * PDF-8 fix: added height constraints + ellipsis on title/subtitle so long
 * strings don't bleed below the green header bar.
 *
 * @param {import('pdfkit')} doc
 * @param {object} opts
 */
const drawReportHeader = (doc, { reportTitle, dateRange, generatedBy }) => {
  const { margin, width } = PAGE;
  const contentW  = width - margin * 2;
  const headerBarH = 70;

  // Green header bar
  fillRect(doc, margin, margin, contentW, headerBarH, COLORS.headerBg);

  // PDF-3 fix: draw a simple filled circle as the recycling icon instead of ♻.
  // The ♻ glyph (U+267B) is not in Helvetica's WinAnsi encoding and renders
  // as "&{" or similar garbage in PDFKit.
  const circleX = margin + 24;
  const circleY = margin + 28;
  doc
    .save()
    .circle(circleX, circleY, 10)
    .fill('#A5D6A7')
    .restore();
  // Arrow chevrons inside circle (simple drawn lines)
  doc
    .save()
    .circle(circleX, circleY, 6)
    .fill(COLORS.headerBg)
    .restore();

  // WasteZero logo text (left, positioned after the icon)
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(COLORS.headerFg)
    .text('WasteZero', margin + 42, margin + 16, {
      width:     contentW / 2 - 42,
      height:    24,
      ellipsis:  true,
      lineBreak: false,
    });

  // Platform tagline
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#A5D6A7')
    .text('Smart Waste Pickup & Recycling Platform', margin + 42, margin + 40, {
      width:     contentW / 2 - 42,
      height:    16,
      ellipsis:  true,
      lineBreak: false,
    });

  // PDF-8 fix: report title on the right — cap height so it can't bleed
  // below the 70pt header bar.
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(COLORS.headerFg)
    .text(String(reportTitle || 'Report'), margin + contentW / 2, margin + 10, {
      width:     contentW / 2 - 16,
      height:    24,      // max 2 lines at 14pt ≈ 20pt each → cap to 1 line
      align:     'right',
      ellipsis:  true,
      lineBreak: false,
    });

  // PDF-8 fix: subtitle info — cap height so it stays within the bar.
  const subtitle = `Date Range: ${dateRange || 'All time'}   |   Generated by: ${generatedBy || 'Admin'}   |   ${new Date().toUTCString()}`;
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#C8E6C9')
    .text(subtitle, margin + contentW / 2, margin + 40, {
      width:     contentW / 2 - 16,
      height:    20,
      align:     'right',
      ellipsis:  true,
      lineBreak: false,
    });

  doc.moveDown(0.5);
};

/**
 * Draw the column header row for a table.
 *
 * PDF-2 fix: changed from lineBreak:false (hard 1-line truncation) to
 * lineBreak:true with a capped height of MAX_HEADER_LINES lines so headers
 * wrap gracefully instead of silently truncating to a sliver.
 *
 * @param {import('pdfkit')} doc
 * @param {{ header: string, width: number }[]} columns
 * @param {number} x
 * @param {number} y
 * @returns {number} Y after header row
 */
const drawTableHeader = (doc, columns, x, y) => {
  // PDF-9 fix: compute actual header height based on capped line count.
  const headerH = PAGE.lineHeight * MAX_HEADER_LINES + 10; // padding top+bottom
  let cx = x;
  fillRect(doc, x, y, columns.reduce((sum, c) => sum + c.width, 0), headerH, COLORS.headerBg);

  columns.forEach((col) => {
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(COLORS.headerFg)
      .text(col.header, cx + 4, y + 5, {
        width:     col.width - 8,
        height:    headerH - 8,   // cap at 2 lines; ellipsis if still too long
        ellipsis:  true,
        lineBreak: true,           // PDF-2 fix: was false
        align:     'left',
      });
    cx += col.width;
  });

  return y + headerH;
};

/**
 * Compute the rendered height of a single data cell's text given its column
 * width, font size, and the MAX_DATA_LINES cap.
 *
 * PDFKit does not expose a public heightOfString API that also accounts for
 * the cap, so we approximate: estimate line count from character density then
 * clamp to MAX_DATA_LINES.
 *
 * @param {string} text
 * @param {number} colWidth
 * @returns {number} height in points
 */
const estimateCellHeight = (text, colWidth) => {
  // Approximate chars per line at fontSize 8, Helvetica (avg char width ≈ 4.5pt)
  const charsPerLine = Math.max(1, Math.floor((colWidth - 8) / 4.5));
  const lineCount    = Math.min(MAX_DATA_LINES, Math.ceil(text.length / charsPerLine));
  return Math.max(1, lineCount) * PAGE.lineHeight + 8; // 4pt padding top+bottom
};

/**
 * Draw a single data row.
 *
 * PDF-2/9 fix: word-wraps cells (lineBreak:true) and returns the actual
 * rendered height so addPageIfNeeded can reserve the correct space.
 *
 * @param {import('pdfkit')} doc
 * @param {object}                              docData   - The document
 * @param {{ header, key, width, format }[]}    columns
 * @param {number} x
 * @param {number} y
 * @param {boolean} isEven
 * @returns {number} Y after row (i.e. y + actual row height)
 */
const drawTableRow = (doc, docData, columns, x, y, isEven) => {
  const totalW = columns.reduce((sum, c) => sum + c.width, 0);

  // PDF-1 fix: use shared formatCellValue from cellFormatter.js.
  // PDF-1 note: shared formatter returns '' for null/undefined; PDF displays
  // '—' as the empty placeholder (matches original pdfExporter behavior).
  const cellTexts = columns.map((col) => {
    const rawVal = col.key.split('.').reduce((obj, k) => obj?.[k], docData);
    const formatted = formatCellValue(rawVal, col.format);
    return formatted === '' ? '—' : formatted;
  });

  // PDF-9: compute dynamic row height from the tallest cell.
  const rowHeight = columns.reduce((maxH, col, i) => {
    const h = estimateCellHeight(cellTexts[i], col.width);
    return h > maxH ? h : maxH;
  }, PAGE.lineHeight + 8);

  // Alternate row background
  if (isEven) fillRect(doc, x, y, totalW, rowHeight, COLORS.rowAlt);

  let cx = x;
  columns.forEach((col, i) => {
    const text = cellTexts[i];

    // Special colour for status columns
    let textColor = COLORS.text;
    const rawVal  = col.key.split('.').reduce((obj, k) => obj?.[k], docData);
    if (col.format === 'bool-status') {
      textColor = rawVal ? COLORS.danger : COLORS.success;
    }

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(textColor)
      .text(text, cx + 4, y + 4, {
        width:     col.width - 8,
        height:    rowHeight - 8,   // PDF-2 fix: was fixed PAGE.rowHeight-4
        ellipsis:  true,
        lineBreak: true,            // PDF-2 fix: was false
      });

    cx += col.width;
  });

  // Row bottom border
  doc
    .save()
    .moveTo(x, y + rowHeight)
    .lineTo(x + totalW, y + rowHeight)
    .strokeColor('#E0E0E0')
    .lineWidth(0.5)
    .stroke()
    .restore();

  return y + rowHeight;
};

/**
 * Draw the page footer with page number.
 *
 * @param {import('pdfkit')} doc
 * @param {number} pageNum
 */
const drawPageFooter = (doc, pageNum) => {
  const { margin, width, height } = PAGE;
  const y = height - margin - 16;

  doc
    .save()
    .moveTo(margin, y)
    .lineTo(width - margin, y)
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .stroke()
    .restore();

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(COLORS.pageFooter)
    .text('WasteZero Analytics Report — Confidential', margin, y + 4, {
      width: (width - margin * 2) / 2,
      align: 'left',
    })
    .text(`Page ${pageNum}`, margin, y + 4, {
      width: width - margin * 2,
      align: 'right',
    });
};

/**
 * Stream a MongoDB cursor to a PDF HTTP response.
 *
 * @param {object} opts
 * @param {import('mongoose').QueryCursor} opts.cursor
 * @param {import('express').Response}     opts.res
 * @param {string}                         opts.filename
 * @param {string}                         opts.reportTitle
 * @param {string}                         [opts.dateRange]
 * @param {string}                         [opts.generatedBy]
 * @param {{ header, key, width, format? }[]} opts.columns
 * @param {Function}                       [opts.transform]
 * @param {[string, string|number][]}      [opts.summaryRows] - Extra [label, value]
 *   pairs rendered as a "Report Summary" block after the data table, e.g.
 *   [['Total Users', 250], ['NGOs', 40], ...].
 * @returns {Promise<void>}
 */
const streamPDF = ({ cursor, res, filename, reportTitle, dateRange, generatedBy, columns: rawColumns, transform, summaryRows }) => {
  return new Promise((resolve, reject) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const doc = new PDFDocument({
      size:          'LETTER',
      layout:        'landscape',
      margin:        PAGE.margin,
      bufferPages:   false, // stream mode — don't buffer
      autoFirstPage: true,
    });

    doc.pipe(res);

    let pageNum  = 1;
    let rowIndex = 0;
    let currentY;
    const { margin, width, height } = PAGE;
    const usableWidth = width - margin * 2;

    // Auto-fit caller-supplied column widths to exactly span the usable
    // page width — never overflows the right margin, always uses the full
    // page regardless of what the caller's widths summed to.
    // PDF-6 fix: fitColumnsToWidth now guards against missing/NaN widths.
    const columns = fitColumnsToWidth(rawColumns, usableWidth);

    // ── Once-guarded fatal-error handler ─────────────────────────────────
    // PDF-5/10 fix: on any mid-stream error destroy the response (headers
    // already sent → can't send 500 JSON). Using res.destroy() instead of
    // doc.end() signals a connection-level error to the client rather than
    // delivering a structurally valid but silently truncated PDF.
    let done = false;
    const handleFatalError = (err) => {
      if (done) return;
      done = true;
      try { cursor.destroy(); } catch (_) { /* ignore */ }
      res.destroy(err);
      reject(err);
    };

    // ── Draw first page header + table header ─────────────────────────────
    drawReportHeader(doc, { reportTitle, dateRange, generatedBy });
    currentY = margin + 70 + 20; // below the header block
    currentY = drawTableHeader(doc, columns, margin, currentY);
    // PDF-4 fix: removed the premature drawPageFooter() call that was here.
    // It drew the footer on the first page *before* any data rows, so the
    // footer appeared twice on page 1 (once from this call, once from the
    // page-transition / end-of-data calls below). The footer is now drawn
    // exclusively by addPageIfNeeded (on transition) and the 'end' handler.

    // PDF-9 fix: accept the actual upcoming row height so we reserve the
    // right amount of vertical space before deciding to break.
    const addPageIfNeeded = (nextRowHeight) => {
      const safeRowH = nextRowHeight || (PAGE.lineHeight + 8);
      if (currentY + safeRowH > height - margin - 32) {
        drawPageFooter(doc, pageNum);
        doc.addPage();
        pageNum++;
        currentY = margin + 20;
        currentY = drawTableHeader(doc, columns, margin, currentY);
      }
    };

    cursor.on('data', (rawDoc) => {
      // PDF-10 fix: catch errors and destroy the connection; don't just reject.
      try {
        if (done) return;
        const processed = transform ? transform(rawDoc) : rawDoc;

        // Estimate row height before drawing so addPageIfNeeded can make the
        // right decision (PDF-9 fix).
        const previewTexts = columns.map((col) => {
          const rawVal    = col.key.split('.').reduce((obj, k) => obj?.[k], processed);
          const formatted = formatCellValue(rawVal, col.format);
          return formatted === '' ? '—' : formatted;
        });
        const estRowHeight = columns.reduce((maxH, col, i) => {
          const h = estimateCellHeight(previewTexts[i], col.width);
          return h > maxH ? h : maxH;
        }, PAGE.lineHeight + 8);

        addPageIfNeeded(estRowHeight);
        const isEven = rowIndex % 2 === 0;
        currentY = drawTableRow(doc, processed, columns, margin, currentY, isEven);
        rowIndex++;
      } catch (err) {
        handleFatalError(err); // PDF-10 fix
      }
    });

    // PDF-5 fix: was `doc.end(); reject(err)` — produces a valid-looking but
    // silently truncated PDF, giving no error indication to the client.
    cursor.on('error', handleFatalError);

    cursor.on('end', () => {
      if (done) return;
      try {
        // ── Summary stats block ─────────────────────────────────────────
        if (rowIndex === 0) {
          doc
            .font('Helvetica')
            .fontSize(11)
            .fillColor(COLORS.subtext)
            .text('No records found for the selected date range.', margin, currentY + 20, {
              align: 'center',
              width: usableWidth,
            });
        } else {
          currentY += 16;
          doc
            .font('Helvetica-Oblique')
            .fontSize(8)
            .fillColor(COLORS.subtext)
            .text(
              `Total Records: ${rowIndex}  |  Generated: ${new Date().toUTCString()}  |  WasteZero Analytics Engine v4.0`,
              margin,
              currentY,
              { align: 'center', width: usableWidth }
            );
          currentY += 14;
        }

        // ── Headline report summary (totals + status breakdown) ─────────
        if (summaryRows && summaryRows.length) {
          const labelW = 260;
          const rowH   = 15;
          const ensureRoom = () => {
            if (currentY + rowH > height - margin - 32) {
              drawPageFooter(doc, pageNum);
              doc.addPage();
              pageNum++;
              currentY = margin + 20;
            }
          };

          currentY += 12;
          ensureRoom();
          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor(COLORS.primary)
            .text('Report Summary', margin, currentY, { width: usableWidth });
          currentY += 20;

          summaryRows.forEach(([label, value]) => {
            ensureRoom();
            const isBlank = label === '' && value === '';
            if (isBlank) {
              currentY += rowH / 2;
              return;
            }
            doc
              .font('Helvetica-Bold')
              .fontSize(9)
              .fillColor(COLORS.text)
              .text(String(label), margin, currentY, { width: labelW, ellipsis: true, lineBreak: false });
            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor(COLORS.text)
              .text(String(value), margin + labelW, currentY, { width: usableWidth - labelW, lineBreak: false });
            currentY += rowH;
          });
        }

        drawPageFooter(doc, pageNum);
        doc.end();

        // PDF-7 fix: resolve only once here. Previously res.on('finish', resolve)
        // was also registered, causing resolve() to be called twice. The
        // res.on('finish') listener has been removed below.
        done = true;
        resolve();
      } catch (err) {
        handleFatalError(err);
      }
    });

    doc.on('error', handleFatalError);
    // PDF-7 fix: removed `res.on('finish', resolve)` — resolve is called
    // exactly once in the cursor 'end' handler above.
    res.on('error', handleFatalError);
  });
};

module.exports = { streamPDF };
