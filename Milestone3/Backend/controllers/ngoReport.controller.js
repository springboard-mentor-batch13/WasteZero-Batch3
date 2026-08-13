// Backend/controllers/ngoReport.controller.js
//
// ── NGO Report Controller ────────────────────────────────────────────────────
//
// Handles NGO-facing report endpoints. All data is automatically scoped to
// the requesting NGO — an NGO can never access another NGO's records.
//
// FLOW:
//   1. NGO picks a report TYPE      (opportunities | applications | pickups)
//   2. NGO picks a TIME RANGE       (all | week | month | year | custom)
//   3. GET /api/v1/ngo/reports/browse/:type → JSON preview with pagination + summary
//   4. NGO picks a FORMAT           (csv | xlsx | pdf)
//   5. GET /api/v1/ngo/reports/download/:type?format=… → streamed file download
//
// TIME RANGE RESOLUTION:
//   The controller reads the `timeRange` query param and converts it to a
//   concrete { startDate, endDate } pair via resolveTimeRange(). The service
//   layer only ever sees YYYY-MM-DD strings — it has no knowledge of named
//   ranges. This keeps the service clean and reusable.
//
// MIDDLEWARE CHAIN (defined in ngoReport.routes.js):
//   protect → requireNgo → generalLimiter / ngoReportDlLimiter
//   → [validation] → controller

const ngoReportService = require('../services/ngoReport.service');
const { resolveTimeRange, timeRangeLabel } = require('../utils/timeRange.utils');
const { ReportError } = ngoReportService;

/**
 * @desc    Paginated JSON preview of the NGO's own report data.
 *          Used to show records on screen BEFORE the NGO downloads.
 *
 * @route   GET /api/v1/ngo/reports/browse/:type
 * @access  NGO (authenticated)
 *
 * Query Params (all optional):
 *   timeRange  — 'all' | 'week' | 'month' | 'year' | 'custom'  (default: 'all')
 *   year       — 4-digit year; used with timeRange=year|month
 *   month      — 1–12; used with timeRange=month
 *   startDate  — YYYY-MM-DD; used with timeRange=custom
 *   endDate    — YYYY-MM-DD; used with timeRange=custom
 *   page       — default 1
 *   limit      — default 20, max 100
 */
const browseReport = async (req, res) => {
  try {
    const { type: reportType } = req.params;
    const {
      timeRange: reqTimeRange,
      year, month,
      startDate: rawStart,
      endDate:   rawEnd,
      page, limit,
    } = req.query;

    const timeRange = reqTimeRange || (rawStart || rawEnd ? 'custom' : 'all');

    // Resolve named time range → concrete date strings
    const { startDate, endDate } = resolveTimeRange(timeRange, {
      year, month,
      startDate: rawStart,
      endDate:   rawEnd,
    });

    const ngoId = req.user.id;

    const result = await ngoReportService.browseNgoReport(reportType, ngoId, {
      page:  page  || 1,
      limit: limit || 20,
      startDate,
      endDate,
    });

    const columns = ngoReportService.NGO_REPORT_COLUMNS[reportType] || [];

    return res.status(200).json({
      success: true,
      status:  'success',
      data: {
        ...result,
        columns:   columns.map((c) => ({ header: c.header, key: c.key })),
        dateRange: timeRangeLabel(timeRange, { year, month, startDate: rawStart, endDate: rawEnd }),
        timeRange,
      },
    });
  } catch (error) {
    console.error('[NgoReportController] browseReport error:', error.message);
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: status === 500 ? 'Failed to load report preview.' : error.message,
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Generate and stream an NGO report to the client.
 *          Supports CSV, XLSX, and PDF formats.
 *
 * @route   GET /api/v1/ngo/reports/download/:type
 * @access  NGO (authenticated, rate-limited)
 */
const downloadReport = async (req, res) => {
  try {
    const { type: reportType } = req.params;
    const {
      format,
      timeRange: reqTimeRange,
      year, month,
      startDate: rawStart,
      endDate:   rawEnd,
    } = req.query;

    const timeRange = reqTimeRange || (rawStart || rawEnd ? 'custom' : 'all');

    // Resolve time range the same way the browse endpoint does
    const { startDate, endDate } = resolveTimeRange(timeRange, {
      year, month,
      startDate: rawStart,
      endDate:   rawEnd,
    });

    const ngoId = req.user.id;
    const generatedBy = req.user.email || req.user.name || req.user.id;

    await ngoReportService.generateNgoReport({
      reportType,
      format,
      ngoId,
      startDate,
      endDate,
      res,
      generatedBy,
    });

    // generateNgoReport pipes directly to res; nothing more to do here.
  } catch (error) {
    console.error('[NgoReportController] downloadReport error:', error.message);

    if (res.headersSent) {
      console.error('[NgoReportController] Headers already sent — cannot send error response.');
      return;
    }

    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: status === 500 ? 'Report generation failed. Please try again.' : error.message,
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Return the available report types and time-range options for the
 *          NGO report selector UI.
 *
 * @route   GET /api/v1/ngo/reports/options
 * @access  NGO (authenticated)
 */
const getReportOptions = (req, res) => {
  const reportTypes = [
    { value: 'opportunities', label: 'My Opportunities'      },
    { value: 'applications',  label: 'Applications Received' },
    { value: 'pickups',       label: 'Assigned Pickups'      },
  ];

  const timeRanges = [
    { value: 'all',    label: 'All Reports'    },
    { value: 'week',   label: 'This Week'      },
    { value: 'month',  label: 'This Month'     },
    { value: 'year',   label: 'This Year'      },
    { value: 'custom', label: 'Custom Dates'   },
  ];

  const formats = [
    { value: 'pdf',  label: 'PDF'   },
    { value: 'xlsx', label: 'Excel' },
    { value: 'csv',  label: 'CSV'   },
  ];

  return res.status(200).json({
    success: true,
    data: { reportTypes, timeRanges, formats },
  });
};

module.exports = { browseReport, downloadReport, getReportOptions };
