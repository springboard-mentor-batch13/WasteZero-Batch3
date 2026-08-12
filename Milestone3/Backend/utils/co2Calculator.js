// Backend/utils/co2Calculator.js
//
// CO₂ savings calculator for recycled waste.
//
// PURPOSE:
//   Given a waste category and weight (kg), returns the equivalent kg of CO₂
//   emissions avoided by recycling instead of sending to landfill/incineration.
//
// FACTORS (kg CO₂ saved per kg of material recycled):
//   Source: WRAP (Waste & Resources Action Programme) recycling carbon metrics,
//           EPA Waste Reduction Model (WARM), and IPCC emission factor databases.
//
// USAGE:
//   const { calculateCO2Saved, CO2_FACTORS } = require('./co2Calculator');
//   const saved = calculateCO2Saved('Plastic', 10); // → 1.84 kg CO₂
//
// NOTE: These are conservative baseline factors appropriate for a waste-management
// SaaS context. They may be updated as better regional data becomes available.

const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');

// ─────────────────────────────────────────────────────────────────────────────
// CO₂ emission factor table (kg CO₂ saved per kg material recycled)
// ─────────────────────────────────────────────────────────────────────────────
const CO2_FACTORS = {
  Plastic:  1.84,  // HDPE/PET recycling vs. virgin plastic production
  Paper:    1.06,  // Paper recycling vs. virgin paper (deforestation avoided)
  Glass:    0.31,  // Glass cullet reuse vs. raw material extraction
  'E-Waste': 4.50, // Circuit board metal recovery — highest CO₂ avoidance
  Organic:  0.85,  // Composting vs. landfill methane emissions avoided
};

// Sanity check: all allowed waste types must have a factor
const _missing = ALLOWED_WASTE_TYPES.filter((t) => !(t in CO2_FACTORS));
if (_missing.length > 0) {
  console.warn(
    `[co2Calculator] WARNING: Missing CO₂ factor for categories: ${_missing.join(', ')}. Using 0.`
  );
}

/**
 * Calculate kg CO₂ saved by recycling a given weight of a specific waste category.
 *
 * @param {string} category  - Waste category (must be in ALLOWED_WASTE_TYPES)
 * @param {number} weightKg  - Weight in kilograms (must be > 0)
 * @returns {number}         - CO₂ saved in kilograms (rounded to 4 decimal places)
 *
 * @example
 *   calculateCO2Saved('Plastic', 10)   → 18.4
 *   calculateCO2Saved('E-Waste', 2.5)  → 11.25
 *   calculateCO2Saved('Unknown', 5)    → 0
 */
const calculateCO2Saved = (category, weightKg) => {
  if (!category || typeof weightKg !== 'number' || weightKg <= 0) {
    return 0;
  }

  const factor = CO2_FACTORS[category];
  if (factor === undefined) {
    console.warn(`[co2Calculator] No CO₂ factor for category: "${category}". Returning 0.`);
    return 0;
  }

  // Round to 4 decimal places to avoid floating-point noise in DB documents
  return Math.round(factor * weightKg * 10000) / 10000;
};

/**
 * Estimate total CO₂ saved for multiple waste categories in a single pickup.
 * Useful when a pickup records weight per category.
 *
 * @param {Array<{ category: string, weight: number }>} items
 * @returns {number} Total CO₂ saved in kg
 */
const calculateTotalCO2 = (items) => {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, item) => {
    return acc + calculateCO2Saved(item.category, item.weight);
  }, 0);
};

/**
 * Get the CO₂ factor for a given category.
 * Returns 0 for unknown categories (never throws).
 *
 * @param {string} category
 * @returns {number}
 */
const getFactorForCategory = (category) => CO2_FACTORS[category] || 0;

/**
 * Returns all categories and their factors — useful for documentation
 * endpoints or admin configuration views.
 *
 * @returns {Object.<string, number>}
 */
const getAllFactors = () => ({ ...CO2_FACTORS });

module.exports = {
  CO2_FACTORS,
  calculateCO2Saved,
  calculateTotalCO2,
  getFactorForCategory,
  getAllFactors,
};
