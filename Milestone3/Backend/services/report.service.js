// Backend/services/report.service.js
//
// Report generation orchestrator.
// Streams data from MongoDB through format-specific exporters to HTTP response.
//
// STREAMING CONTRACT:
//   - NEVER load entire dataset into memory (no await Model.find().lean())
//   - Always use Mongoose cursor: Model.find(filter).lean().cursor()
//   - Each format-specific exporter pipes cursor → HTTP response
//
// SUPPORTED REPORT TYPES: users, pickups, opportunities, full-activity
// SUPPORTED FORMATS: csv, xlsx, pdf

const User        = require('../models/users.model');
const Pickup      = require('../models/pickup.model');
const Opportunity = require('../models/opportunity.model');
const Application = require('../models/application.model');
const AdminLog    = require('../models/admin-log.model');

const { streamCSV  } = require('../utils/csvExporter');
const { streamXLSX } = require('../utils/excelExporter');
const { streamPDF  } = require('../utils/pdfExporter');

// ─────────────────────────────────────────────────────────────────────────────
// ReportError — lets the controller return an accurate status code
// (400/404) instead of always falling back to 500 for user-caused errors
// like "no NGO with that username" or "unknown report type".
// ─────────────────────────────────────────────────────────────────────────────

class ReportError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ReportError';
    this.statusCode = statusCode;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Username → ID resolution
//
// Admins identify NGOs and volunteers by USERNAME everywhere in the report/
// browse endpoints — never by raw Mongo ObjectId. This is the single place
// that resolves a username to the ID actually used in queries.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a username to that user's ObjectId, optionally enforcing role.
 *
 * @param {string} username
 * @param {string} [expectedRole]  'ngo' | 'volunteer' — throws if the found
 *                                 user doesn't match (e.g. a volunteer's
 *                                 username used where an NGO is expected)
 * @returns {Promise<import('mongoose').Types.ObjectId>}
 * @throws {ReportError} 404 if no user has that username, 400 on role mismatch
 */
const resolveUserIdByUsername = async (username, expectedRole) => {
  const user = await User.findOne({ username: username.trim().toLowerCase() })
    .select('_id role')
    .lean();

  if (!user) {
    throw new ReportError(`No ${expectedRole || 'user'} found with username "${username}".`, 404);
  }
  if (expectedRole && user.role !== expectedRole) {
    throw new ReportError(`"${username}" is a ${user.role}, not a ${expectedRole}.`, 400);
  }
  return user._id;
};

// ─────────────────────────────────────────────────────────────────────────────
// Report column definitions (shared across CSV / XLSX / PDF)
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_COLUMNS = {
  users: [
    { header: 'ID',           key: '_id',              width: 28, pdfWidth: 150 },
    { header: 'Name',         key: 'name',             width: 25, pdfWidth: 120 },
    { header: 'Email',        key: 'email',            width: 35, pdfWidth: 170 },
    { header: 'Username',     key: 'username',         width: 20, pdfWidth: 110 },
    { header: 'Role',         key: 'role',             width: 15, pdfWidth: 65  },
    { header: 'Suspended',    key: 'isSuspended',      width: 12, pdfWidth: 65, format: 'bool-status' },
    { header: 'Suspension Reason', key: 'suspensionReason', width: 30, pdfWidth: 130 },
    { header: 'Verified',     key: 'isVerified',       width: 12, pdfWidth: 55, format: 'bool-yn' },
    { header: 'City',         key: 'locations.primary.city', width: 18, pdfWidth: 90 },
    { header: 'Registered',   key: 'createdAt',        width: 20, pdfWidth: 90, format: 'date' },
  ],

  pickups: [
    { header: 'ID',           key: '_id',              width: 28, pdfWidth: 130 },
    { header: 'User ID',      key: 'user_id',          width: 28, pdfWidth: 130 },
    { header: 'City',         key: 'address.city',     width: 18, pdfWidth: 90  },
    { header: 'Area',         key: 'address.area',     width: 18, pdfWidth: 90  },
    { header: 'Scheduled',    key: 'scheduledDate',    width: 20, pdfWidth: 90, format: 'date' },
    { header: 'Time Slot',    key: 'preferredTimeSlot.start', width: 15, pdfWidth: 70 },
    { header: 'Waste Types',  key: 'wasteTypes',       width: 30, pdfWidth: 130, format: 'array' },
    { header: 'Status',       key: 'status',           width: 14, pdfWidth: 70  },
    { header: 'Agent ID',     key: 'agent_id',         width: 28, pdfWidth: 130 },
    { header: 'Completed At', key: 'completedAt',      width: 20, pdfWidth: 90, format: 'date' },
    { header: 'Created',      key: 'createdAt',        width: 20, pdfWidth: 90, format: 'date' },
  ],

  opportunities: [
    { header: 'ID',           key: '_id',              width: 28, pdfWidth: 130 },
    { header: 'NGO ID',       key: 'ngo_id',           width: 28, pdfWidth: 130 },
    { header: 'Title',        key: 'title',            width: 30, pdfWidth: 150 },
    { header: 'Location',     key: 'location',         width: 20, pdfWidth: 100 },
    { header: 'Duration',     key: 'duration',         width: 15, pdfWidth: 75  },
    { header: 'Status',       key: 'status',           width: 14, pdfWidth: 65  },
    { header: 'Skills',       key: 'required_skills',  width: 30, pdfWidth: 140, format: 'array' },
    { header: 'Removed',      key: 'isRemovedByAdmin', width: 10, pdfWidth: 55, format: 'bool-yn' },
    { header: 'Removal Reason', key: 'removalReason',  width: 25, pdfWidth: 120 },
    { header: 'Event Date',   key: 'date',             width: 18, pdfWidth: 85, format: 'date' },
    { header: 'Created',      key: 'createdAt',        width: 18, pdfWidth: 85, format: 'date' },
  ],

  applications: [
    { header: 'ID',              key: '_id',              width: 28, pdfWidth: 130 },
    { header: 'Opportunity ID',  key: 'opportunity_id',   width: 28, pdfWidth: 130 },
    { header: 'Volunteer ID',    key: 'volunteer_id',     width: 28, pdfWidth: 130 },
    { header: 'Status',          key: 'status',           width: 14, pdfWidth: 70  },
    { header: 'Applied On',      key: 'createdAt',        width: 20, pdfWidth: 95, format: 'date' },
    { header: 'Last Updated',    key: 'updatedAt',        width: 20, pdfWidth: 95, format: 'date' },
  ],

  'full-activity': [
    { header: 'Log ID',       key: '_id',              width: 28, pdfWidth: 130 },
    { header: 'Admin ID',     key: 'admin_id',         width: 28, pdfWidth: 130 },
    { header: 'Action',       key: 'action',           width: 25, pdfWidth: 130 },
    { header: 'Target Type',  key: 'target_type',      width: 16, pdfWidth: 80  },
    { header: 'Target ID',    key: 'target_id',        width: 28, pdfWidth: 130 },
    { header: 'Details',      key: 'details',          width: 40, pdfWidth: 200 },
    { header: 'IP Address',   key: 'ip_address',       width: 18, pdfWidth: 90  },
    { header: 'Timestamp',    key: 'timestamp',        width: 22, pdfWidth: 105, format: 'datetime' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Cursor builders — enforce date filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a Mongoose date range filter object.
 *
 * @param {string} [startDate]  'YYYY-MM-DD'
 * @param {string} [endDate]    'YYYY-MM-DD'
 * @param {string} [dateField]  MongoDB field name
 * @returns {object}
 */
const buildDateFilter = (startDate, endDate, dateField = 'createdAt') => {
  const filter = {};
  if (startDate || endDate) {
    filter[dateField] = {};
    if (startDate) filter[dateField].$gte = new Date(startDate);
    if (endDate) {
      // Include entire end date (add 1 day)
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      filter[dateField].$lt = end;
    }
  }
  return filter;
};

/**
 * Transform a document before export:
 * - Stringify ObjectId fields so they export as readable strings
 * - Flatten nested objects that exporters can't handle natively
 *
 * @param {object} doc
 * @returns {object}
 */
const transformDoc = (doc) => {
  const clone = { ...doc };
  // Stringify ObjectId fields
  ['_id', 'user_id', 'agent_id', 'ngo_id', 'admin_id', 'target_id', 'removedBy', 'opportunity_id', 'volunteer_id'].forEach((f) => {
    if (clone[f]) clone[f] = clone[f].toString();
  });
  return clone;
};

/**
 * Get a typed MongoDB cursor for the given report type and date range.
 *
 * @param {string} reportType
 * @param {{ startDate, endDate }} opts
 * @returns {import('mongoose').QueryCursor}
 */
/**
 * Get a typed MongoDB cursor for the given report type, date range, and
 * optional scoping filters.
 *
 * Scoping filters (all optional, only relevant to certain types):
 *   - ngoId          — 'opportunities': only that NGO's opportunities
 *                       'applications': all applications across that NGO's opportunities
 *   - opportunityId  — 'applications': only applications for that one opportunity
 *   - volunteerId    — 'pickups': only that volunteer's pickup requests
 *
 * @param {string} reportType
 * @param {{ startDate, endDate, ngoId, opportunityId, volunteerId }} opts
 * @returns {Promise<import('mongoose').QueryCursor>}
 */
const getCursorForReport = async (reportType, { startDate, endDate, ngoId, opportunityId, volunteerId }) => {
  switch (reportType) {
    case 'users': {
      const filter = buildDateFilter(startDate, endDate, 'createdAt');
      return User.find(filter)
        .select('-password -__v')
        .sort({ createdAt: -1 })
        .lean()
        .cursor();
    }
    case 'pickups': {
      const filter = buildDateFilter(startDate, endDate, 'scheduledDate');
      // Scope to a single volunteer's pickup requests, if given. Pickup.user_id
      // is always the volunteer who created the request (never the NGO agent).
      if (volunteerId) filter.user_id = volunteerId;
      return Pickup.find(filter)
        .sort({ scheduledDate: -1 })
        .lean()
        .cursor();
    }
    case 'opportunities': {
      const filter = buildDateFilter(startDate, endDate, 'createdAt');
      // Scope to a single NGO's own opportunities, if given.
      if (ngoId) filter.ngo_id = ngoId;
      return Opportunity.find(filter)
        .sort({ createdAt: -1 })
        .lean()
        .cursor();
    }
    case 'applications': {
      const filter = buildDateFilter(startDate, endDate, 'createdAt');
      if (opportunityId) {
        // All applications for one specific opportunity.
        filter.opportunity_id = opportunityId;
      } else if (ngoId) {
        // All applications across every opportunity that NGO has created.
        const opportunityIds = await Opportunity.find({ ngo_id: ngoId }).distinct('_id');
        filter.opportunity_id = { $in: opportunityIds };
      } else {
        // Guarded in validations/report.validation.js, but double-check here
        // too — an unscoped applications dump is never the intended report.
        throw new ReportError('applications report requires opportunityId or ngoUsername.', 400);
      }
      return Application.find(filter)
        .sort({ createdAt: -1 })
        .lean()
        .cursor();
    }
    case 'full-activity': {
      const filter = buildDateFilter(startDate, endDate, 'timestamp');
      return AdminLog.find(filter)
        .sort({ timestamp: -1 })
        .lean()
        .cursor();
    }
    default:
      throw new ReportError(`Unknown report type: ${reportType}`, 400);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Report filename generator
// ─────────────────────────────────────────────────────────────────────────────

const generateFilename = (reportType, format) => {
  const date = new Date().toISOString().split('T')[0];
  const ext  = format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
  return `wastezero_${reportType}_report_${date}.${ext}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main stream function — dispatches to correct exporter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate and stream a report to the HTTP response.
 *
 * @param {object} opts
 * @param {string}                         opts.reportType  - 'users' | 'pickups' | 'opportunities' | 'applications' | 'full-activity'
 * @param {string}                         opts.format      - 'csv' | 'xlsx' | 'pdf'
 * @param {string}                         [opts.startDate]
 * @param {string}                         [opts.endDate]
 * @param {string}                         [opts.ngoUsername]       - scope 'opportunities' or 'applications' to one NGO
 * @param {string}                         [opts.opportunityId]     - scope 'applications' to one opportunity
 * @param {string}                         [opts.volunteerUsername] - scope 'pickups' to one volunteer
 * @param {import('express').Response}     opts.res
 * @param {string}                         [opts.generatedBy]  - Admin name/email for PDF header
 * @returns {Promise<void>}
 */
const generateReport = async ({
  reportType, format, startDate, endDate,
  ngoUsername, opportunityId, volunteerUsername,
  res, generatedBy,
}) => {
  const columns    = REPORT_COLUMNS[reportType];
  if (!columns) throw new ReportError(`No column definition for report type: ${reportType}`, 400);

  // Resolve usernames → IDs once, up front. Everything downstream (the
  // cursor builder) works with real IDs same as before.
  const ngoId       = ngoUsername       ? await resolveUserIdByUsername(ngoUsername, 'ngo')             : null;
  const volunteerId = volunteerUsername ? await resolveUserIdByUsername(volunteerUsername, 'volunteer')  : null;

  const cursor   = await getCursorForReport(reportType, { startDate, endDate, ngoId, opportunityId, volunteerId });
  const filename = generateFilename(reportType, format);

  const dateRange = startDate || endDate
    ? `${startDate || 'start'} → ${endDate || 'now'}`
    : 'All time';

  const reportTitle = {
    users:            'Users Report',
    pickups:          'Pickups Report',
    opportunities:    'Opportunities Report',
    applications:     'Applications Report',
    'full-activity':  'Full Platform Activity Report',
  }[reportType];

  switch (format) {
    case 'csv':
      return streamCSV({
        cursor,
        res,
        filename,
        columns: columns.map((c) => ({ header: c.header, key: c.key })),
        transform: transformDoc,
      });

    case 'xlsx':
      return streamXLSX({
        cursor,
        res,
        filename,
        sheetName:   reportTitle,
        reportTitle: `${reportTitle}  |  ${dateRange}`,
        columns:     columns.map((c) => ({ header: c.header, key: c.key, width: c.width })),
        transform:   transformDoc,
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
      });

    default:
      throw new ReportError(`Unsupported format: ${format}`, 400);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// "Browse before download" — powers the admin UI flow:
//   type NGO username → dropdown of their opportunities → click one →
//   paginated applications preview → download
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List every opportunity created by one NGO (identified by username), for
 * the admin's opportunity-picker dropdown. Lightweight — not the full
 * report shape, just enough to populate a dropdown and show context.
 *
 * @param {string} ngoUsername
 * @returns {Promise<{ ngo: object, opportunities: object[] }>}
 * @throws {ReportError} 404 if no NGO has that username
 */
const getOpportunitiesByNgoUsername = async (ngoUsername) => {
  const ngo = await User.findOne({ username: ngoUsername.trim().toLowerCase(), role: 'ngo' })
    .select('_id name username')
    .lean();

  if (!ngo) {
    throw new ReportError(`No NGO found with username "${ngoUsername}".`, 404);
  }

  const opportunities = await Opportunity.aggregate([
    { $match: { ngo_id: ngo._id } },
    {
      $lookup: {
        from: 'applications',
        localField: '_id',
        foreignField: 'opportunity_id',
        as: 'applications',
      },
    },
    {
      $project: {
        title: 1,
        status: 1,
        location: 1,
        date: 1,
        isRemovedByAdmin: 1,
        createdAt: 1,
        applicationsCount: { $size: '$applications' },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  return { ngo, opportunities };
};

/**
 * Paginated applications for one specific opportunity, with basic volunteer
 * info populated — for the admin's on-screen preview before downloading.
 *
 * @param {string} opportunityId
 * @param {{ page?: number, limit?: number }} opts
 * @returns {Promise<{ opportunity: object, applications: object[], total: number, page: number, limit: number, totalPages: number }>}
 * @throws {ReportError} 404 if the opportunity doesn't exist
 */
const getApplicationsForOpportunity = async (opportunityId, { page = 1, limit = 20 } = {}) => {
  const opportunity = await Opportunity.findById(opportunityId)
    .select('title ngo_id status location date')
    .populate('ngo_id', 'name username')
    .lean();

  if (!opportunity) {
    throw new ReportError('Opportunity not found.', 404);
  }

  const skip = (page - 1) * limit;

  const [applications, total] = await Promise.all([
    Application.find({ opportunity_id: opportunityId })
      .populate('volunteer_id', 'name username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Application.countDocuments({ opportunity_id: opportunityId }),
  ]);

  return {
    opportunity,
    applications,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Browse preview helpers — one per report type
// Powers the "preview before download" flow for all report types.
// Each returns a page of records + pagination metadata so the frontend
// can show a live table before the admin commits to a download.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paginated preview of users (all roles, or filtered by role).
 *
 * @param {{ page?, limit?, startDate?, endDate?, role? }} opts
 * @returns {Promise<{ records: object[], total: number, page: number, limit: number, totalPages: number }>}
 */
const browseUsers = async ({ page = 1, limit = 20, startDate, endDate, role } = {}) => {
  const filter = buildDateFilter(startDate, endDate, 'createdAt');
  if (role) filter.role = role;

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    User.find(filter)
      .select('-password -__v')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    User.countDocuments(filter),
  ]);

  return { records, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) || 1 };
};

/**
 * Paginated preview of pickups, optionally scoped to one volunteer.
 *
 * @param {{ page?, limit?, startDate?, endDate?, volunteerUsername? }} opts
 */
const browsePickups = async ({ page = 1, limit = 20, startDate, endDate, volunteerUsername } = {}) => {
  const filter = buildDateFilter(startDate, endDate, 'scheduledDate');

  if (volunteerUsername) {
    const volunteerId = await resolveUserIdByUsername(volunteerUsername, 'volunteer');
    filter.user_id = volunteerId;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    Pickup.find(filter)
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Pickup.countDocuments(filter),
  ]);

  return { records, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) || 1 };
};

/**
 * Paginated preview of opportunities, optionally scoped to one NGO.
 *
 * @param {{ page?, limit?, startDate?, endDate?, ngoUsername? }} opts
 */
const browseOpportunities = async ({ page = 1, limit = 20, startDate, endDate, ngoUsername } = {}) => {
  const filter = buildDateFilter(startDate, endDate, 'createdAt');

  if (ngoUsername) {
    const ngoId = await resolveUserIdByUsername(ngoUsername, 'ngo');
    filter.ngo_id = ngoId;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    Opportunity.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Opportunity.countDocuments(filter),
  ]);

  return { records, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) || 1 };
};

/**
 * Paginated preview of applications, scoped to one opportunity or all of an NGO's opportunities.
 * Requires either opportunityId or ngoUsername (same rule as the download endpoint).
 *
 * @param {{ page?, limit?, startDate?, endDate?, opportunityId?, ngoUsername? }} opts
 */
const browseApplications = async ({ page = 1, limit = 20, startDate, endDate, opportunityId, ngoUsername } = {}) => {
  const filter = buildDateFilter(startDate, endDate, 'createdAt');

  if (opportunityId) {
    filter.opportunity_id = opportunityId;
  } else if (ngoUsername) {
    const ngoId = await resolveUserIdByUsername(ngoUsername, 'ngo');
    const opportunityIds = await Opportunity.find({ ngo_id: ngoId }).distinct('_id');
    filter.opportunity_id = { $in: opportunityIds };
  } else {
    throw new ReportError('applications preview requires opportunityId or ngoUsername.', 400);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    Application.find(filter)
      .populate('volunteer_id', 'name username email')
      .populate('opportunity_id', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Application.countDocuments(filter),
  ]);

  return { records, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) || 1 };
};

/**
 * Paginated preview of the full admin activity log.
 *
 * @param {{ page?, limit?, startDate?, endDate? }} opts
 */
const browseFullActivity = async ({ page = 1, limit = 20, startDate, endDate } = {}) => {
  const filter = buildDateFilter(startDate, endDate, 'timestamp');

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    AdminLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    AdminLog.countDocuments(filter),
  ]);

  return { records, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) || 1 };
};

/**
 * Unified browse dispatcher — used by the generic browse controller.
 * Maps report type → preview function.
 *
 * @param {string} reportType
 * @param {object} opts
 */
const browseReport = async (reportType, opts = {}) => {
  switch (reportType) {
    case 'users':          return browseUsers(opts);
    case 'pickups':        return browsePickups(opts);
    case 'opportunities':  return browseOpportunities(opts);
    case 'applications':   return browseApplications(opts);
    case 'full-activity':  return browseFullActivity(opts);
    default:
      throw new ReportError(`Unknown report type: ${reportType}`, 400);
  }
};

module.exports = {
  generateReport,
  REPORT_COLUMNS,
  getCursorForReport,
  buildDateFilter,
  resolveUserIdByUsername,
  getOpportunitiesByNgoUsername,
  getApplicationsForOpportunity,
  browseReport,
  browseUsers,
  browsePickups,
  browseOpportunities,
  browseApplications,
  browseFullActivity,
  ReportError,
};
