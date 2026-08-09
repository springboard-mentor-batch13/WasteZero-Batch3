// Backend/services/matching.service.js


const User = require('../models/users.model');
const Opportunity = require('../models/opportunity.model');
const notificationService = require('./notification.service');

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
 * structured primary location, plus every structured secondary location.
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

  return [...terms].filter(Boolean);
};


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


const LOCATION_MATCH_SCORE = 1;


const findMatchingVolunteers = async (opportunity) => {
 
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


const findMatchingNgos = async (pickup) => {
 
  const candidates = await User.find({
    role: 'ngo',
    wasteTypes: { $exists: true, $not: { $size: 0 } },
  }).lean();

  return candidates.filter((ngo) => isNgoEligibleForPickup(ngo, pickup));
};


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
