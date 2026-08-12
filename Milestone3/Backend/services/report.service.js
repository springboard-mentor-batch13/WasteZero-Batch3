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
const AdminLog    = require('../models/admin-log.model');

const { streamCSV  } = require('../utils/csvExporter');
const { streamXLSX } = require('../utils/excelExporter');
const { streamPDF  } = require('../utils/pdfExporter');

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
  ['_id', 'user_id', 'agent_id', 'ngo_id', 'admin_id', 'target_id', 'removedBy'].forEach((f) => {
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
const getCursorForReport = (reportType, { startDate, endDate }) => {
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
      return Pickup.find(filter)
        .sort({ scheduledDate: -1 })
        .lean()
        .cursor();
    }
    case 'opportunities': {
      const filter = buildDateFilter(startDate, endDate, 'createdAt');
      return Opportunity.find(filter)
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
      throw new Error(`Unknown report type: ${reportType}`);
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
 * @param {string}                         opts.reportType  - 'users' | 'pickups' | 'opportunities' | 'full-activity'
 * @param {string}                         opts.format      - 'csv' | 'xlsx' | 'pdf'
 * @param {string}                         [opts.startDate]
 * @param {string}                         [opts.endDate]
 * @param {import('express').Response}     opts.res
 * @param {string}                         [opts.generatedBy]  - Admin name/email for PDF header
 * @returns {Promise<void>}
 */
const generateReport = async ({ reportType, format, startDate, endDate, res, generatedBy }) => {
  const columns    = REPORT_COLUMNS[reportType];
  if (!columns) throw new Error(`No column definition for report type: ${reportType}`);

  const cursor   = getCursorForReport(reportType, { startDate, endDate });
  const filename = generateFilename(reportType, format);

  const dateRange = startDate || endDate
    ? `${startDate || 'start'} → ${endDate || 'now'}`
    : 'All time';

  const reportTitle = {
    users:            'Users Report',
    pickups:          'Pickups Report',
    opportunities:    'Opportunities Report',
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
      throw new Error(`Unsupported format: ${format}`);
  }
};

module.exports = {
  generateReport,
  REPORT_COLUMNS,
  getCursorForReport,
  buildDateFilter,
};
