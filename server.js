const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

// Auto-select database: use Supabase if configured, otherwise SQLite for local dev
const db = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? require('./database-supabase')
  : require('./database');
console.log(`Database mode: ${process.env.SUPABASE_URL ? 'Supabase (PostgreSQL)' : 'SQLite (local)'}`);


const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint for Railway - serve index.html for browsers, OK for probes
app.get('/', (req, res) => {
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return res.sendFile('index.html', { root: 'public' });
  }
  res.status(200).end('OK');
});

// Add readiness probe endpoint
let dbReady = false;
app.get('/ready', (req, res) => {
  if (dbReady) {
    res.status(200).end('READY');
  } else {
    res.status(503).end('NOT_READY');
  }
});

// Database storage initialized
// Users, predictions, and doublers now stored in SQLite database

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Register endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate username
    if (!username || username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }
    
    // Validate password strength
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain an uppercase letter' });
    }
    if (!/[a-z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain a lowercase letter' });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain a number' });
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain a special character' });
    }
    
    // Check if user already exists
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Create user in database
    const user = await db.createUser(username, password);
    
    // Generate token
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    
    res.json({ token, user: { id: user.id, username: user.username, score: user.score } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('Login attempt for username:', username);
    console.log('Request body:', req.body);
    
    if (!username || !password) {
      console.log('Missing username or password');
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = await db.getUserByUsername(username);
    console.log('User found:', user ? 'Yes' : 'No');
    if (!user) {
      console.log('User not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log('Stored password hash:', user.password);
    const passwordMatch = await bcrypt.compare(password, user.password);
    console.log('Password match:', passwordMatch);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    console.log('Login successful for user:', user.username);
    res.json({ token, user: { id: user.id, username: user.username, score: user.score } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Middleware to verify token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id || decoded.userId; // Handle both token formats
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

// ===== API RESPONSE CACHE =====
// Cache all matches in memory; refresh every 3 minutes to stay within API rate limits.
// Football-Data.org free tier: 10 requests/minute. We use ~1 request per refresh cycle.
const matchCache = {
  allMatches: null,       // full season data
  lastFetch: 0,           // timestamp of last successful API call
  TTL: 3 * 60 * 1000,     // 3 minutes
  refreshTimer: null
};

// Raw API fetch – only called by the cache layer, never directly by endpoints
const _fetchFromAPI = async () => {
  const apiKey = process.env.FOOTBALL_API_KEY;
  
  if (!apiKey || apiKey === 'your-api-key-here') {
    console.log('[Cache] No API key – using mock data');
    return generateMockSeasonData();
  }
  
  const season = '2025';
  const url = `https://api.football-data.org/v4/competitions/PL/matches?season=${season}`;
  
  console.log('[Cache] Fetching all matches from API...');
  const response = await axios.get(url, {
    headers: { 'X-Auth-Token': apiKey },
    timeout: 15000
  });
  
  if (!response.data.matches || response.data.matches.length === 0) {
    console.log('[Cache] Empty API response – using mock data');
    return generateMockSeasonData();
  }
  
  console.log(`[Cache] Got ${response.data.matches.length} matches from API`);
  const mapped = response.data.matches
    .filter(match => match.status !== 'POSTPONED') // exclude postponed with no new date
    .map(match => ({
      id: match.id,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      date: match.utcDate,
      status: match.status === 'FINISHED' ? 'finished' : 
              match.status === 'IN_PLAY' ? 'live' : 'upcoming',
      homeScore: match.score.fullTime.home,
      awayScore: match.score.fullTime.away,
      gameweek: match.matchday,
      originalGameweek: match.matchday
    }));

  // Fix delayed/rescheduled matches: if a match date falls outside its
  // original gameweek's date window, move it to the gameweek whose dates it fits.
  // Build date ranges per gameweek from the majority of matches.
  const gwDates = {};
  mapped.forEach(m => {
    if (!gwDates[m.gameweek]) gwDates[m.gameweek] = [];
    gwDates[m.gameweek].push(new Date(m.date));
  });
  const gwRanges = {};
  Object.entries(gwDates).forEach(([gw, dates]) => {
    dates.sort((a, b) => a - b);
    // Use the middle 80% of matches to define the range (excludes outliers)
    const start = dates[0];
    const end = dates[dates.length - 1];
    gwRanges[gw] = { start, end };
  });

  // Detect outlier matches: if a match date is > 5 days after its GW's last match,
  // it was likely rescheduled. Reassign it to the GW whose date range it fits.
  mapped.forEach(m => {
    const myRange = gwRanges[m.gameweek];
    if (!myRange) return;
    const matchDate = new Date(m.date);
    const daysDiff = (matchDate - myRange.end) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 5) {
      // This match was rescheduled — find the correct GW
      let bestGW = m.gameweek;
      let bestDist = Infinity;
      Object.entries(gwRanges).forEach(([gw, range]) => {
        if (matchDate >= new Date(range.start.getTime() - 2 * 86400000) && 
            matchDate <= new Date(range.end.getTime() + 2 * 86400000)) {
          const mid = new Date((range.start.getTime() + range.end.getTime()) / 2);
          const dist = Math.abs(matchDate - mid);
          if (dist < bestDist) { bestDist = dist; bestGW = parseInt(gw); }
        }
      });
      if (bestGW !== m.gameweek) {
        console.log(`[Cache] Rescheduled: ${m.homeTeam} vs ${m.awayTeam} moved from GW${m.gameweek} → GW${bestGW}`);
        m.gameweek = bestGW;
      }
    }
  });

  return mapped;
};

// Refresh cache – called on interval and on first request
const refreshMatchCache = async () => {
  try {
    const data = await _fetchFromAPI();
    matchCache.allMatches = data;
    matchCache.lastFetch = Date.now();
    console.log(`[Cache] Refreshed: ${data.length} matches cached at ${new Date().toISOString()}`);
  } catch (error) {
    console.error('[Cache] Refresh failed:', error.message);
    // Keep stale data if available; fall back to mock if not
    if (!matchCache.allMatches) {
      matchCache.allMatches = generateMockSeasonData();
      matchCache.lastFetch = Date.now();
    }
  }
};

// Start background refresh interval (called once after DB init)
const startMatchCacheRefresh = () => {
  // Initial fetch
  refreshMatchCache();
  // Periodic refresh every 3 minutes
  matchCache.refreshTimer = setInterval(refreshMatchCache, matchCache.TTL);
  console.log('[Cache] Background refresh started (every 3 min)');
};

// Public function used by all endpoints – always reads from cache
const fetchPremierLeagueMatches = async (gameweek = null) => {
  // If cache is empty (first request before interval fires), populate it
  if (!matchCache.allMatches) {
    await refreshMatchCache();
  }
  
  const allMatches = matchCache.allMatches || generateMockSeasonData();
  
  if (gameweek) {
    return allMatches.filter(m => m.gameweek === gameweek);
  }
  return allMatches;
};

// Generate mock season data for testing
const generateMockSeasonData = (gameweek = null) => {
  const teams = [
    'Arsenal', 'Manchester City', 'Liverpool', 'Chelsea', 'Manchester United',
    'Tottenham', 'Newcastle United', 'Brighton', 'Aston Villa', 'West Ham',
    'Crystal Palace', 'Fulham', 'Wolverhampton', 'Everton', 'Brentford',
    'Nottingham Forest', 'Bournemouth', 'Burnley', 'Leeds United', 'Sunderland'
  ];
  
  const allMatches = [];
  let matchId = 1;
  
  // Generate 38 gameweeks
  for (let gw = 1; gw <= 38; gw++) {
    if (gameweek && gw !== gameweek) continue;
    
    const gameweekMatches = [];
    const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);
    
    // Create 10 matches per gameweek (20 teams = 10 matches)
    for (let i = 0; i < shuffledTeams.length; i += 2) {
      const baseDate = new Date('2025-08-16'); // 2025-26 season start
      baseDate.setDate(baseDate.getDate() + (gw - 1) * 7 + Math.floor(i / 2));
      baseDate.setHours(15 + (i % 3), 0, 0, 0);
      
      const match = {
        id: matchId++,
        homeTeam: shuffledTeams[i],
        awayTeam: shuffledTeams[i + 1],
        date: baseDate.toISOString(),
        status: gw <= 5 ? 'finished' : gw === 6 ? 'live' : 'upcoming',
        homeScore: gw <= 5 ? Math.floor(Math.random() * 4) : null,
        awayScore: gw <= 5 ? Math.floor(Math.random() * 4) : null,
        gameweek: gw
      };
      
      gameweekMatches.push(match);
    }
    
    allMatches.push(...gameweekMatches);
  }
  
  return allMatches;
};

// Calculate deadline for a gameweek (3 hours before first match)
const calculateGameweekDeadline = (matches) => {
  if (!matches.length) return null;
  
  const firstMatch = matches.reduce((earliest, match) => {
    return new Date(match.date) < new Date(earliest.date) ? match : earliest;
  });
  
  const deadline = new Date(firstMatch.date);
  deadline.setHours(deadline.getHours() - 3);
  
  return deadline.toISOString();
};

// Get matches for specific gameweek or all matches
app.get('/api/matches', async (req, res) => {
  try {
    const gameweek = req.query.gameweek ? parseInt(req.query.gameweek) : null;
    const matches = await fetchPremierLeagueMatches(gameweek);
    
    if (gameweek) {
      const deadline = calculateGameweekDeadline(matches);
      res.json({
        matches,
        gameweek,
        deadline,
        canPredict: new Date() < new Date(deadline)
      });
    } else {
      res.json({ matches });
    }
  } catch (error) {
    console.error('Matches endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch matches', details: error.message });
  }
});

// Get all gameweeks with basic info
app.get('/api/gameweeks', async (req, res) => {
  try {
    const allMatches = await fetchPremierLeagueMatches();
    const gameweeks = [];
    
    for (let gw = 1; gw <= 38; gw++) {
      const gwMatches = allMatches.filter(m => m.gameweek === gw);
      if (gwMatches.length > 0) {
        const deadline = calculateGameweekDeadline(gwMatches);
        gameweeks.push({
          gameweek: gw,
          matchCount: gwMatches.length,
          deadline,
          canPredict: new Date() < new Date(deadline),
          status: gwMatches.every(m => m.status === 'finished') ? 'finished' :
                 gwMatches.some(m => m.status === 'live') ? 'live' : 'upcoming'
        });
      }
    }
    
    res.json(gameweeks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gameweeks' });
  }
});

// Submit prediction with deadline
app.post('/api/predictions', authenticateToken, async (req, res) => {
  try {
    const { matchId, homeScore, awayScore, isDoubler, gameweek } = req.body;
    
    // Check if deadline has passed
    const matches = await fetchPremierLeagueMatches(gameweek);
    const gameweekMatches = matches.filter(m => m.gameweek === gameweek);
    const deadline = calculateGameweekDeadline(gameweekMatches);
    
    if (new Date() >= new Date(deadline)) {
      return res.status(400).json({ error: 'Prediction deadline has passed' });
    }
    
    // Handle doubler logic - only 1 per gameweek
    if (isDoubler) {
      // Clear ALL doubler flags for this user's predictions in this gameweek first
      await db.clearDoublerFlags(req.userId, gameweek);
      // Set the new doubler in the doublers table
      await db.saveDoubler(req.userId, gameweek, matchId);
    }
    
    // Save prediction to database
    await db.savePrediction(req.userId, matchId, parseInt(homeScore), parseInt(awayScore), isDoubler, gameweek);
    
    // Check and award badges
    const newBadges = await checkAndAwardBadges(req.userId);
    
    res.json({ message: 'Prediction saved successfully', newBadges });
  } catch (error) {
    console.error('Prediction submission error:', error);
    res.status(500).json({ error: 'Failed to save prediction' });
  }
});

// Verify token endpoint
app.get('/api/verify', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    if (user) {
      res.json({ 
        valid: true, 
        user: { 
          id: user.id, 
          username: user.username 
        } 
      });
    } else {
      res.status(401).json({ valid: false });
    }
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ valid: false });
  }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    // Calculate scores for all users
    const allMatches = await fetchPremierLeagueMatches();
    const finishedMatches = allMatches.filter(m => m.status === 'finished');
    const allUsers = await db.getAllUsers();
    const allPredictions = await db.getAllPredictions();
    
    const leaderboard = [];
    
    // Ensure ALL users appear in leaderboard, even with 0 points
    for (const user of allUsers) {
      let totalScore = 0;
      
      for (const match of finishedMatches) {
        const prediction = allPredictions.find(p => p.userId === user.id && p.matchId == match.id);
        if (prediction) {
          // Create a copy without isDoubler to avoid double-counting
          // since we check doubler separately below
          let matchScore = calculatePoints(
            { homeScore: prediction.homeScore, awayScore: prediction.awayScore, isDoubler: false },
            match.homeScore, match.awayScore
          );
          
          // Check if this was a doubler match
          const doubler = await db.getUserDoubler(user.id, match.gameweek);
          if (doubler && doubler.matchId == match.id) {
            matchScore *= 2;
          }
          
          totalScore += matchScore;
        }
      }
      
      // Add score adjustment (manual corrections)
      const adjustment = db.getScoreAdjustment(user.id);
      totalScore += adjustment;

      // Update user score in database
      await db.updateUserScore(user.id, totalScore);
      
      // Get user title
      const titleKey = user.title || null;
      const titleBadge = titleKey && BADGES[titleKey] ? BADGES[titleKey] : null;

      // Add user to leaderboard regardless of score
      leaderboard.push({
        id: user.id,
        username: user.username,
        score: totalScore,
        predictions: allPredictions.filter(p => p.userId === user.id).length,
        titleName: titleBadge ? titleBadge.name : null,
        titleColor: titleBadge ? titleBadge.color : null
      });
    }
    
    leaderboard.sort((a, b) => b.score - a.score);
    res.json(leaderboard);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get user predictions
app.get('/api/predictions', authenticateToken, async (req, res) => {
  try {
    const userPredictions = await db.getUserPredictions(req.userId);
    res.json(userPredictions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

// Get user's own predictions (alias for consistency)
app.get('/api/my-predictions', authenticateToken, async (req, res) => {
  try {
    const userPredictions = await db.getUserPredictions(req.userId);
    const user = await db.getUserById(req.userId);
    
    // Enrich predictions with match team names
    const enriched = [];
    const matchCache = {};
    
    for (const pred of userPredictions) {
      // Fetch matches for this gameweek (cached)
      const gw = pred.gameweek || 1;
      if (!matchCache[gw]) {
        try {
          matchCache[gw] = await fetchPremierLeagueMatches(gw);
        } catch (e) {
          matchCache[gw] = [];
        }
      }
      
      const match = matchCache[gw].find(m => m.id == pred.matchId);
      enriched.push({
        ...pred,
        homeTeam: match ? match.homeTeam : 'Team A',
        awayTeam: match ? match.awayTeam : 'Team B',
        actualHomeScore: match ? match.homeScore : null,
        actualAwayScore: match ? match.awayScore : null,
        matchStatus: match ? match.status : 'unknown',
        username: user ? user.username : 'You'
      });
    }
    
    res.json(enriched);
  } catch (error) {
    console.error('My predictions error:', error);
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

// Get user's doubler for a specific gameweek
app.get('/api/doubler/:gameweek', authenticateToken, async (req, res) => {
  try {
    const gameweek = parseInt(req.params.gameweek);
    const userDoubler = await db.getUserDoubler(req.userId, gameweek);
    res.json({ doublerMatchId: userDoubler ? userDoubler.matchId : null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch doubler' });
  }
});

// Cancel doubler for a specific gameweek
app.delete('/api/doubler/:gameweek', authenticateToken, async (req, res) => {
  try {
    const gameweek = parseInt(req.params.gameweek);
    // Remove doubler flags from all predictions in this gameweek
    await db.clearDoublerFlags(req.userId, gameweek);
    // Remove the doubler record itself
    await db.saveDoubler(req.userId, gameweek, '');
    res.json({ message: 'Doubler cancelled' });
  } catch (error) {
    console.error('Cancel doubler error:', error);
    res.status(500).json({ error: 'Failed to cancel doubler' });
  }
});

// ===== VERCEL CRON ENDPOINTS =====
// These are called by Vercel Cron Jobs (see vercel.json).
// On local dev, the setInterval-based scheduler handles this instead.

app.get('/api/cron/refresh-cache', async (req, res) => {
  // Verify cron secret in production
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    await refreshMatchCache();
    res.json({ ok: true, cached: matchCache.allMatches?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cron/notifications', async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const allMatches = matchCache.allMatches;
    if (!allMatches) return res.json({ ok: true, sent: 0 });
    const now = new Date();
    let sent = 0;

    // Match start notifications (5 min before kickoff)
    for (const match of allMatches) {
      if (notificationState.notifiedMatchIds.has(match.id)) continue;
      const kickoff = new Date(match.date);
      const diffMin = (kickoff - now) / 60000;
      if (diffMin > 0 && diffMin <= 5 && match.status === 'upcoming') {
        notificationState.notifiedMatchIds.add(match.id);
        const title = '⚽ Match Starting!';
        const body = `${match.homeTeam} vs ${match.awayTeam} kicks off in ${Math.ceil(diffMin)} min!`;
        await sendPushToAll(title, body, '/', { sound: 'football' });
        io.emit('matchStarting', { matchId: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam });
        sent++;
      }
    }

    // Weekly reminder (Wednesday ~10am)
    const dayOfWeek = now.getDay();
    const hourOfDay = now.getHours();
    const daysSince = (now - notificationState.lastWeeklyReminder) / (1000 * 60 * 60 * 24);
    if (dayOfWeek === 3 && hourOfDay >= 10 && hourOfDay < 11 && daysSince > 5) {
      notificationState.lastWeeklyReminder = Date.now();
      const upcomingGw = allMatches.find(m => m.status === 'upcoming');
      if (upcomingGw) {
        await sendPushToAll('🏟️ Time to Predict!', `Gameweek ${upcomingGw.gameweek} matches are coming up!`, '/');
        sent++;
      }
    }

    res.json({ ok: true, sent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin endpoint to update match results (for testing)
app.post('/api/admin/update-match', (req, res) => {
  try {
    const { matchId, homeScore, awayScore } = req.body;
    updateMatchResults(parseInt(matchId), homeScore, awayScore);
    res.json({ message: 'Match result updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update match result' });
  }
});

// Admin endpoint to set user scores manually
// Calculates adjustment = desired_score - prediction_calculated_score
app.post('/api/admin/set-scores', async (req, res) => {
  try {
    const { scores } = req.body; // [{ username, score }]
    if (!scores || !Array.isArray(scores)) return res.status(400).json({ error: 'scores array required' });

    const allMatches = await fetchPremierLeagueMatches();
    const finishedMatches = allMatches.filter(m => m.status === 'finished');
    const allPredictions = await db.getAllPredictions();

    const results = [];
    for (const { username, score: desiredScore } of scores) {
      const user = await db.getUserByUsername(username);
      if (!user) { results.push({ username, error: 'User not found' }); continue; }

      // Calculate current prediction-based score
      let calcScore = 0;
      for (const match of finishedMatches) {
        const pred = allPredictions.find(p => p.userId === user.id && p.matchId == match.id);
        if (pred) {
          let ms = calculatePoints({ homeScore: pred.homeScore, awayScore: pred.awayScore, isDoubler: false }, match.homeScore, match.awayScore);
          const doubler = await db.getUserDoubler(user.id, match.gameweek);
          if (doubler && doubler.matchId == match.id) ms *= 2;
          calcScore += ms;
        }
      }

      const adjustment = desiredScore - calcScore;
      await db.setScoreAdjustment(user.id, adjustment);
      await db.updateUserScore(user.id, desiredScore);
      results.push({ username, desiredScore, calculatedScore: calcScore, adjustment, success: true });
    }
    res.json({ results });
  } catch (error) {
    console.error('Set scores error:', error);
    res.status(500).json({ error: 'Failed to set scores' });
  }
});

// ===== BADGE DEFINITIONS =====
// Tiers: Beginner (easy) → Veteran → Elite → Mythic (hardest)
const BADGES = {
  // ── BEGINNER: Prediction milestones ──
  first_prediction:           { name: 'Rookie',              icon: 'fas fa-star',              description: 'Made your first prediction',         color: '#90CAF9', tier: 'beginner' },
  ten_predictions:            { name: 'Regular',             icon: 'fas fa-fire',              description: 'Made 10 predictions',                color: '#FF6B35', tier: 'beginner' },
  fifty_predictions:          { name: 'Dedicated',           icon: 'fas fa-medal',             description: 'Made 50 predictions',                color: '#C0C0C0', tier: 'beginner' },
  full_gameweek:              { name: 'Full Card',           icon: 'fas fa-clipboard-check',   description: 'Predicted all 10 matches in a gameweek', color: '#4CAF50', tier: 'beginner' },
  league_creator:             { name: 'Founder',             icon: 'fas fa-users',             description: 'Created a league',                   color: '#4169E1', tier: 'beginner' },
  fifty_points:               { name: 'Half Century',        icon: 'fas fa-coins',             description: 'Reached 50 total points',            color: '#FFC107', tier: 'beginner' },

  // ── VETERAN: Harder milestones ──
  hundred_predictions:        { name: 'Centurion',           icon: 'fas fa-shield-halved',     description: 'Made 100 predictions',               color: '#FFD700', tier: 'veteran' },
  two_hundred_predictions:    { name: 'Ironclad',            icon: 'fas fa-shield',            description: 'Made 200 predictions',               color: '#4169E1', tier: 'veteran' },
  streak_3:                   { name: 'Hot Streak',          icon: 'fas fa-fire-flame-curved', description: '3 correct results in a row',         color: '#FF4500', tier: 'veteran' },
  streak_5:                   { name: 'Blazing',             icon: 'fas fa-meteor',            description: '5 correct results in a row',         color: '#FF0000', tier: 'veteran' },
  perfect_score:              { name: 'Bullseye',            icon: 'fas fa-bullseye',          description: 'Scored 4/4 on a match',              color: '#00FF88', tier: 'veteran' },
  hundred_points:             { name: 'Century Club',        icon: 'fas fa-sack-dollar',       description: 'Reached 100 total points',           color: '#FF9800', tier: 'veteran' },
  top_3_finish:               { name: 'Podium',              icon: 'fas fa-award',             description: 'Finished top 3 in a gameweek',       color: '#CD7F32', tier: 'veteran' },
  h2h_winner:                 { name: 'Head Hunter',         icon: 'fas fa-skull-crossbones',  description: 'Won a H2H challenge',                color: '#E91E63', tier: 'veteran' },
  h2h_5_wins:                 { name: 'Duelist',             icon: 'fas fa-swords',            description: 'Won 5 H2H challenges',               color: '#AB47BC', tier: 'veteran' },
  weekly_winner:              { name: 'Weekly King',         icon: 'fas fa-trophy',            description: 'Won a gameweek',                     color: '#FFD700', tier: 'veteran' },
  ten_full_gameweeks:         { name: 'Relentless',          icon: 'fas fa-list-check',        description: 'Predicted all matches in 10 gameweeks', color: '#2196F3', tier: 'veteran' },

  // ── ELITE: Very hard ──
  three_hundred_predictions:  { name: 'The Grinder',         icon: 'fas fa-gem',               description: 'Made 300 predictions',               color: '#E91E63', tier: 'elite' },
  streak_10:                  { name: 'Untouchable',         icon: 'fas fa-dragon',            description: '10 correct results in a row',        color: '#8B0000', tier: 'elite' },
  five_perfect:               { name: 'Sharpshooter',        icon: 'fas fa-crosshairs',        description: 'Got 5 perfect scores (4/4)',         color: '#FF5722', tier: 'elite' },
  doubler_master:             { name: 'Double or Nothing',   icon: 'fas fa-dice-d20',          description: 'Scored 8/8 on a doubler match',      color: '#9B59B6', tier: 'elite' },
  two_hundred_points:         { name: 'Big League',          icon: 'fas fa-money-bill-trend-up',description: 'Reached 200 total points',           color: '#4CAF50', tier: 'elite' },
  three_hundred_points:       { name: 'Point Machine',       icon: 'fas fa-chart-line',        description: 'Reached 300 total points',           color: '#00BCD4', tier: 'elite' },
  five_weekly_wins:           { name: 'Throne Keeper',       icon: 'fas fa-chess-king',        description: 'Won 5 gameweeks',                    color: '#FF1744', tier: 'elite' },
  h2h_streak_3:               { name: 'Rival Crusher',       icon: 'fas fa-hand-fist',         description: 'Won 3 H2H challenges in a row',     color: '#D32F2F', tier: 'elite' },
  h2h_10_wins:                { name: 'Gladiator',           icon: 'fas fa-shield-halved',     description: 'Won 10 H2H challenges',              color: '#FF6F00', tier: 'elite' },
  twenty_full_gameweeks:      { name: 'The Machine',         icon: 'fas fa-robot',             description: 'Predicted all matches in 20 gameweeks', color: '#9C27B0', tier: 'elite' },

  // ── MYTHIC: Near-impossible feats ──
  full_season:                { name: 'Absolute Unit',       icon: 'fas fa-calendar-check',    description: 'Predicted all 380 matches in a season', color: '#00BCD4', tier: 'mythic' },
  streak_20:                  { name: 'The Prophet',          icon: 'fas fa-hat-wizard',        description: '20 correct results in a row',        color: '#FFD700', tier: 'mythic' },
  ten_perfect:                { name: 'The Oracle',           icon: 'fas fa-eye',               description: 'Got 10 perfect scores (4/4)',        color: '#673AB7', tier: 'mythic' },
  four_hundred_points:        { name: 'Legendary',            icon: 'fas fa-scroll',            description: 'Reached 400 total points',           color: '#FF6F00', tier: 'mythic' },
  five_hundred_points:        { name: 'Hall of Fame',         icon: 'fas fa-landmark',          description: 'Reached 500 total points',           color: '#D4AF37', tier: 'mythic' },
  six_hundred_points:         { name: 'The GOAT',             icon: 'fas fa-mountain-sun',      description: 'Reached 600 total points',           color: '#FF1744', tier: 'mythic' },
  doubler_streak_3:           { name: 'Fortune\'s Favorite',  icon: 'fas fa-bolt-lightning',    description: 'Won 3 doublers in a row',            color: '#FF9800', tier: 'mythic' },
  h2h_20_wins:                { name: 'Warlord',              icon: 'fas fa-chess-queen',       description: 'Won 20 H2H challenges',              color: '#B71C1C', tier: 'mythic' },
  season_champion:            { name: 'Season Champion',      icon: 'fas fa-crown',             description: 'Won the overall season leaderboard', color: '#FFD700', tier: 'mythic' }
};

// Helper to generate random invite code
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Helper to check and award badges after actions
async function checkAndAwardBadges(userId) {
  const awarded = [];
  try {
    const predCount = await db.getUserPredictionCount(userId);
    const streak = await db.getUserStreak(userId);
    const user = await db.getUserById(userId);

    // Prediction milestones
    if (predCount >= 1) { const r = await db.awardBadge(userId, 'first_prediction'); if (r.awarded) awarded.push('first_prediction'); }
    if (predCount >= 10) { const r = await db.awardBadge(userId, 'ten_predictions'); if (r.awarded) awarded.push('ten_predictions'); }
    if (predCount >= 50) { const r = await db.awardBadge(userId, 'fifty_predictions'); if (r.awarded) awarded.push('fifty_predictions'); }
    if (predCount >= 100) { const r = await db.awardBadge(userId, 'hundred_predictions'); if (r.awarded) awarded.push('hundred_predictions'); }
    if (predCount >= 200) { const r = await db.awardBadge(userId, 'two_hundred_predictions'); if (r.awarded) awarded.push('two_hundred_predictions'); }
    if (predCount >= 300) { const r = await db.awardBadge(userId, 'three_hundred_predictions'); if (r.awarded) awarded.push('three_hundred_predictions'); }
    if (predCount >= 380) { const r = await db.awardBadge(userId, 'full_season'); if (r.awarded) awarded.push('full_season'); }

    // Streak badges
    if (streak && streak.current_streak >= 3) { const r = await db.awardBadge(userId, 'streak_3'); if (r.awarded) awarded.push('streak_3'); }
    if (streak && streak.current_streak >= 5) { const r = await db.awardBadge(userId, 'streak_5'); if (r.awarded) awarded.push('streak_5'); }
    if (streak && streak.current_streak >= 10) { const r = await db.awardBadge(userId, 'streak_10'); if (r.awarded) awarded.push('streak_10'); }
    if (streak && streak.current_streak >= 20) { const r = await db.awardBadge(userId, 'streak_20'); if (r.awarded) awarded.push('streak_20'); }

    // Points milestones
    if (user && user.score >= 50) { const r = await db.awardBadge(userId, 'fifty_points'); if (r.awarded) awarded.push('fifty_points'); }
    if (user && user.score >= 100) { const r = await db.awardBadge(userId, 'hundred_points'); if (r.awarded) awarded.push('hundred_points'); }
    if (user && user.score >= 200) { const r = await db.awardBadge(userId, 'two_hundred_points'); if (r.awarded) awarded.push('two_hundred_points'); }
    if (user && user.score >= 300) { const r = await db.awardBadge(userId, 'three_hundred_points'); if (r.awarded) awarded.push('three_hundred_points'); }
    if (user && user.score >= 400) { const r = await db.awardBadge(userId, 'four_hundred_points'); if (r.awarded) awarded.push('four_hundred_points'); }
    if (user && user.score >= 500) { const r = await db.awardBadge(userId, 'five_hundred_points'); if (r.awarded) awarded.push('five_hundred_points'); }
    if (user && user.score >= 600) { const r = await db.awardBadge(userId, 'six_hundred_points'); if (r.awarded) awarded.push('six_hundred_points'); }

    // H2H milestones
    const h2hWins = await db.getUserH2HWins(userId);
    if (h2hWins >= 1) { const r = await db.awardBadge(userId, 'h2h_winner'); if (r.awarded) awarded.push('h2h_winner'); }
    if (h2hWins >= 5) { const r = await db.awardBadge(userId, 'h2h_5_wins'); if (r.awarded) awarded.push('h2h_5_wins'); }
    if (h2hWins >= 10) { const r = await db.awardBadge(userId, 'h2h_10_wins'); if (r.awarded) awarded.push('h2h_10_wins'); }
    if (h2hWins >= 20) { const r = await db.awardBadge(userId, 'h2h_20_wins'); if (r.awarded) awarded.push('h2h_20_wins'); }
  } catch (e) {
    console.error('Badge check error:', e);
  }
  return awarded;
}

// ===== LEAGUE ENDPOINTS =====

// Create a league
app.post('/api/leagues', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'League name must be at least 2 characters' });
    }
    const inviteCode = generateInviteCode();
    const league = await db.createLeague(name.trim(), inviteCode, req.userId);
    // Award league creator badge
    await db.awardBadge(req.userId, 'league_creator');
    res.json(league);
  } catch (error) {
    console.error('Create league error:', error);
    res.status(500).json({ error: 'Failed to create league' });
  }
});

// Join a league
app.post('/api/leagues/join', authenticateToken, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: 'Invite code required' });
    const result = await db.joinLeague(inviteCode.toUpperCase().trim(), req.userId);
    res.json(result);
  } catch (error) {
    console.error('Join league error:', error);
    res.status(400).json({ error: error.message || 'Failed to join league' });
  }
});

// Get user's leagues
app.get('/api/leagues', authenticateToken, async (req, res) => {
  try {
    const leagues = await db.getUserLeagues(req.userId);
    res.json(leagues);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leagues' });
  }
});

// Get league leaderboard
app.get('/api/leagues/:leagueId/leaderboard', authenticateToken, async (req, res) => {
  try {
    const league = await db.getLeagueById(parseInt(req.params.leagueId));
    if (!league) return res.status(404).json({ error: 'League not found' });
    const leaderboard = await db.getLeagueLeaderboard(league.id);
    res.json({ league: { id: league.id, name: league.name, invite_code: league.invite_code }, leaderboard });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch league leaderboard' });
  }
});

// ===== STREAK ENDPOINT =====

app.get('/api/streak', authenticateToken, async (req, res) => {
  try {
    const streak = await db.getUserStreak(req.userId);
    res.json(streak);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch streak' });
  }
});

// ===== BADGES ENDPOINTS =====

// Get all badge definitions
app.get('/api/badges/all', (req, res) => {
  res.json(BADGES);
});

// Get user's earned badges
app.get('/api/badges', authenticateToken, async (req, res) => {
  try {
    const earned = await db.getUserBadges(req.userId);
    const badgesWithInfo = earned.map(b => ({
      ...BADGES[b.badge_key],
      key: b.badge_key,
      earned_at: b.earned_at
    }));
    res.json(badgesWithInfo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// Get all achievements with earned/unearned status for the user
app.get('/api/achievements', authenticateToken, async (req, res) => {
  try {
    // Retroactively check and award any new badges before returning
    await checkAndAwardBadges(req.userId);

    const earned = await db.getUserBadges(req.userId);
    const earnedMap = {};
    earned.forEach(b => { earnedMap[b.badge_key] = b.earned_at; });
    
    const achievements = Object.entries(BADGES).map(([key, badge]) => ({
      key,
      ...badge,
      earned: !!earnedMap[key],
      earned_at: earnedMap[key] || null
    }));
    
    res.json(achievements);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Set user title from an earned achievement
app.post('/api/title', authenticateToken, async (req, res) => {
  try {
    const { titleKey } = req.body;
    // Validate: titleKey must be null/empty (clear) or an earned badge
    if (titleKey) {
      const earned = await db.getUserBadges(req.userId);
      const earnedKeys = earned.map(b => b.badge_key);
      if (!earnedKeys.includes(titleKey)) {
        return res.status(400).json({ error: 'You haven\'t earned this achievement yet' });
      }
    }
    await db.setUserTitle(req.userId, titleKey || null);
    res.json({ message: titleKey ? `Title set to "${BADGES[titleKey]?.name || titleKey}"` : 'Title cleared' });
  } catch (error) {
    console.error('Set title error:', error);
    res.status(500).json({ error: 'Failed to set title' });
  }
});

// Get user's current title
app.get('/api/title', authenticateToken, async (req, res) => {
  try {
    const title = await db.getUserTitle(req.userId);
    const badge = title && BADGES[title] ? BADGES[title] : null;
    res.json({ titleKey: title, titleName: badge ? badge.name : null, titleColor: badge ? badge.color : null, titleIcon: badge ? badge.icon : null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get title' });
  }
});

// ===== WEEKLY WINNER ENDPOINTS =====

app.get('/api/weekly-winner/:gameweek', async (req, res) => {
  try {
    const winner = await db.getWeeklyWinner(parseInt(req.params.gameweek));
    res.json(winner || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch weekly winner' });
  }
});

app.get('/api/weekly-winners', async (req, res) => {
  try {
    const winners = await db.getAllWeeklyWinners();
    res.json(winners);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch weekly winners' });
  }
});

// ===== SHARE CARD ENDPOINT =====

app.get('/api/share-card', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    const streak = await db.getUserStreak(req.userId);
    const badges = await db.getUserBadges(req.userId);
    const predCount = await db.getUserPredictionCount(req.userId);
    const allUsers = await db.getAllUsers();
    const rank = allUsers.findIndex(u => u.id === req.userId) + 1;

    res.json({
      username: user.username,
      score: user.score,
      rank,
      totalPlayers: allUsers.length,
      currentStreak: streak.current_streak,
      bestStreak: streak.best_streak,
      predictions: predCount,
      badgeCount: badges.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate share card data' });
  }
});

// ===== USER PROFILE / STATS ENDPOINT =====

app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    const streak = await db.getUserStreak(req.userId);
    const badges = await db.getUserBadges(req.userId);
    const predCount = await db.getUserPredictionCount(req.userId);
    const leagues = await db.getUserLeagues(req.userId);
    const allUsers = await db.getAllUsers();
    const rank = allUsers.findIndex(u => u.id === req.userId) + 1;

    const badgesWithInfo = badges.map(b => ({
      ...BADGES[b.badge_key],
      key: b.badge_key,
      earned_at: b.earned_at
    }));

    res.json({
      username: user.username,
      score: user.score,
      rank,
      totalPlayers: allUsers.length,
      currentStreak: streak.current_streak,
      bestStreak: streak.best_streak,
      predictions: predCount,
      badges: badgesWithInfo,
      leagues: leagues.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ===== HEAD-TO-HEAD ENDPOINTS =====

// Helper: determine the "current" gameweek from cached matches
async function getCurrentGameweek() {
  const allMatches = await fetchPremierLeagueMatches();
  const now = new Date();
  // Find the first gameweek that has at least one upcoming match
  for (let gw = 1; gw <= 38; gw++) {
    const gwMatches = allMatches.filter(m => m.gameweek === gw);
    const hasUpcoming = gwMatches.some(m => new Date(m.date) > now);
    if (hasUpcoming) return gw;
  }
  // All finished
  const gws = allMatches.map(m => m.gameweek);
  return Math.max(...gws);
}

// Helper: find the next gameweek whose prediction deadline hasn't passed (for H2H challenges)
async function getNextChallengeableGW() {
  const allMatches = await fetchPremierLeagueMatches();
  const now = new Date();
  for (let gw = 1; gw <= 38; gw++) {
    const gwMatches = allMatches.filter(m => m.gameweek === gw);
    if (gwMatches.length === 0) continue;
    const deadline = calculateGameweekDeadline(gwMatches);
    if (deadline && new Date(deadline) > now) return gw;
  }
  return 38; // fallback
}

// Helper: score an H2H challenge by comparing both players' GW scores
async function scoreH2HChallenge(challenge) {
  const allMatches = await fetchPremierLeagueMatches(challenge.gameweek);
  const finishedMatches = allMatches.filter(m => m.status === 'finished' && m.gameweek === challenge.gameweek);

  const challengerPreds = await db.getUserPredictions(challenge.challenger_id);
  const opponentPreds = await db.getUserPredictions(challenge.opponent_id);

  let challengerScore = 0;
  let opponentScore = 0;

  for (const match of finishedMatches) {
    const cPred = challengerPreds.find(p => p.matchId == match.id && p.gameweek === challenge.gameweek);
    const oPred = opponentPreds.find(p => p.matchId == match.id && p.gameweek === challenge.gameweek);

    if (cPred) {
      challengerScore += calculatePoints({ homeScore: cPred.homeScore, awayScore: cPred.awayScore, isDoubler: false }, match.homeScore, match.awayScore);
    }
    if (oPred) {
      opponentScore += calculatePoints({ homeScore: oPred.homeScore, awayScore: oPred.awayScore, isDoubler: false }, match.homeScore, match.awayScore);
    }
  }

  // Determine winner (null = draw)
  let winnerId = null;
  if (challengerScore > opponentScore) winnerId = challenge.challenger_id;
  else if (opponentScore > challengerScore) winnerId = challenge.opponent_id;

  await db.updateH2HScores(challenge.id, challengerScore, opponentScore, winnerId);
  return { challengerScore, opponentScore, winnerId };
}

// Auto-expire pending challenges & score completed GWs (called by scheduler)
async function processH2HChallenges() {
  try {
    const currentGW = await getCurrentGameweek();
    // Expire pending challenges for current and past GWs
    for (let gw = 1; gw <= currentGW; gw++) {
      await db.expirePendingH2HChallenges(gw);
    }
    // Score accepted challenges for finished GWs
    for (let gw = 1; gw < currentGW; gw++) {
      const accepted = await db.getAcceptedH2HChallengesForGW(gw);
      for (const ch of accepted) {
        await scoreH2HChallenge(ch);
      }
    }
  } catch (e) {
    console.error('[H2H] Process error:', e.message);
  }
}

// Search users for H2H challenge
app.get('/api/users/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const users = await db.searchUsers(q);
    res.json(users.filter(u => u.id !== req.userId));
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// Create H2H challenge — only for next challengeable gameweek, max 2 per GW
app.post('/api/h2h/challenge', authenticateToken, async (req, res) => {
  try {
    const { opponentId, gameweek } = req.body;
    if (!opponentId || !gameweek) return res.status(400).json({ error: 'Opponent and gameweek required' });
    if (opponentId === req.userId) return res.status(400).json({ error: 'Cannot challenge yourself' });

    // Enforce: challenges only for a GW whose deadline hasn't passed
    const challengeGW = await getNextChallengeableGW();
    if (gameweek !== challengeGW) {
      return res.status(400).json({ error: `You can only challenge for Gameweek ${challengeGW}` });
    }

    // Enforce: max 2 challenges per gameweek per user
    const challengeCount = await db.getUserH2HChallengeCountForGW(req.userId, gameweek);
    if (challengeCount >= 2) {
      return res.status(400).json({ error: 'You can only have 2 H2H challenges per gameweek' });
    }

    // Also check opponent's limit
    const oppCount = await db.getUserH2HChallengeCountForGW(opponentId, gameweek);
    if (oppCount >= 2) {
      return res.status(400).json({ error: 'Opponent already has 2 challenges for this gameweek' });
    }

    const result = await db.createH2HChallenge(req.userId, opponentId, gameweek);
    const challenger = await db.getUserById(req.userId);

    // Notify opponent
    await db.createNotification(opponentId, 'h2h_challenge', 'New Challenge!',
      `${challenger.username} challenged you for Gameweek ${gameweek}!`,
      { challengeId: result.id, gameweek });

    io.emit('notification', { userId: opponentId, type: 'h2h_challenge' });
    sendPushToUser(opponentId, 'New Challenge!', `${challenger.username} challenged you for Gameweek ${gameweek}!`, '/');

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to create challenge' });
  }
});

// Accept H2H challenge
app.post('/api/h2h/:id/accept', authenticateToken, async (req, res) => {
  try {
    // Check that the GW hasn't started yet
    const challenge = await db.getH2HChallenge(parseInt(req.params.id));
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const gwMatches = await fetchPremierLeagueMatches(challenge.gameweek);
    const deadline = calculateGameweekDeadline(gwMatches.filter(m => m.gameweek === challenge.gameweek));
    if (deadline && new Date() >= new Date(deadline)) {
      // Auto-expire instead
      await db.expirePendingH2HChallenges(challenge.gameweek);
      return res.status(400).json({ error: 'This gameweek has already started — challenge expired' });
    }

    await db.acceptH2HChallenge(parseInt(req.params.id), req.userId);
    const updated = await db.getH2HChallenge(parseInt(req.params.id));

    await db.createNotification(updated.challenger_id, 'h2h_accepted', 'Challenge Accepted!',
      `${updated.opponent_name} accepted your GW${updated.gameweek} challenge!`,
      { challengeId: updated.id });
    io.emit('notification', { userId: updated.challenger_id, type: 'h2h_accepted' });
    sendPushToUser(updated.challenger_id, 'Challenge Accepted!', `${updated.opponent_name} accepted your GW${updated.gameweek} challenge!`, '/');

    res.json({ message: 'Challenge accepted' });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to accept challenge' });
  }
});

// Decline H2H challenge
app.post('/api/h2h/:id/decline', authenticateToken, async (req, res) => {
  try {
    await db.declineH2HChallenge(parseInt(req.params.id), req.userId);
    res.json({ message: 'Challenge declined' });
  } catch (error) {
    res.status(400).json({ error: 'Failed to decline challenge' });
  }
});

// Get user's H2H challenges
app.get('/api/h2h', authenticateToken, async (req, res) => {
  try {
    const challenges = await db.getUserH2HChallenges(req.userId);
    res.json(challenges);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// Get H2H leaderboard (separate from main leaderboard)
app.get('/api/h2h/leaderboard', async (req, res) => {
  try {
    const leaderboard = await db.getH2HLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    console.error('H2H leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch H2H leaderboard' });
  }
});

// Get current GW info for H2H (so frontend knows which GW to challenge for)
app.get('/api/h2h/info', authenticateToken, async (req, res) => {
  try {
    const currentGW = await getCurrentGameweek();
    const challengeGW = await getNextChallengeableGW();
    const challengeCount = await db.getUserH2HChallengeCountForGW(req.userId, challengeGW);
    res.json({ currentGameweek: currentGW, challengeGameweek: challengeGW, userChallengesThisGW: challengeCount, maxChallenges: 2 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get H2H info' });
  }
});

// Get single H2H challenge detail
app.get('/api/h2h/:id', authenticateToken, async (req, res) => {
  try {
    const challenge = await db.getH2HChallenge(parseInt(req.params.id));
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const challengerPreds = await db.getUserPredictions(challenge.challenger_id);
    const opponentPreds = await db.getUserPredictions(challenge.opponent_id);

    const gwChallengerPreds = challengerPreds.filter(p => p.gameweek === challenge.gameweek);
    const gwOpponentPreds = opponentPreds.filter(p => p.gameweek === challenge.gameweek);

    res.json({
      ...challenge,
      challengerPredictions: gwChallengerPreds,
      opponentPredictions: gwOpponentPreds
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

// ===== NOTIFICATION ENDPOINTS =====

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await db.getUserNotifications(req.userId);
    const unread = await db.getUnreadNotificationCount(req.userId);
    res.json({ notifications, unreadCount: unread });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.post('/api/notifications/read', authenticateToken, async (req, res) => {
  try {
    await db.markNotificationsRead(req.userId);
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notifications' });
  }
});

app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await db.markNotificationRead(parseInt(req.params.id), req.userId);
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification' });
  }
});

// ===== PREDICTION REVEAL ENDPOINT =====

app.get('/api/predictions/reveal/:gameweek', async (req, res) => {
  try {
    const gameweek = parseInt(req.params.gameweek);

    // Only reveal predictions if the deadline has passed
    const matches = await fetchPremierLeagueMatches(gameweek);
    const gameweekMatches = matches.filter(m => m.gameweek === gameweek);
    const deadline = calculateGameweekDeadline(gameweekMatches);

    if (new Date() < new Date(deadline)) {
      return res.status(403).json({ error: 'Predictions are hidden until the deadline passes', locked: true });
    }

    const predictions = await db.getGameweekPredictions(gameweek);

    // Group predictions by match
    const byMatch = {};
    predictions.forEach(p => {
      if (!byMatch[p.matchId]) byMatch[p.matchId] = [];
      byMatch[p.matchId].push(p);
    });

    res.json({ gameweek, predictions: byMatch, matches: gameweekMatches });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

// ===== SEASON STATS ENDPOINT =====

app.get('/api/season-stats', authenticateToken, async (req, res) => {
  try {
    const allMatches = await fetchPremierLeagueMatches();
    const finishedMatches = allMatches.filter(m => m.status === 'finished');
    const userPredictions = await db.getUserPredictions(req.userId);
    const allUsers = await db.getAllUsers();
    const streak = await db.getUserStreak(req.userId);
    const user = await db.getUserById(req.userId);

    let totalPoints = 0;
    let perfectScores = 0;
    let correctResults = 0;
    let correctScorelines = 0;
    let totalPredicted = 0;
    const gameweekPoints = {};

    for (const match of finishedMatches) {
      const pred = userPredictions.find(p => p.matchId == match.id);
      if (!pred) continue;
      totalPredicted++;

      let pts = 0;
      const predHome = pred.homeScore;
      const predAway = pred.awayScore;
      const actHome = match.homeScore;
      const actAway = match.awayScore;

      if (predHome === actHome) pts++;
      if (predAway === actAway) pts++;
      const predDiff = predHome - predAway;
      const actDiff = actHome - actAway;
      if (predDiff === actDiff) pts++;
      const predResult = predHome > predAway ? 'H' : predHome < predAway ? 'A' : 'D';
      const actResult = actHome > actAway ? 'H' : actHome < actAway ? 'A' : 'D';
      if (predResult === actResult) { pts++; correctResults++; }
      if (predHome === actHome && predAway === actAway) correctScorelines++;
      if (pts === 4) perfectScores++;

      // Check doubler
      const doubler = await db.getUserDoubler(req.userId, match.gameweek);
      if (doubler && doubler.matchId == match.id) pts *= 2;

      totalPoints += pts;

      if (!gameweekPoints[match.gameweek]) gameweekPoints[match.gameweek] = { points: 0, matches: 0 };
      gameweekPoints[match.gameweek].points += pts;
      gameweekPoints[match.gameweek].matches++;
    }

    // Best and worst gameweeks
    const gwEntries = Object.entries(gameweekPoints).map(([gw, data]) => ({ gameweek: parseInt(gw), ...data }));
    gwEntries.sort((a, b) => b.points - a.points);
    const bestGW = gwEntries[0] || null;
    const worstGW = gwEntries[gwEntries.length - 1] || null;

    // Accuracy
    const maxPossible = totalPredicted * 4;
    const accuracy = maxPossible > 0 ? ((totalPoints / maxPossible) * 100).toFixed(1) : 0;

    // Rank
    const rank = allUsers.findIndex(u => u.id === req.userId) + 1;

    // Average points per gameweek
    const gwCount = gwEntries.length;
    const avgPointsPerGW = gwCount > 0 ? (totalPoints / gwCount).toFixed(1) : 0;

    res.json({
      username: user.username,
      totalPoints,
      rank,
      totalPlayers: allUsers.length,
      accuracy: parseFloat(accuracy),
      perfectScores,
      correctResults,
      correctScorelines,
      totalPredicted,
      totalFinishedMatches: finishedMatches.length,
      currentStreak: streak.current_streak,
      bestStreak: streak.best_streak,
      bestGameweek: bestGW,
      worstGameweek: worstGW,
      avgPointsPerGW: parseFloat(avgPointsPerGW),
      gameweekHistory: gwEntries.sort((a, b) => a.gameweek - b.gameweek)
    });
  } catch (error) {
    console.error('Season stats error:', error);
    res.status(500).json({ error: 'Failed to fetch season stats' });
  }
});

// ===== PUSH NOTIFICATION ENDPOINTS =====

const webpush = require('web-push');

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@plpredictions.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
  console.log('Web Push configured with VAPID keys');
}

// Get VAPID public key for frontend
app.get('/api/push/vapid-public-key', (req, res) => {
  if (!vapidPublicKey) {
    return res.status(500).json({ error: 'Push notifications not configured' });
  }
  res.json({ publicKey: vapidPublicKey });
});

// Subscribe to push notifications
app.post('/api/push/subscribe', authenticateToken, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    await db.savePushSubscription(
      req.userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth
    );
    res.json({ message: 'Subscribed to push notifications' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe from push notifications
app.post('/api/push/unsubscribe', authenticateToken, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await db.removePushSubscription(endpoint);
    }
    res.json({ message: 'Unsubscribed from push notifications' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Send push notification to a specific user
async function sendPushToUser(userId, title, body, url, extra = {}) {
  if (!vapidPublicKey || !vapidPrivateKey) return;
  try {
    const subscriptions = await db.getUserPushSubscriptions(userId);
    const payload = JSON.stringify({ title, body, url: url || '/', ...extra });
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth }
        }, payload);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.removePushSubscription(sub.endpoint);
        }
      }
    }
  } catch (e) {
    console.error('Push notification error:', e);
  }
}

// Send push to all users (e.g., deadline reminders)
async function sendPushToAll(title, body, url, extra = {}) {
  if (!vapidPublicKey || !vapidPrivateKey) return;
  try {
    const subscriptions = await db.getAllPushSubscriptions();
    const payload = JSON.stringify({ title, body, url: url || '/', ...extra });
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth }
        }, payload);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.removePushSubscription(sub.endpoint);
        }
      }
    }
  } catch (e) {
    console.error('Broadcast push error:', e);
  }
}

// Admin endpoint to test push notifications
app.post('/api/push/test', authenticateToken, async (req, res) => {
  try {
    await sendPushToUser(req.userId, 'Test Notification', 'Push notifications are working!', '/');
    res.json({ message: 'Test notification sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// ===== PRO SUBSCRIPTION ENDPOINTS =====

// Get subscription status
app.get('/api/subscription/status', authenticateToken, async (req, res) => {
  try {
    const subscription = await db.getUserSubscription(req.userId);
    if (subscription && subscription.status === 'active') {
      const isExpired = subscription.expires_at && new Date(subscription.expires_at) < new Date();
      if (isExpired) {
        await db.updateSubscriptionStatus(req.userId, 'expired');
        return res.json({ isPro: false });
      }
      return res.json({
        isPro: true,
        plan: subscription.plan,
        subscribedAt: subscription.created_at,
        expiresAt: subscription.expires_at
      });
    }
    res.json({ isPro: false });
  } catch (error) {
    console.error('Subscription status error:', error);
    res.json({ isPro: false });
  }
});

// Create checkout session (Stripe or demo mode)
app.post('/api/subscription/create-checkout', authenticateToken, async (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    
    if (stripeKey && stripeKey !== 'your-stripe-key-here') {
      // Real Stripe integration
      const stripe = require('stripe')(stripeKey);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'PL Predictions Pro',
              description: 'Monthly Pro subscription with exclusive features'
            },
            unit_amount: 300, // $3.00
            recurring: { interval: 'month' }
          },
          quantity: 1
        }],
        mode: 'subscription',
        success_url: `${req.protocol}://${req.get('host')}/?pro=success`,
        cancel_url: `${req.protocol}://${req.get('host')}/?pro=cancel`,
        client_reference_id: String(req.userId)
      });
      return res.json({ url: session.url });
    }
    
    // Demo mode - activate pro immediately for testing
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    await db.createOrUpdateSubscription(req.userId, 'pro_monthly', 'active', 'demo', expiresAt.toISOString());
    res.json({ message: 'Pro activated! (Demo mode - configure STRIPE_SECRET_KEY for real payments)' });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook for payment confirmation
app.post('/api/subscription/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeKey || !webhookSecret) return res.status(400).send('Webhook not configured');
    
    const stripe = require('stripe')(stripeKey);
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = parseInt(session.client_reference_id);
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      await db.createOrUpdateSubscription(userId, 'pro_monthly', 'active', session.subscription, expiresAt.toISOString());
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      // Find user by stripe subscription ID and deactivate
      await db.deactivateSubscriptionByStripeId(subscription.id);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send('Webhook Error');
  }
});

// Manage subscription
app.post('/api/subscription/manage', authenticateToken, async (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const subscription = await db.getUserSubscription(req.userId);
    
    if (stripeKey && subscription && subscription.stripe_subscription_id && subscription.stripe_subscription_id !== 'demo') {
      const stripe = require('stripe')(stripeKey);
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: subscription.stripe_customer_id,
        return_url: `${req.protocol}://${req.get('host')}/`
      });
      return res.json({ url: portalSession.url });
    }
    
    // Demo mode - just cancel
    if (subscription) {
      await db.updateSubscriptionStatus(req.userId, 'cancelled');
      return res.json({ message: 'Subscription cancelled (demo mode)' });
    }
    
    res.json({ message: 'No active subscription found' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to manage subscription' });
  }
});

// Socket.io for real-time updates
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Function to calculate points based on new scoring system
const calculatePoints = (prediction, actualHomeScore, actualAwayScore) => {
  let points = 0;
  const predHomeScore = prediction.homeScore;
  const predAwayScore = prediction.awayScore;
  
  // 1. Correct home team score (1 point)
  if (predHomeScore === actualHomeScore) {
    points += 1;
  }
  
  // 2. Correct away team score (1 point)
  if (predAwayScore === actualAwayScore) {
    points += 1;
  }
  
  // 3. Correct goal difference (1 point)
  const predDiff = predHomeScore - predAwayScore;
  const actualDiff = actualHomeScore - actualAwayScore;
  if (predDiff === actualDiff) {
    points += 1;
  }
  
  // 4. Correct result - win/draw/loss (1 point)
  const predResult = predHomeScore > predAwayScore ? 'home' : 
                    predHomeScore < predAwayScore ? 'away' : 'draw';
  const actualResult = actualHomeScore > actualAwayScore ? 'home' : 
                      actualHomeScore < actualAwayScore ? 'away' : 'draw';
  if (predResult === actualResult) {
    points += 1;
  }
  
  // Double points if this is the user's doubler for the gameweek
  if (prediction.isDoubler) {
    points *= 2;
  }
  
  return points;
};

// Function to update match results and calculate points
const updateMatchResults = (matchId, homeScore, awayScore) => {
  // Find all predictions for this match
  const matchPredictions = predictions.filter(p => p.matchId === matchId);
  
  // Calculate points for each prediction
  matchPredictions.forEach(prediction => {
    const points = calculatePoints(prediction, homeScore, awayScore);
    prediction.points = points;
    
    // Update user's total score
    const user = users.find(u => u.id === prediction.userId);
    if (user) {
      // Remove old points for this prediction and add new points
      const oldPoints = prediction.oldPoints || 0;
      user.score = user.score - oldPoints + points;
      prediction.oldPoints = points;
    }
  });
  
  // Emit real-time update to all connected clients
  io.emit('matchResult', {
    matchId,
    homeScore,
    awayScore,
    updatedLeaderboard: users.map(u => ({ username: u.username, score: u.score }))
                           .sort((a, b) => b.score - a.score)
  });
};

// ===== NOTIFICATION SCHEDULER =====
// Checks every 60 seconds for matches about to start, and sends weekly reminders.
const notificationState = {
  notifiedMatchIds: new Set(),  // track which match-start notifications already sent
  lastWeeklyReminder: 0         // timestamp of last weekly reminder
};

const startNotificationScheduler = () => {
  // Check every 60 seconds
  setInterval(async () => {
    try {
      const allMatches = matchCache.allMatches;
      if (!allMatches) return;
      const now = new Date();
      
      // --- Match start notifications (5 min before kickoff) ---
      for (const match of allMatches) {
        if (notificationState.notifiedMatchIds.has(match.id)) continue;
        const kickoff = new Date(match.date);
        const diffMin = (kickoff - now) / 60000;
        // Notify if match starts in the next 5 minutes
        if (diffMin > 0 && diffMin <= 5 && match.status === 'upcoming') {
          notificationState.notifiedMatchIds.add(match.id);
          const title = '⚽ Match Starting!';
          const body = `${match.homeTeam} vs ${match.awayTeam} kicks off in ${Math.ceil(diffMin)} min!`;
          const payload = JSON.stringify({
            title, body, url: '/',
            sound: 'football',     // tells service worker to play sound
            tag: `match-${match.id}`
          });
          // Send to all subscribed users
          if (vapidPublicKey && vapidPrivateKey) {
            const subs = await db.getAllPushSubscriptions();
            for (const sub of subs) {
              try {
                await webpush.sendNotification({
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth }
                }, payload);
              } catch (err) {
                if (err.statusCode === 404 || err.statusCode === 410) {
                  await db.removePushSubscription(sub.endpoint);
                }
              }
            }
          }
          // Also emit via socket for in-app notification
          io.emit('matchStarting', { matchId: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam });
          console.log(`[Notify] Match starting: ${match.homeTeam} vs ${match.awayTeam}`);
        }
      }
      
      // --- Process H2H challenges (expire pending, score completed) ---
      await processH2HChallenges();

      // --- Weekly prediction reminder (once per day, on Monday/Tuesday/Wednesday) ---
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
      const hourOfDay = now.getHours();
      const daysSinceLastReminder = (now - notificationState.lastWeeklyReminder) / (1000 * 60 * 60 * 24);
      
      // Send reminder on Wednesday at ~10am if not sent in last 5 days
      if (dayOfWeek === 3 && hourOfDay >= 10 && hourOfDay < 11 && daysSinceLastReminder > 5) {
        notificationState.lastWeeklyReminder = Date.now();
        // Find next upcoming gameweek
        const upcomingGw = allMatches.find(m => m.status === 'upcoming');
        if (upcomingGw) {
          const title = '🏟️ Time to Predict!';
          const body = `Gameweek ${upcomingGw.gameweek} matches are coming up. Don't forget to submit your predictions!`;
          await sendPushToAll(title, body, '/');
          console.log(`[Notify] Weekly reminder sent for GW${upcomingGw.gameweek}`);
        }
      }
    } catch (err) {
      console.error('[Notify] Scheduler error:', err.message);
    }
  }, 60 * 1000); // every 60 seconds
  console.log('[Notify] Notification scheduler started');
};

const PORT = process.env.PORT || 3000;
const IS_VERCEL = !!process.env.VERCEL;

// Initialize DB + background tasks
async function initApp() {
  try {
    await db.initDatabase();
    dbReady = true;
    console.log('Database initialized successfully');
    
    // On Vercel, cron endpoints handle cache + notifications via HTTP.
    // On local/Railway, use setInterval-based schedulers.
    if (!IS_VERCEL) {
      startMatchCacheRefresh();
      startNotificationScheduler();
    }
    
    console.log(`Full app ready for connections`);
  } catch (error) {
    console.error('Database initialization failed:', error);
    dbReady = false;
  }
}

if (!IS_VERCEL) {
  // Local / Railway: start HTTP server normally
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check endpoint ready at /`);
    initApp();
  });
} else {
  // Vercel serverless: init DB eagerly, export app for @vercel/node
  initApp();
}

// Graceful shutdown (local only)
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

// Export for Vercel serverless
module.exports = app;
