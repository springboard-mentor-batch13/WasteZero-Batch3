// Backend/utils/profileCompleteness.js

const hasLocation = (user) =>
  Boolean(user?.locations?.primary?.city?.trim()) ||
  Boolean(
    Array.isArray(user?.locations?.secondary) &&
      user.locations.secondary.some((loc) => loc?.city?.trim())
  );

const hasNonEmptyArray = (value) => Array.isArray(value) && value.length > 0;

/**
 * @param {object} user - a User document or lean object (must have `role`)
 * @returns {{ complete: boolean, missing: string[] }}
 *   missing lists the human-readable field name(s) still needed, e.g.
 *   ['skills', 'location'] — empty when complete is true.
 */
const checkProfileCompleteness = (user) => {
  if (user?.role === 'volunteer') {
    const missing = [];
    if (!hasNonEmptyArray(user.skills)) missing.push('skills');
    if (!hasLocation(user)) missing.push('location');
    return { complete: missing.length === 0, missing };
  }

  if (user?.role === 'ngo') {
    const missing = [];
    if (!hasNonEmptyArray(user.wasteTypes)) missing.push('wasteTypes');
    if (!hasLocation(user)) missing.push('location');
    return { complete: missing.length === 0, missing };
  }

  // Admin (and any other role): not part of the matching system, so
  // profile completeness for matching purposes is not applicable.
  return { complete: true, missing: [] };
};

module.exports = { checkProfileCompleteness };
