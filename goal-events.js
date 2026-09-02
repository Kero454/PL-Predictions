// Goal Events module - uses TheSportsDB (free) to determine the first team
// to score and the first goalscorer for each Premier League match.
// This is a SECONDARY data source. football-data.org remains the primary
// source for fixtures, scores, and gameweeks.

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TSDB_KEY = process.env.THESPORTSDB_KEY || '3'; // '3' = free test key
const BASE = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}`;
const PL_LEAGUE_ID = '4328';

const EVENTS_CACHE_FILE = path.join(__dirname, 'goal-events-cache.json');
const OVERRIDES_FILE = path.join(__dirname, 'first-goal-overrides.json');
const EVENTS_TTL_MS = 30 * 60 * 1000; // refresh season event list every 30 min

// In-memory caches
let seasonEventsCache = { season: null, fetchedAt: 0, events: [] };
// Permanent per-match first-goal cache: { [matchKey]: { firstTeam, firstScorer, resolved } }
let firstGoalCache = {};
// Manual admin overrides: { [matchKey]: { firstTeam, firstScorer } } - authoritative
let firstGoalOverrides = {};
// Squad cache: { [teamKey]: { fetchedAt, players: [names] } }
let squadCache = {};

// ---- Persistence ----
function loadCache() {
  try {
    if (fs.existsSync(EVENTS_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(EVENTS_CACHE_FILE, 'utf8'));
      firstGoalCache = data.firstGoalCache || {};
      console.log(`[GoalEvents] Loaded ${Object.keys(firstGoalCache).length} cached first-goal results`);
    }
  } catch (e) {
    console.error('[GoalEvents] Failed to load cache:', e.message);
  }
}

function saveCache() {
  try {
    fs.writeFileSync(EVENTS_CACHE_FILE, JSON.stringify({ firstGoalCache }), 'utf8');
  } catch (e) {
    console.error('[GoalEvents] Failed to save cache:', e.message);
  }
}

function loadOverrides() {
  try {
    if (fs.existsSync(OVERRIDES_FILE)) {
      firstGoalOverrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')) || {};
      console.log(`[GoalEvents] Loaded ${Object.keys(firstGoalOverrides).length} first-goal overrides`);
    }
  } catch (e) {
    console.error('[GoalEvents] Failed to load overrides:', e.message);
  }
}

function saveOverrides() {
  try {
    fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(firstGoalOverrides, null, 2), 'utf8');
  } catch (e) {
    console.error('[GoalEvents] Failed to save overrides:', e.message);
  }
}

// Set (or clear) a manual override for a match. firstTeam: 'home'|'away'|'none', firstScorer: string|null
function setFirstGoalOverride(matchKey, firstTeam, firstScorer) {
  const key = String(matchKey);
  if (firstTeam == null && firstScorer == null) {
    delete firstGoalOverrides[key];
  } else {
    firstGoalOverrides[key] = {
      firstTeam: firstTeam || null,
      firstScorer: firstTeam === 'none' ? null : (firstScorer || null)
    };
  }
  saveOverrides();
  return firstGoalOverrides[key] || null;
}

function getFirstGoalOverride(matchKey) {
  return firstGoalOverrides[String(matchKey)] || null;
}

function getAllOverrides() {
  return { ...firstGoalOverrides };
}

loadCache();
loadOverrides();

// ---- Team name normalization ----
// Reduce any team name (football-data.org full names OR TheSportsDB names) to
// a canonical key so we can match matches across the two APIs.
function normalizeTeam(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  // strip accents
  n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // remove common suffixes/words
  n = n.replace(/\b(fc|afc|cf)\b/g, '');
  n = n.replace(/&/g, 'and');
  n = n.replace(/[^a-z0-9 ]/g, '');
  n = n.replace(/\s+/g, ' ').trim();

  const aliases = {
    'arsenal': 'arsenal',
    'aston villa': 'aston villa',
    'bournemouth': 'bournemouth',
    'brentford': 'brentford',
    'brighton and hove albion': 'brighton',
    'brighton hove albion': 'brighton',
    'brighton': 'brighton',
    'burnley': 'burnley',
    'chelsea': 'chelsea',
    'coventry city': 'coventry',
    'coventry': 'coventry',
    'crystal palace': 'crystal palace',
    'everton': 'everton',
    'fulham': 'fulham',
    'hull city': 'hull',
    'hull': 'hull',
    'ipswich town': 'ipswich',
    'ipswich': 'ipswich',
    'leeds united': 'leeds',
    'leeds': 'leeds',
    'leicester city': 'leicester',
    'leicester': 'leicester',
    'liverpool': 'liverpool',
    'manchester city': 'man city',
    'man city': 'man city',
    'manchester united': 'man united',
    'man united': 'man united',
    'man utd': 'man united',
    'newcastle united': 'newcastle',
    'newcastle': 'newcastle',
    'nottingham forest': 'nottingham forest',
    'nottm forest': 'nottingham forest',
    'sheffield united': 'sheffield united',
    'southampton': 'southampton',
    'sunderland': 'sunderland',
    'tottenham hotspur': 'tottenham',
    'tottenham': 'tottenham',
    'spurs': 'tottenham',
    'west ham united': 'west ham',
    'west ham': 'west ham',
    'wolverhampton wanderers': 'wolves',
    'wolverhampton': 'wolves',
    'wolves': 'wolves',
    'luton town': 'luton',
    'luton': 'luton'
  };
  return aliases[n] || n;
}

// Convert football-data season year (e.g. 2026) to TheSportsDB season string
function seasonString(year) {
  const y = parseInt(year, 10);
  return `${y}-${y + 1}`;
}

// ---- Player name normalization (for scorer matching) ----
function normalizePlayer(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  n = n.replace(/[^a-z ]/g, '');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

// Robust player name matching: handles different formats between APIs
// e.g. "Martinelli" vs "Gabriel Martinelli", "Sávio" vs "Savio Moreira"
function playersMatch(a, b) {
  if (!a || !b) return false;
  const na = normalizePlayer(a);
  const nb = normalizePlayer(b);
  if (!na || !nb) return false;

  // 1. Exact match
  if (na === nb) return true;

  const partsA = na.split(' ');
  const partsB = nb.split(' ');

  // 2. Surname match (last word)
  if (partsA[partsA.length - 1] === partsB[partsB.length - 1]) return true;

  // 3. Mononym/short name: if one is a single word, check if it appears anywhere in the other
  if (partsA.length === 1 && partsB.includes(partsA[0])) return true;
  if (partsB.length === 1 && partsA.includes(partsB[0])) return true;

  // 4. Substring match: one full name contains the other
  if (na.includes(nb) || nb.includes(na)) return true;

  // 5. First name + last name match across different orderings
  if (partsA.length >= 2 && partsB.length >= 2) {
    // Check if first name of A matches first name of B
    if (partsA[0] === partsB[0] && partsA[0].length >= 4) return true;
    // Check token overlap: if 2+ words match between the names
    const overlap = partsA.filter(w => w.length >= 3 && partsB.includes(w));
    if (overlap.length >= 2) return true;
  }

  return false;
}

// ---- Fetch season events (list of fixtures with TheSportsDB event IDs) ----
async function fetchSeasonEvents(seasonYear) {
  const season = seasonString(seasonYear);
  const now = Date.now();
  if (seasonEventsCache.season === season && (now - seasonEventsCache.fetchedAt) < EVENTS_TTL_MS && seasonEventsCache.events.length) {
    return seasonEventsCache.events;
  }
  try {
    const url = `${BASE}/eventsseason.php?id=${PL_LEAGUE_ID}&s=${season}`;
    const res = await axios.get(url, { timeout: 20000 });
    const events = (res.data && res.data.events) || [];
    seasonEventsCache = { season, fetchedAt: now, events };
    console.log(`[GoalEvents] Cached ${events.length} events for ${season}`);
    return events;
  } catch (e) {
    console.error('[GoalEvents] fetchSeasonEvents error:', e.message);
    return seasonEventsCache.events || [];
  }
}

// Find the TheSportsDB event that matches a football-data.org match
function findEvent(events, homeTeam, awayTeam) {
  const h = normalizeTeam(homeTeam);
  const a = normalizeTeam(awayTeam);
  return events.find(e => normalizeTeam(e.strHomeTeam) === h && normalizeTeam(e.strAwayTeam) === a) || null;
}

// ---- Get first goal (team + scorer) for a specific match ----
// homeTeam/awayTeam are football-data.org names; matchKey is a stable id used for caching.
async function getFirstGoal(seasonYear, matchKey, homeTeam, awayTeam) {
  // Manual admin override takes precedence over everything else
  const override = firstGoalOverrides[String(matchKey)];
  if (override && override.firstTeam) {
    return { firstTeam: override.firstTeam, firstScorer: override.firstScorer || null, resolved: true, source: 'override' };
  }

  // Return permanently cached resolved result
  if (firstGoalCache[matchKey] && firstGoalCache[matchKey].resolved) {
    return firstGoalCache[matchKey];
  }

  try {
    const events = await fetchSeasonEvents(seasonYear);
    const event = findEvent(events, homeTeam, awayTeam);
    if (!event) {
      return { firstTeam: null, firstScorer: null, resolved: false };
    }

    const url = `${BASE}/lookuptimeline.php?id=${event.idEvent}`;
    const res = await axios.get(url, { timeout: 20000 });
    const timeline = (res.data && res.data.timeline) || [];
    const goals = timeline
      .filter(t => t.strTimeline === 'Goal')
      .sort((x, y) => (parseInt(x.intTime || '999', 10)) - (parseInt(y.intTime || '999', 10)));

    let result;
    if (!timeline.length) {
      // Timeline not yet populated - unresolved
      result = { firstTeam: null, firstScorer: null, resolved: false };
    } else if (!goals.length) {
      // Match had a populated timeline but no goals => 0-0
      result = { firstTeam: 'none', firstScorer: null, resolved: true };
    } else {
      const first = goals[0];
      const isHome = first.strHome === 'Yes';
      result = {
        firstTeam: isHome ? 'home' : 'away',
        firstScorer: first.strPlayer || null,
        resolved: true
      };
    }

    firstGoalCache[matchKey] = result;
    if (result.resolved) saveCache();
    return result;
  } catch (e) {
    console.error(`[GoalEvents] getFirstGoal error for ${homeTeam} vs ${awayTeam}:`, e.message);
    return { firstTeam: null, firstScorer: null, resolved: false };
  }
}

// ---- Scoring helpers ----
// Award points for the first-team-to-score prediction (1pt)
function scoreFirstTeam(predicted, actualFirstTeam) {
  if (!predicted || !actualFirstTeam) return 0;
  return predicted === actualFirstTeam ? 1 : 0;
}

// Award points for the first-scorer prediction (2pts)
function scoreFirstScorer(predictedName, actualScorerName) {
  if (!predictedName || !actualScorerName) return 0;
  return playersMatch(predictedName, actualScorerName) ? 2 : 0;
}

module.exports = {
  normalizeTeam,
  normalizePlayer,
  playersMatch,
  fetchSeasonEvents,
  getFirstGoal,
  scoreFirstTeam,
  scoreFirstScorer,
  setFirstGoalOverride,
  getFirstGoalOverride,
  getAllOverrides
};
