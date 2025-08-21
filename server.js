const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const axios = require('axios');
const cors = require('cors');
const db = require('./database');
require('dotenv').config();

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

// Health check endpoint for Railway
app.get('/', (req, res) => {
  res.status(200).send('OK - Premier League Predictions App is running!');
});

// Database storage initialized
// Users, predictions, and doublers now stored in SQLite database

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Register endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
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

// Function to fetch Premier League matches from API
const fetchPremierLeagueMatches = async (gameweek = null) => {
  try {
    const apiKey = process.env.FOOTBALL_API_KEY;
    
    if (!apiKey || apiKey === 'your-api-key-here') {
      console.log('Using mock data - no API key configured');
      return generateMockSeasonData(gameweek);
    }
    
    console.log('Attempting API call with key:', apiKey.substring(0, 8) + '...');
    
    // Real API call to Football-Data.org - Current season 2025-26
    const season = '2025'; // Premier League 2025-26 season
    const url = gameweek 
      ? `https://api.football-data.org/v4/competitions/PL/matches?season=${season}&matchday=${gameweek}`
      : `https://api.football-data.org/v4/competitions/PL/matches?season=${season}`;
    
    console.log('API URL:', url);
    
    const response = await axios.get(url, {
      headers: {
        'X-Auth-Token': apiKey
      },
      timeout: 10000
    });
    
    console.log('API Response status:', response.status);
    console.log('Matches found:', response.data.matches?.length || 0);
    
    if (!response.data.matches || response.data.matches.length === 0) {
      console.log('No matches found in API response, using mock data');
      return generateMockSeasonData(gameweek);
    }
    
    return response.data.matches.map((match, index) => ({
      id: match.id,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      date: match.utcDate,
      status: match.status === 'FINISHED' ? 'finished' : 
              match.status === 'IN_PLAY' ? 'live' : 'upcoming',
      homeScore: match.score.fullTime.home,
      awayScore: match.score.fullTime.away,
      gameweek: match.matchday
    }));
  } catch (error) {
    console.error('API Error Details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    console.log('Falling back to mock data');
    return generateMockSeasonData(gameweek);
  }
};

// Generate mock season data for testing
const generateMockSeasonData = (gameweek = null) => {
  const teams = [
    'Arsenal', 'Manchester City', 'Liverpool', 'Chelsea', 'Manchester United',
    'Tottenham', 'Newcastle', 'Brighton', 'Aston Villa', 'West Ham',
    'Crystal Palace', 'Fulham', 'Wolves', 'Everton', 'Brentford',
    'Nottingham Forest', 'Luton Town', 'Burnley', 'Sheffield United', 'Bournemouth'
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

// Calculate deadline for a gameweek (12 hours before first match)
const calculateGameweekDeadline = (matches) => {
  if (!matches.length) return null;
  
  const firstMatch = matches.reduce((earliest, match) => {
    return new Date(match.date) < new Date(earliest.date) ? match : earliest;
  });
  
  const deadline = new Date(firstMatch.date);
  deadline.setHours(deadline.getHours() - 12);
  
  return deadline.toISOString();
};

// Get matches for specific gameweek or all matches
app.get('/api/matches', async (req, res) => {
  try {
    console.log('Matches endpoint called with gameweek:', req.query.gameweek);
    const gameweek = req.query.gameweek ? parseInt(req.query.gameweek) : null;
    const matches = await fetchPremierLeagueMatches(gameweek);
    
    console.log('Fetched matches count:', matches?.length || 0);
    
    if (gameweek) {
      const gameweekMatches = matches.filter(m => m.gameweek === gameweek);
      const deadline = calculateGameweekDeadline(gameweekMatches);
      
      console.log('Gameweek matches:', gameweekMatches.length);
      
      res.json({
        matches: gameweekMatches,
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
    
    // Save prediction to database
    await db.savePrediction(req.userId, matchId, parseInt(homeScore), parseInt(awayScore), isDoubler, gameweek);
    
    // Handle doubler logic
    if (isDoubler) {
      await db.saveDoubler(req.userId, gameweek, matchId);
    }
    
    res.json({ message: 'Prediction saved successfully' });
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
          let matchScore = calculateScore(prediction, match);
          
          // Check if this was a doubler match
          const doubler = await db.getUserDoubler(user.id, match.gameweek);
          if (doubler && doubler.matchId == match.id) {
            matchScore *= 2;
          }
          
          totalScore += matchScore;
        }
      }
      
      // Update user score in database
      await db.updateUserScore(user.id, totalScore);
      
      // Add user to leaderboard regardless of score
      leaderboard.push({
        id: user.id,
        username: user.username,
        score: totalScore,
        predictions: allPredictions.filter(p => p.userId === user.id).length
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
    res.json(userPredictions);
  } catch (error) {
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

const PORT = process.env.PORT || 3000;

// Initialize database and start server
db.initDatabase()
  .then(() => {
    console.log('Database initialized successfully');
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`Binding to 0.0.0.0:${PORT}`);
      console.log(`Health check endpoint available at /`);
      console.log(`Server ready for connections`);
    });
  })
  .catch(error => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});
