// Backend/services/volunteerReport.service.js
//
// Report service for volunteer-facing report endpoints.
//
// All data returned by this service is ALWAYS scoped to the requesting
// volunteer's own records — a volunteer can never see another user's data.
//
// SUPPORTED REPORT TYPES:
//   'applications'  — the volunteer's own application history (+ opportunity details)
//   'opportunities' — opportunities the volunteer has applied to
//
// SUPPORTED FORMATS (download only): csv, xlsx, pdf
//
// STREAMING CONTRACT (same as admin report.service.js):
//   Download paths NEVER load the entire dataset into memory.
//   They use Mongoose/Aggregation cursors piped to HTTP response.

const mongoose    = require('mongoose');
const Application = require('../models/application.model');
const Opportunity = require('../models/opportunity.model');
const Pickup      = require('../models/pickup.model');

const { streamCSV  } = require('../utils/csvExporter');
const { streamXLSX } = require('../utils/excelExporter');
const { streamPDF  } = require('../utils/pdfExporter');

// Re-use ReportError and buildDateFilter from the shared report service so
// the controller gets the same error shape and the volunteer service does
// NOT duplicate date-range logic.
const { ReportError, buildDateFilter, transformDoc } = require('./report.service');

// ─────────────────────────────────────────────────────────────────────────────
// Column definitions (used by browse JSON, CSV, XLSX, PDF)
// ─────────────────────────────────────────────────────────────────────────────

const VOLUNTEER_REPORT_COLUMNS = {
  applications: [
    { header: 'Application ID',       key: '_id',                   width: 28, pdfWidth: 110 },
    { header: 'Opportunity Title',     key: 'opportunity_title',     width: 35, pdfWidth: 170 },
    { header: 'Opportunity Location',  key: 'opportunity_location',  width: 22, pdfWidth: 110 },
    { header: 'Event Date',            key: 'opportunity_date',      width: 18, pdfWidth: 85, format: 'date' },
    { header: 'Application Status',   key: 'status',                width: 16, pdfWidth: 80  },
    { header: 'Applied On',           key: 'createdAt',             width: 20, pdfWidth: 95, format: 'date' },
    { header: 'Last Updated',         key: 'updatedAt',             width: 20, pdfWidth: 95, format: 'date' },
  ],

  opportunities: [
    { header: 'Opportunity ID',        key: '_id',                   width: 28, pdfWidth: 110 },
    { header: 'Title',                 key: 'title',                 width: 32, pdfWidth: 160 },
    { header: 'Location',              key: 'location',              width: 22, pdfWidth: 110 },
    { header: 'Duration',              key: 'duration',              width: 15, pdfWidth: 75  },
    { header: 'Opportunity Status',    key: 'status',                width: 16, pdfWidth: 80  },
    { header: 'Event Date',            key: 'date',                  width: 18, pdfWidth: 85, format: 'date' },
    { header: 'My Application Status', key: 'my_application_status', width: 18, pdfWidth: 90  },
    { header: 'Applied On',            key: 'my_applied_on',         width: 20, pdfWidth: 95, format: 'date' },
  ],

  // Pickups the volunteer has created. agent_username is populated via
  // $lookup so the volunteer can see which NGO (if any) picked it up.
  pickups: [
    { header: 'Pickup ID',      key: '_id',                      width: 28, pdfWidth: 110 },
    { header: 'City',           key: 'address.city',             width: 18, pdfWidth: 90  },
    { header: 'Area',           key: 'address.area',             width: 18, pdfWidth: 90  },
    { header: 'Scheduled',      key: 'scheduledDate',            width: 20, pdfWidth: 90, format: 'date' },
    { header: 'Time Slot',      key: 'preferredTimeSlot.start',  width: 15, pdfWidth: 70  },
    { header: 'Waste Types',    key: 'wasteTypes',               width: 30, pdfWidth: 130, format: 'array' },
    { header: 'Status',         key: 'status',                   width: 14, pdfWidth: 70  },
    { header: 'Assigned NGO',   key: 'agent_username',           width: 22, pdfWidth: 110 },
    { header: 'Completed At',   key: 'completedAt',              width: 20, pdfWidth: 90, format: 'date' },
    { header: 'Created',        key: 'createdAt',                width: 20, pdfWidth: 90, format: 'date' },
  ],
};

const VOLUNTEER_REPORT_TYPES = Object.keys(VOLUNTEER_REPORT_COLUMNS);

// ─────────────────────────────────────────────────────────────────────────────
// Summary helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Headline summary for the applications report.
 *
 * @param {string} volunteerId
 * @param {{ startDate?, endDate? }} opts
 * @returns {Promise<object>}
 */
const getApplicationsSummary = async (volunteerId, { startDate, endDate } = {}) => {
  const filter = buildDateFilter(startDate, endDate, 'createdAt');
  filter.volunteer_id = new mongoose.Types.ObjectId(volunteerId);

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

/**
 * Headline summary for the opportunities report (scoped via volunteer's applications).
 *
 * @param {string} volunteerId
 * @param {{ startDate?, endDate? }} opts   date range applied to application.createdAt
 * @returns {Promise<object>}
 */
const getOpportunitiesSummary = async (volunteerId, { startDate, endDate } = {}) => {
  const appFilter = buildAppFilter(volunteerId, { startDate, endDate });

  const [facet] = await Application.aggregate([
    { $match: appFilter },
    {
      $lookup: {
        from:         'opportunities',
        localField:   'opportunity_id',
        foreignField: '_id',
        as:           '_opp',
        pipeline:     [{ $project: { status: 1 } }],
      },
    },
    { $unwind: '$_opp' },
    {
      $facet: {
        total:      [{ $count: 'count' }],
        open:       [{ $match: { '_opp.status': 'open' }        }, { $count: 'count' }],
        inProgress: [{ $match: { '_opp.status': 'in-progress' } }, { $count: 'count' }],
        closed:     [{ $match: { '_opp.status': 'closed' }      }, { $count: 'count' }],
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

/**
 * Headline summary for the pickups report — pickups the volunteer created.
 * Date range is applied to `scheduledDate` (same field used by the admin
 * pickups report), not `createdAt`.
 *
 * @param {string} volunteerId
 * @param {{ startDate?, endDate? }} opts
 * @returns {Promise<object>}
 */
const getPickupsSummary = async (volunteerId, { startDate, endDate } = {}) => {
  const filter = buildPickupFilter(volunteerId, { startDate, endDate });

  const [facet] = await Pickup.aggregate([
    { $match: filter },
    {
      $facet: {
        total:     [{ $count: 'count' }],
        pending:   [{ $match: { status: 'Pending' } },   { $count: 'count' }],
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
    pending:      ex(facet.pending),
    assigned:     ex(facet.assigned),
    completed:    ex(facet.completed),
    cancelled:    ex(facet.cancelled),
    missed:       ex(facet.missed),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Filter builders
// ─────────────────────────────────────────────────────────────────────────────

/** Build the base match for Application queries scoped to one volunteer + date. */
const buildAppFilter = (volunteerId, { startDate, endDate } = {}) => {
  const filter = buildDateFilter(startDate, endDate, 'createdAt');
  filter.volunteer_id = new mongoose.Types.ObjectId(volunteerId);
  return filter;
};

/**
 * Build the base match for Pickup queries scoped to one volunteer + date.
 * `user_id` on the Pickup model is the volunteer who created the request —
 * this can never be overridden by any query parameter.
 */
const buildPickupFilter = (volunteerId, { startDate, endDate } = {}) => {
  const filter = buildDateFilter(startDate, endDate, 'scheduledDate');
  filter.user_id = new mongoose.Types.ObjectId(volunteerId);
  return filter;
};

// ─────────────────────────────────────────────────────────────────────────────
// Browse (paginated JSON preview)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paginated preview of the volunteer's applications, enriched with the
 * linked opportunity's title, location, and event date.
 *
 * @param {string} volunteerId
 * @param {{ page?, limit?, startDate?, endDate? }} opts
 * @returns {Promise<object>}
 */
const browseApplications = async (volunteerId, { page = 1, limit = 20, startDate, endDate } = {}) => {
  const filter = buildAppFilter(volunteerId, { startDate, endDate });
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
        $addFields: {
          opportunity_title:    { $ifNull: [{ $arrayElemAt: ['$_opp.title',    0] }, ''] },
          opportunity_location: { $ifNull: [{ $arrayElemAt: ['$_opp.location', 0] }, ''] },
          opportunity_date:     { $ifNull: [{ $arrayElemAt: ['$_opp.date',     0] }, null] },
        },
      },
      { $project: { _opp: 0, __v: 0 } },
    ]),
    Application.aggregate([
      { $match: filter },
      { $count: 'total' },
    ]),
  ]);

  const total = countResult?.[0]?.total || 0;

  const summary = await getApplicationsSummary(volunteerId, { startDate, endDate });

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
 * Paginated preview of opportunities the volunteer has applied to.
 * The date range is applied to the application's `createdAt` (i.e. when the
 * volunteer applied), not the opportunity's creation date.
 *
 * @param {string} volunteerId
 * @param {{ page?, limit?, startDate?, endDate? }} opts
 * @returns {Promise<object>}
 */
const browseOpportunities = async (volunteerId, { page = 1, limit = 20, startDate, endDate } = {}) => {
  const filter = buildAppFilter(volunteerId, { startDate, endDate });
  const skip   = (Number(page) - 1) * Number(limit);

  // Base pipeline: match applications → join opportunity → project flat doc
  const basePipeline = [
    { $match: filter },
    {
      $lookup: {
        from:         'opportunities',
        localField:   'opportunity_id',
        foreignField: '_id',
        as:           '_opp',
      },
    },
    { $unwind: '$_opp' },
    {
      $project: {
        _id:                   '$_opp._id',
        title:                 '$_opp.title',
        location:              '$_opp.location',
        duration:              '$_opp.duration',
        status:                '$_opp.status',
        date:                  '$_opp.date',
        my_application_status: '$status',
        my_applied_on:         '$createdAt',
      },
    },
    { $sort: { my_applied_on: -1 } },
  ];

  const [records, countResult] = await Promise.all([
    Application.aggregate([...basePipeline, { $skip: skip }, { $limit: Number(limit) }]),
    Application.aggregate([...basePipeline, { $count: 'total' }]),
  ]);

  const total = countResult?.[0]?.total || 0;

  const summary = await getOpportunitiesSummary(volunteerId, { startDate, endDate });

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
 * Paginated preview of pickups the volunteer has created, enriched with the
 * assigned NGO's username (if any) via $lookup.
 *
 * @param {string} volunteerId
 * @param {{ page?, limit?, startDate?, endDate? }} opts
 * @returns {Promise<object>}
 */
const browsePickups = async (volunteerId, { page = 1, limit = 20, startDate, endDate } = {}) => {
  const filter = buildPickupFilter(volunteerId, { startDate, endDate });
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
          localField:   'agent_id',
          foreignField: '_id',
          as:           '_agentUser',
          pipeline:     [{ $project: { username: 1 } }],
        },
      },
      {
        $addFields: {
          agent_username: { $ifNull: [{ $arrayElemAt: ['$_agentUser.username', 0] }, ''] },
        },
      },
      { $project: { _agentUser: 0, __v: 0 } },
    ]),
    Pickup.aggregate([
      { $match: filter },
      { $count: 'total' },
    ]),
  ]);

  const total = countResult?.[0]?.total || 0;

  const summary = await getPickupsSummary(volunteerId, { startDate, endDate });

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
 * @param {string} reportType  'applications' | 'opportunities' | 'pickups'
 * @param {string} volunteerId
 * @param {object} opts
 * @returns {Promise<object>}
 */
const browseVolunteerReport = async (reportType, volunteerId, opts = {}) => {
  switch (reportType) {
    case 'applications':
      return browseApplications(volunteerId, opts);
    case 'opportunities':
      return browseOpportunities(volunteerId, opts);
    case 'pickups':
      return browsePickups(volunteerId, opts);
    default:
      throw new ReportError(
        `Unknown report type "${reportType}". Must be one of: ${VOLUNTEER_REPORT_TYPES.join(', ')}.`,
        400,
      );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Download — streaming cursors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a streaming Aggregation cursor for the given volunteer report type.
 * Mirrors the admin getCursorForReport but always scoped to one volunteer.
 *
 * @param {string} reportType
 * @param {string} volunteerId
 * @param {{ startDate?, endDate? }} opts
 * @returns {import('mongoose').Cursor}
 */
const getVolunteerCursor = (reportType, volunteerId, { startDate, endDate } = {}) => {
  switch (reportType) {
    case 'applications': {
      const filter = buildAppFilter(volunteerId, { startDate, endDate });
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
          $addFields: {
            opportunity_title:    { $ifNull: [{ $arrayElemAt: ['$_opp.title',    0] }, ''] },
            opportunity_location: { $ifNull: [{ $arrayElemAt: ['$_opp.location', 0] }, ''] },
            opportunity_date:     { $ifNull: [{ $arrayElemAt: ['$_opp.date',     0] }, null] },
          },
        },
        { $project: { _opp: 0, __v: 0 } },
      ]).cursor();
    }

    case 'opportunities': {
      const filter = buildAppFilter(volunteerId, { startDate, endDate });
      return Application.aggregate([
        { $match: filter },
        {
          $lookup: {
            from:         'opportunities',
            localField:   'opportunity_id',
            foreignField: '_id',
            as:           '_opp',
          },
        },
        { $unwind: '$_opp' },
        {
          $project: {
            _id:                   '$_opp._id',
            title:                 '$_opp.title',
            location:              '$_opp.location',
            duration:              '$_opp.duration',
            status:                '$_opp.status',
            date:                  '$_opp.date',
            my_application_status: '$status',
            my_applied_on:         '$createdAt',
          },
        },
        { $sort: { my_applied_on: -1 } },
      ]).cursor();
    }

    case 'pickups': {
      const filter = buildPickupFilter(volunteerId, { startDate, endDate });
      return Pickup.aggregate([
        { $match: filter },
        { $sort:  { scheduledDate: -1 } },
        {
          $lookup: {
            from:         'users',
            localField:   'agent_id',
            foreignField: '_id',
            as:           '_agentUser',
            pipeline:     [{ $project: { username: 1 } }],
          },
        },
        {
          $addFields: {
            agent_username: { $ifNull: [{ $arrayElemAt: ['$_agentUser.username', 0] }, ''] },
          },
        },
        { $project: { _agentUser: 0, __v: 0 } },
      ]).cursor();
    }

    default:
      throw new ReportError(`Unknown volunteer report type: ${reportType}`, 400);
  }
};

/** Flatten a summary into [label, value] rows for CSV/XLSX/PDF footers. */
const summaryToRows = (reportType, summary) => {
  if (!summary) return [];
  switch (reportType) {
    case 'applications':
      return [
        ['Total Applications', summary.totalApplications],
        ['Pending',            summary.pending],
        ['Accepted',           summary.accepted],
        ['Rejected',           summary.rejected],
      ];
    case 'opportunities':
      return [
        ['Total Opportunities Applied', summary.totalOpportunities],
        ['Open',                        summary.open],
        ['In Progress',                 summary.inProgress],
        ['Closed',                      summary.closed],
      ];
    case 'pickups':
      return [
        ['Total Pickups', summary.totalPickups],
        ['Pending',       summary.pending],
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
  applications:  'My Applications Report',
  opportunities: 'My Applied Opportunities',
  pickups:       'My Pickup Requests',
};

const FILENAME_LABELS = {
  applications:  'my-applications',
  opportunities: 'my-opportunities',
  pickups:       'my-pickups',
};

const makeFilename = (reportType, format) => {
  const date  = new Date().toISOString().split('T')[0];
  const ext   = format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
  const label = FILENAME_LABELS[reportType] || reportType;
  return `${label}_${date}.${ext}`;
};

/**
 * Generate and stream a volunteer report to the HTTP response.
 *
 * @param {object} opts
 * @param {string}                         opts.reportType    'applications' | 'opportunities'
 * @param {string}                         opts.format        'csv' | 'xlsx' | 'pdf'
 * @param {string}                         opts.volunteerId   ObjectId string
 * @param {string}                         [opts.startDate]
 * @param {string}                         [opts.endDate]
 * @param {import('express').Response}     opts.res
 * @param {string}                         [opts.generatedBy] volunteer name/email for PDF header
 * @returns {Promise<void>}
 */
const generateVolunteerReport = async ({
  reportType, format, volunteerId,
  startDate, endDate,
  res, generatedBy,
}) => {
  const columns = VOLUNTEER_REPORT_COLUMNS[reportType];
  if (!columns) throw new ReportError(`Unknown volunteer report type: ${reportType}`, 400);

  const cursor   = getVolunteerCursor(reportType, volunteerId, { startDate, endDate });
  const filename = makeFilename(reportType, format);

  // Compute summary with the same scoping filters as the cursor
  let summary;
  if (reportType === 'applications') {
    summary = await getApplicationsSummary(volunteerId, { startDate, endDate });
  } else if (reportType === 'pickups') {
    summary = await getPickupsSummary(volunteerId, { startDate, endDate });
  } else {
    summary = await getOpportunitiesSummary(volunteerId, { startDate, endDate });
  }
  const summaryRows = summaryToRows(reportType, summary);

  const dateRange  = startDate || endDate
    ? `${startDate || 'start'} → ${endDate || 'now'}`
    : 'All time';
  const reportTitle = REPORT_TITLES[reportType] || 'Volunteer Report';

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
  VOLUNTEER_REPORT_COLUMNS,
  VOLUNTEER_REPORT_TYPES,
  browseVolunteerReport,
  generateVolunteerReport,
  getApplicationsSummary,
  getOpportunitiesSummary,
  getPickupsSummary,
  ReportError,
};
