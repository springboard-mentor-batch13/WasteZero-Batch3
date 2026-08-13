// Backend/services/ngoReport.service.js
//
// Report service for NGO-facing report endpoints.
//
// All data returned by this service is ALWAYS scoped to the requesting
// NGO's own records — an NGO can never see another NGO's data.
//
// SUPPORTED REPORT TYPES:
//   'opportunities'  — opportunities the NGO personally created, with status
//   'applications'   — applications received against the NGO's own opportunities,
//                       enriched with opportunity title/location/date
//   'pickups'        — pickups currently/previously assigned to the NGO
//                       (agent_id === ngoId), with status
//
// SUPPORTED FORMATS (download only): csv, xlsx, pdf
//
// STREAMING CONTRACT (same as admin report.service.js):
//   Download paths NEVER load the entire dataset into memory.
//   They use Mongoose/Aggregation cursors piped to HTTP response.

const mongoose    = require('mongoose');
const Opportunity = require('../models/opportunity.model');
const Application = require('../models/application.model');
const Pickup      = require('../models/pickup.model');

const { streamCSV  } = require('../utils/csvExporter');
const { streamXLSX } = require('../utils/excelExporter');
const { streamPDF  } = require('../utils/pdfExporter');

// Re-use ReportError and buildDateFilter from the shared report service so
// the controller gets the same error shape and this service does NOT
// duplicate date-range logic.
const { ReportError, buildDateFilter, transformDoc } = require('./report.service');

// ─────────────────────────────────────────────────────────────────────────────
// Column definitions (used by browse JSON, CSV, XLSX, PDF)
// ─────────────────────────────────────────────────────────────────────────────

const NGO_REPORT_COLUMNS = {
  opportunities: [
    { header: 'Opportunity ID',  key: '_id',              width: 28, pdfWidth: 110 },
    { header: 'Title',           key: 'title',             width: 32, pdfWidth: 160 },
    { header: 'Location',        key: 'location',          width: 22, pdfWidth: 110 },
    { header: 'Duration',        key: 'duration',          width: 15, pdfWidth: 75  },
    { header: 'Skills',          key: 'required_skills',   width: 30, pdfWidth: 140, format: 'array' },
    { header: 'Opportunity Status', key: 'status',         width: 16, pdfWidth: 80  },
    { header: 'Removed',         key: 'isRemovedByAdmin',  width: 10, pdfWidth: 55, format: 'bool-yn' },
    { header: 'Event Date',      key: 'date',               width: 18, pdfWidth: 85, format: 'date' },
    { header: 'Created',         key: 'createdAt',          width: 18, pdfWidth: 85, format: 'date' },
  ],

  // Applications received against the NGO's opportunities. volunteer_username
  // and opportunity_title/location/date are populated via $lookup.
  applications: [
    { header: 'Application ID',        key: '_id',                   width: 28, pdfWidth: 110 },
    { header: 'Volunteer Username',    key: 'volunteer_username',    width: 22, pdfWidth: 110 },
    { header: 'Opportunity Title',     key: 'opportunity_title',     width: 35, pdfWidth: 170 },
    { header: 'Opportunity Location',  key: 'opportunity_location',  width: 22, pdfWidth: 110 },
    { header: 'Event Date',            key: 'opportunity_date',      width: 18, pdfWidth: 85, format: 'date' },
    { header: 'Application Status',    key: 'status',                width: 16, pdfWidth: 80  },
    { header: 'Applied On',            key: 'createdAt',             width: 20, pdfWidth: 95, format: 'date' },
    { header: 'Last Updated',          key: 'updatedAt',             width: 20, pdfWidth: 95, format: 'date' },
  ],

  // Pickups assigned to this NGO (agent_id === ngoId). volunteer_username is
  // populated via $lookup so the NGO can see who requested the pickup.
  pickups: [
    { header: 'Pickup ID',          key: '_id',                      width: 28, pdfWidth: 110 },
    { header: 'Volunteer Username', key: 'volunteer_username',       width: 22, pdfWidth: 110 },
    { header: 'City',               key: 'address.city',             width: 18, pdfWidth: 90  },
    { header: 'Area',               key: 'address.area',             width: 18, pdfWidth: 90  },
    { header: 'Scheduled',          key: 'scheduledDate',            width: 20, pdfWidth: 90, format: 'date' },
    { header: 'Time Slot',          key: 'preferredTimeSlot.start',  width: 15, pdfWidth: 70  },
    { header: 'Waste Types',        key: 'wasteTypes',               width: 30, pdfWidth: 130, format: 'array' },
    { header: 'Status',             key: 'status',                   width: 14, pdfWidth: 70  },
    { header: 'Completed At',       key: 'completedAt',              width: 20, pdfWidth: 90, format: 'date' },
    { header: 'Created',            key: 'createdAt',                width: 20, pdfWidth: 90, format: 'date' },
  ],
};

const NGO_REPORT_TYPES = Object.keys(NGO_REPORT_COLUMNS);

// ─────────────────────────────────────────────────────────────────────────────
// Filter builders
// ─────────────────────────────────────────────────────────────────────────────

/** Build the base match for Opportunity queries scoped to one NGO + date. */
const buildOppFilter = (ngoId, { startDate, endDate } = {}) => {
  const filter = buildDateFilter(startDate, endDate, 'createdAt');
  filter.ngo_id = new mongoose.Types.ObjectId(ngoId);
  return filter;
};

/**
 * Build the base match for Application queries scoped to applications
 * received against one NGO's own opportunities + date.
 */
const buildAppFilter = async (ngoId, { startDate, endDate } = {}) => {
  const opportunityIds = await Opportunity.find({ ngo_id: new mongoose.Types.ObjectId(ngoId) }).distinct('_id');
  const filter = buildDateFilter(startDate, endDate, 'createdAt');
  filter.opportunity_id = { $in: opportunityIds };
  return filter;
};

/**
 * Build the base match for Pickup queries scoped to pickups assigned to
 * one NGO (agent_id === ngoId) + date. This can never be overridden by any
 * query parameter — an NGO can only ever see pickups it holds/held.
 */
const buildPickupFilter = (ngoId, { startDate, endDate } = {}) => {
  const filter = buildDateFilter(startDate, endDate, 'scheduledDate');
  filter.agent_id = new mongoose.Types.ObjectId(ngoId);
  return filter;
};

// ─────────────────────────────────────────────────────────────────────────────
// Summary helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Headline summary for the opportunities report (opportunities the NGO created). */
const getOpportunitiesSummary = async (ngoId, { startDate, endDate } = {}) => {
  const filter = buildOppFilter(ngoId, { startDate, endDate });

  const [facet] = await Opportunity.aggregate([
    { $match: filter },
    {
      $facet: {
        total:      [{ $count: 'count' }],
        open:       [{ $match: { status: 'open' } },        { $count: 'count' }],
        inProgress: [{ $match: { status: 'in-progress' } }, { $count: 'count' }],
        closed:     [{ $match: { status: 'closed' } },      { $count: 'count' }],
      },
    },
  ]);

  const ex = (arr) => arr?.[0]?.count || 0;
  return {
    totalOpportunities: ex(facet.total),
    open:               ex(facet.open),
    inProgress:         ex(facet.inProgress),
    closed:             ex(facet.closed),
  };
};

/** Headline summary for the applications report (received on the NGO's opportunities). */
const getApplicationsSummary = async (ngoId, { startDate, endDate } = {}) => {
  const filter = await buildAppFilter(ngoId, { startDate, endDate });

  const [facet] = await Application.aggregate([
    { $match: filter },
    {
      $facet: {
        total:    [{ $count: 'count' }],
        pending:  [{ $match: { status: 'pending' } },  { $count: 'count' }],
        accepted: [{ $match: { status: 'accepted' } }, { $count: 'count' }],
        rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }],
      },
    },
  ]);

  const ex = (arr) => arr?.[0]?.count || 0;
  return {
    totalApplications: ex(facet.total),
    pending:           ex(facet.pending),
    accepted:          ex(facet.accepted),
    rejected:          ex(facet.rejected),
  };
};

/** Headline summary for the pickups report (pickups assigned to the NGO). */
const getPickupsSummary = async (ngoId, { startDate, endDate } = {}) => {
  const filter = buildPickupFilter(ngoId, { startDate, endDate });

  const [facet] = await Pickup.aggregate([
    { $match: filter },
    {
      $facet: {
        total:     [{ $count: 'count' }],
        assigned:  [{ $match: { status: 'Assigned' } },  { $count: 'count' }],
        completed: [{ $match: { status: 'Completed' } }, { $count: 'count' }],
        cancelled: [{ $match: { status: 'Cancelled' } }, { $count: 'count' }],
        missed:    [{ $match: { status: 'Missed' } },    { $count: 'count' }],
      },
    },
  ]);

  const ex = (arr) => arr?.[0]?.count || 0;
  return {
    totalPickups: ex(facet.total),
    assigned:     ex(facet.assigned),
    completed:    ex(facet.completed),
    cancelled:    ex(facet.cancelled),
    missed:       ex(facet.missed),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Browse (paginated JSON preview)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paginated preview of opportunities the NGO personally created.
 *
 * @param {string} ngoId
 * @param {{ page?, limit?, startDate?, endDate? }} opts
 * @returns {Promise<object>}
 */
const browseOpportunities = async (ngoId, { page = 1, limit = 20, startDate, endDate } = {}) => {
  const filter = buildOppFilter(ngoId, { startDate, endDate });
  const skip   = (Number(page) - 1) * Number(limit);

  const [records, total] = await Promise.all([
    Opportunity.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Opportunity.countDocuments(filter),
  ]);

  const summary = await getOpportunitiesSummary(ngoId, { startDate, endDate });

  return {
    records,
    total,
    page:       Number(page),
    limit:      Number(limit),
    totalPages: Math.ceil(total / Number(limit)) || 1,
    summary,
  };
};

/**
 * Paginated preview of applications received against the NGO's own
 * opportunities, enriched with the linked opportunity's title/location/date
 * and the applying volunteer's username.
 *
 * @param {string} ngoId
 * @param {{ page?, limit?, startDate?, endDate? }} opts
 * @returns {Promise<object>}
 */
const browseApplications = async (ngoId, { page = 1, limit = 20, startDate, endDate } = {}) => {
  const filter = await buildAppFilter(ngoId, { startDate, endDate });
  const skip   = (Number(page) - 1) * Number(limit);

  const [records, countResult] = await Promise.all([
    Application.aggregate([
      { $match: filter },
      { $sort:  { createdAt: -1 } },
      { $skip:  skip },
      { $limit: Number(limit) },
      {
        $lookup: {
          from:         'opportunities',
          localField:   'opportunity_id',
          foreignField: '_id',
          as:           '_opp',
          pipeline:     [{ $project: { title: 1, location: 1, date: 1 } }],
        },
      },
      {
        $lookup: {
          from:         'users',
          localField:   'volunteer_id',
          foreignField: '_id',
          as:           '_volunteerUser',
          pipeline:     [{ $project: { username: 1 } }],
        },
      },
      {
        $addFields: {
          opportunity_title:    { $ifNull: [{ $arrayElemAt: ['$_opp.title',    0] }, ''] },
          opportunity_location: { $ifNull: [{ $arrayElemAt: ['$_opp.location', 0] }, ''] },
          opportunity_date:     { $ifNull: [{ $arrayElemAt: ['$_opp.date',     0] }, null] },
          volunteer_username:   { $ifNull: [{ $arrayElemAt: ['$_volunteerUser.username', 0] }, ''] },
        },
      },
      { $project: { _opp: 0, _volunteerUser: 0, __v: 0 } },
    ]),
    Application.aggregate([
      { $match: filter },
      { $count: 'total' },
    ]),
  ]);

  const total = countResult?.[0]?.total || 0;

  const summary = await getApplicationsSummary(ngoId, { startDate, endDate });

  return {
    records,
    total,
    page:       Number(page),
    limit:      Number(limit),
    totalPages: Math.ceil(total / Number(limit)) || 1,
    summary,
  };
};

/**
 * Paginated preview of pickups assigned to the NGO, enriched with the
 * requesting volunteer's username.
 *
 * @param {string} ngoId
 * @param {{ page?, limit?, startDate?, endDate? }} opts
 * @returns {Promise<object>}
 */
const browsePickups = async (ngoId, { page = 1, limit = 20, startDate, endDate } = {}) => {
  const filter = buildPickupFilter(ngoId, { startDate, endDate });
  const skip   = (Number(page) - 1) * Number(limit);

  const [records, countResult] = await Promise.all([
    Pickup.aggregate([
      { $match: filter },
      { $sort:  { scheduledDate: -1 } },
      { $skip:  skip },
      { $limit: Number(limit) },
      {
        $lookup: {
          from:         'users',
          localField:   'user_id',
          foreignField: '_id',
          as:           '_volunteerUser',
          pipeline:     [{ $project: { username: 1 } }],
        },
      },
      {
        $addFields: {
          volunteer_username: { $ifNull: [{ $arrayElemAt: ['$_volunteerUser.username', 0] }, ''] },
        },
      },
      { $project: { _volunteerUser: 0, __v: 0 } },
    ]),
    Pickup.aggregate([
      { $match: filter },
      { $count: 'total' },
    ]),
  ]);

  const total = countResult?.[0]?.total || 0;

  const summary = await getPickupsSummary(ngoId, { startDate, endDate });

  return {
    records,
    total,
    page:       Number(page),
    limit:      Number(limit),
    totalPages: Math.ceil(total / Number(limit)) || 1,
    summary,
  };
};

/**
 * Unified browse dispatcher.
 *
 * @param {string} reportType  'opportunities' | 'applications' | 'pickups'
 * @param {string} ngoId
 * @param {object} opts
 * @returns {Promise<object>}
 */
const browseNgoReport = async (reportType, ngoId, opts = {}) => {
  switch (reportType) {
    case 'opportunities':
      return browseOpportunities(ngoId, opts);
    case 'applications':
      return browseApplications(ngoId, opts);
    case 'pickups':
      return browsePickups(ngoId, opts);
    default:
      throw new ReportError(
        `Unknown report type "${reportType}". Must be one of: ${NGO_REPORT_TYPES.join(', ')}.`,
        400,
      );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Download — streaming cursors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a streaming Aggregation cursor for the given NGO report type.
 * Mirrors the admin getCursorForReport but always scoped to one NGO.
 *
 * @param {string} reportType
 * @param {string} ngoId
 * @param {{ startDate?, endDate? }} opts
 * @returns {Promise<import('mongoose').Cursor>}
 */
const getNgoCursor = async (reportType, ngoId, { startDate, endDate } = {}) => {
  switch (reportType) {
    case 'opportunities': {
      const filter = buildOppFilter(ngoId, { startDate, endDate });
      return Opportunity.find(filter).sort({ createdAt: -1 }).lean().cursor();
    }

    case 'applications': {
      const filter = await buildAppFilter(ngoId, { startDate, endDate });
      return Application.aggregate([
        { $match: filter },
        { $sort:  { createdAt: -1 } },
        {
          $lookup: {
            from:         'opportunities',
            localField:   'opportunity_id',
            foreignField: '_id',
            as:           '_opp',
            pipeline:     [{ $project: { title: 1, location: 1, date: 1 } }],
          },
        },
        {
          $lookup: {
            from:         'users',
            localField:   'volunteer_id',
            foreignField: '_id',
            as:           '_volunteerUser',
            pipeline:     [{ $project: { username: 1 } }],
          },
        },
        {
          $addFields: {
            opportunity_title:    { $ifNull: [{ $arrayElemAt: ['$_opp.title',    0] }, ''] },
            opportunity_location: { $ifNull: [{ $arrayElemAt: ['$_opp.location', 0] }, ''] },
            opportunity_date:     { $ifNull: [{ $arrayElemAt: ['$_opp.date',     0] }, null] },
            volunteer_username:   { $ifNull: [{ $arrayElemAt: ['$_volunteerUser.username', 0] }, ''] },
          },
        },
        { $project: { _opp: 0, _volunteerUser: 0, __v: 0 } },
      ]).cursor();
    }

    case 'pickups': {
      const filter = buildPickupFilter(ngoId, { startDate, endDate });
      return Pickup.aggregate([
        { $match: filter },
        { $sort:  { scheduledDate: -1 } },
        {
          $lookup: {
            from:         'users',
            localField:   'user_id',
            foreignField: '_id',
            as:           '_volunteerUser',
            pipeline:     [{ $project: { username: 1 } }],
          },
        },
        {
          $addFields: {
            volunteer_username: { $ifNull: [{ $arrayElemAt: ['$_volunteerUser.username', 0] }, ''] },
          },
        },
        { $project: { _volunteerUser: 0, __v: 0 } },
      ]).cursor();
    }

    default:
      throw new ReportError(`Unknown NGO report type: ${reportType}`, 400);
  }
};

/** Flatten a summary into [label, value] rows for CSV/XLSX/PDF footers. */
const summaryToRows = (reportType, summary) => {
  if (!summary) return [];
  switch (reportType) {
    case 'opportunities':
      return [
        ['Total Opportunities', summary.totalOpportunities],
        ['Open',                summary.open],
        ['In Progress',         summary.inProgress],
        ['Closed',              summary.closed],
      ];
    case 'applications':
      return [
        ['Total Applications', summary.totalApplications],
        ['Pending',            summary.pending],
        ['Accepted',           summary.accepted],
        ['Rejected',           summary.rejected],
      ];
    case 'pickups':
      return [
        ['Total Pickups', summary.totalPickups],
        ['Assigned',      summary.assigned],
        ['Completed',     summary.completed],
        ['Cancelled',     summary.cancelled],
        ['Missed',        summary.missed],
      ];
    default:
      return [];
  }
};

const REPORT_TITLES = {
  opportunities: 'My Opportunities Report',
  applications:  'Applications Received',
  pickups:       'Assigned Pickups Report',
};

const FILENAME_LABELS = {
  opportunities: 'ngo-opportunities',
  applications:  'ngo-applications',
  pickups:       'ngo-pickups',
};

const makeFilename = (reportType, format) => {
  const date  = new Date().toISOString().split('T')[0];
  const ext   = format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
  const label = FILENAME_LABELS[reportType] || reportType;
  return `${label}_${date}.${ext}`;
};

/**
 * Generate and stream an NGO report to the HTTP response.
 *
 * @param {object} opts
 * @param {string}                         opts.reportType    'opportunities' | 'applications' | 'pickups'
 * @param {string}                         opts.format        'csv' | 'xlsx' | 'pdf'
 * @param {string}                         opts.ngoId         ObjectId string
 * @param {string}                         [opts.startDate]
 * @param {string}                         [opts.endDate]
 * @param {import('express').Response}     opts.res
 * @param {string}                         [opts.generatedBy] NGO name/email for PDF header
 * @returns {Promise<void>}
 */
const generateNgoReport = async ({
  reportType, format, ngoId,
  startDate, endDate,
  res, generatedBy,
}) => {
  const columns = NGO_REPORT_COLUMNS[reportType];
  if (!columns) throw new ReportError(`Unknown NGO report type: ${reportType}`, 400);

  const cursor   = await getNgoCursor(reportType, ngoId, { startDate, endDate });
  const filename = makeFilename(reportType, format);

  // Compute summary with the same scoping filters as the cursor
  let summary;
  if (reportType === 'opportunities') {
    summary = await getOpportunitiesSummary(ngoId, { startDate, endDate });
  } else if (reportType === 'applications') {
    summary = await getApplicationsSummary(ngoId, { startDate, endDate });
  } else {
    summary = await getPickupsSummary(ngoId, { startDate, endDate });
  }
  const summaryRows = summaryToRows(reportType, summary);

  const dateRange  = startDate || endDate
    ? `${startDate || 'start'} → ${endDate || 'now'}`
    : 'All time';
  const reportTitle = REPORT_TITLES[reportType] || 'NGO Report';

  switch (format) {
    case 'csv':
      return streamCSV({
        cursor,
        res,
        filename,
        columns:   columns.map((c) => ({ header: c.header, key: c.key, format: c.format })),
        transform: transformDoc,
        summaryRows,
      });

    case 'xlsx':
      return streamXLSX({
        cursor,
        res,
        filename,
        sheetName:   reportTitle,
        reportTitle: `${reportTitle}  |  ${dateRange}`,
        columns:     columns.map((c) => ({ header: c.header, key: c.key, width: c.width, format: c.format })),
        transform:   transformDoc,
        summaryRows,
      });

    case 'pdf':
      return streamPDF({
        cursor,
        res,
        filename,
        reportTitle,
        dateRange,
        generatedBy,
        columns: columns.map((c) => ({
          header: c.header,
          key:    c.key,
          width:  c.pdfWidth,
          format: c.format,
        })),
        transform: transformDoc,
        summaryRows,
      });

    default:
      throw new ReportError(`Unsupported format: ${format}`, 400);
  }
};

module.exports = {
  NGO_REPORT_COLUMNS,
  NGO_REPORT_TYPES,
  browseNgoReport,
  generateNgoReport,
  getOpportunitiesSummary,
  getApplicationsSummary,
  getPickupsSummary,
  ReportError,
};
