// Backend/controllers/report.controller.js
//
// ── Report Download + Browse Controller ────────────────────────────────────────
//
// Developer B owns this controller.
//
// ENDPOINTS:
//   GET /api/v1/admin/reports/:type?format=csv|xlsx|pdf&startDate=&endDate=
//       &ngoUsername=&volunteerUsername=&opportunityId=
//     — generate + stream a report download
//
//   GET /api/v1/admin/reports/browse/:type?page=&limit=&startDate=&endDate=
//       &ngoUsername=&volunteerUsername=&opportunityId=
//     — paginated preview of records for any report type, shown BEFORE download
//       so the admin can verify they have the right scope/date range
//
//   GET /api/v1/admin/reports/browse/opportunities?ngoUsername=<username>
//     — list one NGO's opportunities (dropdown-population step)
//       KEPT for backward-compat / legacy frontend use
//
//   GET /api/v1/admin/reports/browse/opportunities/:opportunityId/applications
//     — paginated preview of one opportunity's applications
//       KEPT for backward-compat / legacy frontend use
//
// NOTE ON IDENTIFIERS: admins never handle raw Mongo ObjectIds for NGOs or
// volunteers here — they type/see USERNAMES. report.service.js resolves
// username → ID internally. opportunityId is the one exception.
//
// MIDDLEWARE CHAIN (defined in report.routes.js):
//   protect → requireAdmin → [rate limiter] → [validation] → controller
//
// AUDIT:
//   After each successful report generation, REPORT_DOWNLOADED is logged via
//   Developer A's auditService.logAction() — non-throwing, fire-and-forget.
//   Browse endpoints are read-only previews and are NOT audit-logged.

const mongoose        = require('mongoose');
const reportService  = require('../services/report.service');
const auditService   = require('../services/audit.service');
const { resolveTimeRange } = require('../utils/timeRange.utils');

/**
 * @desc    Generate and stream a report to the client
 * @route   GET /api/v1/admin/reports/:type
 * @access  Admin (+ reportRateLimiter)
 */
const downloadReport = async (req, res, next) => {
  const { type: reportType }    = req.params;
  const {
    format,
    timeRange,
    year, month,
    startDate: rawStart, endDate: rawEnd,
    ngoUsername, opportunityId, volunteerUsername,
  } = req.query;
  const generatedBy = req.user.email || req.user.name || req.user.id;

  // Resolve named time range → concrete YYYY-MM-DD dates.
  // If timeRange is absent or 'custom', rawStart/rawEnd pass through unchanged.
  const { startDate, endDate } = resolveTimeRange(timeRange || 'custom', {
    year, month,
    startDate: rawStart,
    endDate:   rawEnd,
  });

  try {
    // Generate + stream the report — this pipes directly to res
    await reportService.generateReport({
      reportType,
      format,
      startDate,
      endDate,
      ngoUsername,
      opportunityId,
      volunteerUsername,
      res,
      generatedBy,
    });

    // Fire-and-forget audit log — non-throwing per auditService contract.
    // There's no real "Report" entity to reference (a report is generated,
    // not stored), so target_id previously reused the admin's own _id —
    // which conflates admin_id and target_id and reads as "the admin is the
    // target of their own action". Instead we mint a fresh ObjectId that
    // stands for this specific download event, and put every identifying
    // detail (type/format/filters) into `details` where it's actually useful.
    auditService.logAction({
      adminId:    req.user.id,
      action:     'REPORT_DOWNLOADED',
      targetType: 'Report',
      targetId:   new mongoose.Types.ObjectId(),
      details:    `Report downloaded: type=${reportType} format=${format} range=${startDate || 'all'}→${endDate || 'all'}${ngoUsername ? ` ngoUsername=${ngoUsername}` : ''}${opportunityId ? ` opportunityId=${opportunityId}` : ''}${volunteerUsername ? ` volunteerUsername=${volunteerUsername}` : ''}`.slice(0, 500),
      req,
    }).catch((err) => {
      console.error('[ReportController] downloadReport audit log failed (non-fatal):', err.message);
    });

  } catch (error) {
    console.error('[ReportController] downloadReport error:', error.message);

    if (res.headersSent) {
      console.error('[ReportController] Headers already sent — cannot send error response.');
      return;
    }

    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? 'Report generation failed. Please try again.' : error.message,
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Paginated preview of any report type — shown BEFORE the admin downloads.
 *          Accepts the same scoping params as the download endpoint (ngoUsername,
 *          volunteerUsername, opportunityId) plus standard pagination (page, limit).
 *          The format query param is intentionally IGNORED here — preview always
 *          returns JSON; format is only relevant at download time.
 *
 * @route   GET /api/v1/admin/reports/browse/:type
 * @access  Admin (+ adminLimiter)
 *
 * Query Params (all optional unless noted):
 *   page              — default 1
 *   limit             — default 20, max 100
 *   startDate         — YYYY-MM-DD
 *   endDate           — YYYY-MM-DD
 *   ngoUsername       — scope opportunities / applications to one NGO
 *   volunteerUsername — scope pickups to one volunteer
 *   opportunityId     — scope applications to one opportunity
 *                       (required for type=applications unless ngoUsername given)
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       records: [...],   // one page of the report's raw documents
 *       total: <number>,  // total matching documents (for pagination UI)
 *       page: <number>,
 *       limit: <number>,
 *       totalPages: <number>,
 *       columns: [...]    // column definitions so frontend can build the table
 *     }
 *   }
 */
const browseReport = async (req, res) => {
  try {
    const { type: reportType } = req.params;
    const {
      page, limit,
      timeRange,
      year, month,
      startDate: rawStart, endDate: rawEnd,
      ngoUsername, volunteerUsername, opportunityId,
    } = req.query;

    // Resolve named time range → concrete dates; pass-through if absent
    const { startDate, endDate } = resolveTimeRange(timeRange || 'custom', {
      year, month,
      startDate: rawStart,
      endDate:   rawEnd,
    });

    const result = await reportService.browseReport(reportType, {
      page:              page  || 1,
      limit:             limit || 20,
      startDate,
      endDate,
      ngoUsername,
      volunteerUsername,
      opportunityId,
    });

    // Include the column definitions so the frontend can render the table
    // header row without hardcoding per-type knowledge.
    const columns = reportService.REPORT_COLUMNS[reportType] || [];

    return res.status(200).json({
      success: true,
      status:  'success',
      data: {
        ...result,
        columns: columns.map((c) => ({ header: c.header, key: c.key })),
      },
    });
  } catch (error) {
    console.error('[ReportController] browseReport error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? 'Failed to load preview.' : error.message,
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    List one NGO's opportunities (picker dropdown, by username)
 * @route   GET /api/v1/admin/reports/browse/opportunities?ngoUsername=<username>
 * @access  Admin
 * @note    Kept for backward-compatibility. New code should prefer browseReport
 *          with type=opportunities.
 */
const browseOpportunitiesByNgo = async (req, res) => {
  try {
    const { ngoUsername } = req.query;
    const result = await reportService.getOpportunitiesByNgoUsername(ngoUsername);

    return res.status(200).json({
      success: true,
      status:  'success',
      data:    result,
    });
  } catch (error) {
    console.error('[ReportController] browseOpportunitiesByNgo error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? 'Failed to list opportunities.' : error.message,
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Paginated preview of one opportunity's applications
 * @route   GET /api/v1/admin/reports/browse/opportunities/:opportunityId/applications
 * @access  Admin
 * @note    Kept for backward-compatibility. New code should prefer browseReport
 *          with type=applications&opportunityId=<id>.
 */
const browseApplicationsForOpportunity = async (req, res) => {
  try {
    const { opportunityId } = req.params;
    const page  = req.query.page  || 1;
    const limit = req.query.limit || 20;

    const result = await reportService.getApplicationsForOpportunity(opportunityId, { page, limit });

    return res.status(200).json({
      success: true,
      status:  'success',
      data:    result,
    });
  } catch (error) {
    console.error('[ReportController] browseApplicationsForOpportunity error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? 'Failed to fetch applications.' : error.message,
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

module.exports = {
  downloadReport,
  browseReport,
  browseOpportunitiesByNgo,
  browseApplicationsForOpportunity,
};
