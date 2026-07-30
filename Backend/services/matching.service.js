// Backend/services/matching.service.js
//
// Matches volunteers to newly created Opportunities by Skills + geographic
// location, and dispatches an 'opportunity_match' notification (in-app +
// socket push, via notification.service.js) to every match, inviting them
// to apply.
//
// Trigger point: opportunity.controllers.js#createOpportunity calls
// notifyMatchedVolunteers() after a successful save (fire-and-forget — a
// matching/notification failure must never fail opportunity creation).
//
// Also matches NGOs to newly created Pickups by coverage city + wasteTypes
// (reusing pickup.service.js#isNgoEligibleForPickup), and dispatches a
// 'pickup_match' notification to every eligible NGO, inviting them to claim
// it.
//
// Trigger point: pickup.controllers.js#createPickup calls
// notifyMatchedNgos() after a successful save (fire-and-forget — same
// never-fail-the-create contract as the opportunity flow above).

const User = require('../models/users.model');
const Opportunity = require('../models/opportunity.model');
const notificationService = require('./notification.service');
// Reuse the single source of truth for "is this NGO eligible for this
// pickup" (city + wasteTypes overlap) — already used by the NGO discovery
// feed (getPickupsForNgo) and the single-resource claim guard
// (checkPickupNgoMatch). Matching rules must not drift between that pull
// flow and this push flow.
const { isNgoEligibleForPickup } = require('./pickup.service');

/**
 * @internal
 * Escape regex special characters before use in `new RegExp()`.
 * Same convention as opportunity.service.js / pickup.service.js.
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @internal
 * Collect every city/state term associated with a volunteer: their
 * structured locations.primary + locations.secondary[], plus a fallback to
 * the legacy free-text `location` field for volunteers who haven't migrated
 * to the structured field yet.
 */
const getVolunteerLocationTerms = (volunteer) => {
  const terms = new Set();

  const addLoc = (loc) => {
    if (loc?.city) terms.add(loc.city.trim());
    if (loc?.state) terms.add(loc.state.trim());
  };

  addLoc(volunteer?.locations?.primary);
  if (Array.isArray(volunteer?.locations?.secondary)) {
    volunteer.locations.secondary.forEach(addLoc);
  }

  if (typeof volunteer?.location === 'string' && volunteer.location.trim()) {
    terms.add(volunteer.location.trim());
  }

  return [...terms].filter(Boolean);
};

/**
 * @internal
 * Opportunity.location is a free-text field (e.g. "Bengaluru, Karnataka"),
 * not structured — so matching is done by checking whether that text
 * contains the volunteer's city or state as a whole-word, case-insensitive
 * match, rather than requiring an exact structured match on both sides.
 */
const locationMatches = (opportunityLocation, volunteer) => {
  if (typeof opportunityLocation !== 'string' || !opportunityLocation.trim()) return false;

  const terms = getVolunteerLocationTerms(volunteer);
  if (terms.length === 0) return false;

  return terms.some((term) =>
    new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(opportunityLocation)
  );
};

/**
 * @internal
 * True if at least one of the opportunity's required_skills overlaps with
 * the volunteer's skills (case-insensitive, whitespace-trimmed).
 */
const skillsMatch = (requiredSkills, volunteerSkills) => {
  if (!Array.isArray(requiredSkills) || requiredSkills.length === 0) return false;
  if (!Array.isArray(volunteerSkills) || volunteerSkills.length === 0) return false;

  const required = new Set(requiredSkills.map((s) => s.trim().toLowerCase()));
  return volunteerSkills.some((s) => required.has(s.trim().toLowerCase()));
};

/**
 * @internal
 * Number of distinct required_skills that the volunteer also has
 * (case-insensitive, whitespace-trimmed). Used for scoring, as opposed to
 * skillsMatch() above which only needs a single yes/no overlap.
 */
const countMatchingSkills = (requiredSkills, volunteerSkills) => {
  if (!Array.isArray(requiredSkills) || !Array.isArray(volunteerSkills)) return 0;

  const volunteerSet = new Set(volunteerSkills.map((s) => s.trim().toLowerCase()));
  const uniqueRequired = new Set(requiredSkills.map((s) => s.trim().toLowerCase()));

  let count = 0;
  uniqueRequired.forEach((skill) => {
    if (volunteerSet.has(skill)) count += 1;
  });
  return count;
};

// Weight given to a location match in the ranked-scoring algorithm below.
// Kept as a named constant so the relative importance of "matches your
// city/state" vs. "matches one more skill" is a single, easy-to-tune knob.
const LOCATION_MATCH_SCORE = 1;

/**
 * Find every volunteer whose skills AND location both match the given
 * opportunity. Both conditions must hold — a skills-only or location-only
 * overlap is not a match.
 */
const findMatchingVolunteers = async (opportunity) => {
  // Narrow the DB scan to volunteers with at least one skill listed;
  // location filtering is done in memory since Opportunity.location is
  // free text and can't be indexed/matched cheaply against structured
  // city/state fields at the query level.
  const candidates = await User.find({
    role: 'volunteer',
    skills: { $exists: true, $not: { $size: 0 } },
  }).lean();

  return candidates.filter(
    (volunteer) =>
      skillsMatch(opportunity.required_skills, volunteer.skills) &&
      locationMatches(opportunity.location, volunteer)
  );
};

/**
 * Find matching volunteers for an opportunity and dispatch an
 * 'opportunity_match' notification to each of them. Never throws outward —
 * per-recipient failures are logged and skipped so one bad notification
 * can't block the rest; call sites treat this as fire-and-forget.
 *
 * @returns {Promise<number>} the number of volunteers notified
 */
const notifyMatchedVolunteers = async (opportunity) => {
  const matches = await findMatchingVolunteers(opportunity);

  if (matches.length === 0) return 0;

  const results = await Promise.allSettled(
    matches.map((volunteer) =>
      notificationService.dispatch({
        user_id: volunteer._id,
        type: 'opportunity_match',
        message: `New opportunity "${opportunity.title}" in ${opportunity.location} matches your skills. Apply now!`,
        reference_id: opportunity._id,
      })
    )
  );

  const failedCount = results.filter((r) => r.status === 'rejected').length;
  if (failedCount > 0) {
    console.error(
      `[Matching] ${failedCount}/${matches.length} notification(s) failed to dispatch for opportunity ${opportunity._id}`
    );
  }

  return matches.length - failedCount;
};

/**
 * Get the top-scoring open Opportunities for a given volunteer, ranked by
 * relevance. This is the "pull" counterpart to notifyMatchedVolunteers()
 * above — called when a volunteer wants to see their best current matches
 * (e.g. a "Recommended for you" feed), rather than being pushed a
 * notification when a new opportunity happens to match them.
 *
 * Algorithm:
 *   1. Load the volunteer's skills + location from the User document.
 *   2. Fetch every Opportunity with status === 'open'.
 *   3. Score each: +1 per required_skill the volunteer also has, plus
 *      LOCATION_MATCH_SCORE if the opportunity's location matches the
 *      volunteer's city/state.
 *   4. Require BOTH at least one matching skill AND a location match — same
 *      contract as findMatchingVolunteers/the push-notification path, so a
 *      matching city with zero skill overlap (or vice versa) is not a
 *      "match" — and sort the rest by score, highest first — ties broken by
 *      newest first.
 *   5. Return the top N (default 10).
 *
 * @param {string} volunteerId
 * @param {number} [limit=10]
 * @returns {Promise<Array>} opportunities (plain objects) with matchScore,
 *   matchedSkillCount, and locationMatch attached
 */
const getMatchesForVolunteer = async (volunteerId, limit = 10) => {
  const volunteer = await User.findById(volunteerId).lean();

  if (!volunteer) {
    throw new Error('Volunteer not found');
  }
  if (volunteer.role !== 'volunteer') {
    throw new Error('Matching is only available for volunteer accounts');
  }

  const openOpportunities = await Opportunity.find({ status: 'open' })
    .sort({ createdAt: -1 })
    .lean();

  const scored = openOpportunities.map((opportunity) => {
    const matchedSkillCount = countMatchingSkills(opportunity.required_skills, volunteer.skills);
    const locationMatch = locationMatches(opportunity.location, volunteer);
    const matchScore = matchedSkillCount + (locationMatch ? LOCATION_MATCH_SCORE : 0);

    return { opportunity, matchScore, matchedSkillCount, locationMatch };
  });

  return scored
    .filter((m) => m.matchedSkillCount > 0 && m.locationMatch)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit)
    .map(({ opportunity, matchScore, matchedSkillCount, locationMatch }) => ({
      ...opportunity,
      matchScore,
      matchedSkillCount,
      locationMatch,
    }));
};

/**
 * Find every NGO whose coverage city AND wasteTypes both match the given
 * pickup. Both conditions must hold — enforced inside
 * isNgoEligibleForPickup, the same rule used by the NGO discovery feed.
 */
const findMatchingNgos = async (pickup) => {
  // Narrow the DB scan to NGOs with at least one configured waste type;
  // isNgoEligibleForPickup still does the authoritative city + wasteTypes
  // check per-candidate (it also requires at least one coverage city).
  const candidates = await User.find({
    role: 'ngo',
    wasteTypes: { $exists: true, $not: { $size: 0 } },
  }).lean();

  return candidates.filter((ngo) => isNgoEligibleForPickup(ngo, pickup));
};

/**
 * Find matching NGOs for a pickup and dispatch a 'pickup_match'
 * notification to each of them. Never throws outward — per-recipient
 * failures are logged and skipped so one bad notification can't block the
 * rest; call sites treat this as fire-and-forget.
 *
 * @returns {Promise<number>} the number of NGOs notified
 */
const notifyMatchedNgos = async (pickup) => {
  const matches = await findMatchingNgos(pickup);

  if (matches.length === 0) return 0;

  const results = await Promise.allSettled(
    matches.map((ngo) =>
      notificationService.dispatch({
        user_id: ngo._id,
        type: 'pickup_match',
        message: `New pickup request in ${pickup.address?.city} matches your coverage area and waste types. Claim it now!`,
        reference_id: pickup._id,
      })
    )
  );

  const failedCount = results.filter((r) => r.status === 'rejected').length;
  if (failedCount > 0) {
    console.error(
      `[Matching] ${failedCount}/${matches.length} notification(s) failed to dispatch for pickup ${pickup._id}`
    );
  }

  return matches.length - failedCount;
};

module.exports = {
  findMatchingVolunteers,
  notifyMatchedVolunteers,
  getMatchesForVolunteer,
  findMatchingNgos,
  notifyMatchedNgos,
  skillsMatch,
  countMatchingSkills,
  locationMatches,
};
