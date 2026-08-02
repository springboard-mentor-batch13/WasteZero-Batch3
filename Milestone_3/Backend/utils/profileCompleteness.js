// Backend/utils/profileCompleteness.js
//
// Single source of truth for "does this user have enough profile data to
// participate in matching?" — used by:
//   - users.controllers.js#updateUserProfile: blocks saving an incomplete
//     profile for a role that requires these fields.
//   - match.controller.js#getMatchSuggestions: blocks a volunteer from
//     pulling opportunity matches until skills + location are set.
//   - pickup.controllers.js#getAvailablePickups: blocks an NGO from pulling
//     the pickup discovery feed until wasteTypes + location are set.
//
// Kept in one place so the definition of "complete" can never drift between
// the write-time gate and the read-time gates.

/**
 * True if the user has at least one usable location signal — either the
 * structured locations.primary.city, or a structured secondary city.
 */
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
