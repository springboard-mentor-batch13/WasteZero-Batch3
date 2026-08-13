// Backend/constants/wasteTypes.js
//
// Single source of truth for waste category values used in:
//   - pickup.model.js  (schema enum)
//   - pickup.validation.js (request validation)
//   - wasteStats.model.js  (schema enum)
//   - analytics pipelines  (grouping keys)
//
// DO NOT add arbitrary values here — new categories require migration.

const ALLOWED_WASTE_TYPES = ['Plastic', 'Paper', 'Glass', 'E-Waste', 'Organic', 'Metal'];

module.exports = { ALLOWED_WASTE_TYPES };
