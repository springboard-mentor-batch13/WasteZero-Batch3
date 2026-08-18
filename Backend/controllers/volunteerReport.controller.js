// Backend/controllers/volunteerReport.controller.js
//
// ── Volunteer Report Controller ──────────────────────────────────────────────
//
// Handles volunteer-facing report endpoints. All data is automatically scoped
// to the requesting volunteer — they can never access another user's records.
//
// FLOW:
//   1. Volunteer picks a report TYPE  (applications | opportunities)
//   2. Volunteer picks a TIME RANGE   (all | week | month | year | custom)
//   3. GET /api/v1/reports/browse/:type → JSON preview with pagination + summary
//   4. Volunteer picks a FORMAT        (csv | xlsx | pdf)
//   5. GET /api/v1/reports/download/:type?format=… → streamed file download
//
// TIME RANGE RESOLUTION:
//   The controller reads the `timeRange` query param and converts it to a
//   concrete { startDate, endDate } pair via resolveTimeRange(). The service
//   layer only ever sees YYYY-MM-DD strings — it has no knowledge of named
//   ranges. This keeps the service clean and reusable.
//
// MIDDLEWARE CHAIN (defined in volunteerReport.routes.js):
//   protect → requireVolunteer → generalLimiter / reportRateLimiter
//   → [validation] → controller

const volunteerReportService = require('../services/volunteerReport.service');
const { resolveTimeRange, timeRangeLabel } = require('../utils/timeRange.utils');
const { ReportError } = volunteerReportService;

/**
 * @desc    Paginated JSON preview of the volunteer's own report data.
 *          Used to show records on screen BEFORE the volunteer downloads.
 *
 * @route   GET /api/v1/reports/browse/:type
 * @access  Volunteer (authenticated)
 *
 * Query Params (all optional):
 *   timeRange  — 'all' | 'week' | 'month' | 'year' | 'custom'  (default: 'all')
 *   year       — 4-digit year; used with timeRange=year|month
 *   month      — 1–12; used with timeRange=month
 *   startDate  — YYYY-MM-DD; used with timeRange=custom
 *   endDate    — YYYY-MM-DD; used with timeRange=custom
 *   page       — default 1
 *   limit      — default 20, max 100
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       records:    [...],      // one page of documents
 *       total:      <number>,   // total matching docs
 *       page, limit, totalPages,
 *       summary:    { ... },    // headline counts (type-specific)
 *       columns:    [{ header, key }],  // for frontend table header
 *       dateRange:  '<label>',  // human-readable range label
 *     }
 *   }
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

    const volunteerId = req.user.id;

    const result = await volunteerReportService.browseVolunteerReport(reportType, volunteerId, {
      page:  page  || 1,
      limit: limit || 20,
      startDate,
      endDate,
    });

    const columns = volunteerReportService.VOLUNTEER_REPORT_COLUMNS[reportType] || [];

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
    console.error('[VolunteerReportController] browseReport error:', error.message);
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: status === 500 ? 'Failed to load report preview.' : error.message,
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Generate and stream a volunteer report to the client.
 *          Supports CSV, XLSX, and PDF formats.
 *
 * @route   GET /api/v1/reports/download/:type
 * @access  Volunteer (authenticated, rate-limited)
 *
 * Query Params:
 *   format     (required) — 'csv' | 'xlsx' | 'pdf'
 *   timeRange  — 'all' | 'week' | 'month' | 'year' | 'custom'  (default: 'all')
 *   year, month, startDate, endDate  — same semantics as browse
 *
 * Response:
 *   Binary stream with Content-Type and Content-Disposition headers set.
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

    const volunteerId = req.user.id;
    const generatedBy = req.user.email || req.user.name || req.user.id;

    await volunteerReportService.generateVolunteerReport({
      reportType,
      format,
      volunteerId,
      startDate,
      endDate,
      res,
      generatedBy,
    });

    // generateVolunteerReport pipes directly to res; nothing more to do here.
  } catch (error) {
    console.error('[VolunteerReportController] downloadReport error:', error.message);

    if (res.headersSent) {
      console.error('[VolunteerReportController] Headers already sent — cannot send error response.');
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
 *          current user's role. The frontend uses this to build the selector UI
 *          without hardcoding role logic client-side.
 *
 * @route   GET /api/v1/reports/options
 * @access  Volunteer (authenticated)
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       reportTypes: [{ value, label }],
 *       timeRanges:  [{ value, label }],
 *       formats:     [{ value, label }],
 *     }
 *   }
 */
const getReportOptions = (req, res) => {
  const reportTypes = [
    { value: 'applications',  label: 'My Applications'           },
    { value: 'opportunities', label: 'My Applied Opportunities'  },
    { value: 'pickups',       label: 'My Pickup Requests'        },
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
