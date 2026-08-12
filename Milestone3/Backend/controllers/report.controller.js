// Backend/controllers/report.controller.js
//
// ── Report Download Controller ────────────────────────────────────────────────
//
// Developer B owns this controller.
//
// ENDPOINT:
//   GET /api/v1/admin/reports/:type?format=csv|xlsx|pdf&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//
// MIDDLEWARE CHAIN (defined in report.routes.js):
//   protect → requireAdmin → reportRateLimiter → reportTypeParam → reportQueryRules → validateReport → downloadReport
//
// AUDIT:
//   After each successful report generation, REPORT_DOWNLOADED is logged via
//   Developer A's auditService.logAction() — non-throwing, fire-and-forget.

const reportService  = require('../services/report.service');
const auditService   = require('../services/audit.service');

/**
 * @desc    Generate and stream a report to the client
 * @route   GET /api/v1/admin/reports/:type
 * @access  Admin (+ reportRateLimiter)
 *
 * @param {express.Request}  req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
const downloadReport = async (req, res, next) => {
  const { type: reportType }    = req.params;
  const { format, startDate, endDate } = req.query;
  const generatedBy = req.user.email || req.user.name || req.user.id;

  try {
    // Generate + stream the report — this pipes directly to res
    await reportService.generateReport({
      reportType,
      format,
      startDate,
      endDate,
      res,
      generatedBy,
    });

    // Fire-and-forget audit log — non-throwing per auditService contract
    await auditService.logAction({
      adminId:    req.user.id,
      action:     'REPORT_DOWNLOADED',
      targetType: 'Report',
      targetId:   req.user._id,          // Admin's own ID as target for report logs
      details:    `Report downloaded: type=${reportType} format=${format} range=${startDate || 'all'}→${endDate || 'all'}`.slice(0, 500),
      req,
    });

  } catch (error) {
    console.error('[ReportController] downloadReport error:', error.message);

    // If headers already sent (stream started), we can't send a JSON error
    if (res.headersSent) {
      console.error('[ReportController] Headers already sent — cannot send error response.');
      return;
    }

    return res.status(500).json({
      success: false,
      message: 'Report generation failed. Please try again.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

module.exports = { downloadReport };
