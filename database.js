const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

// Create database connection
const dbPath = path.join(__dirname, 'predictions.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Predictions table
      db.run(`CREATE TABLE IF NOT EXISTS predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        match_id TEXT,
        home_score INTEGER,
        away_score INTEGER,
        is_doubler BOOLEAN DEFAULT 0,
        gameweek INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, match_id)
      )`);

      // Doublers table
      db.run(`CREATE TABLE IF NOT EXISTS doublers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        gameweek INTEGER,
        match_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, gameweek)
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
};

// User operations
const createUser = (username, password) => {
  return new Promise(async (resolve, reject) => {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      db.run(
        'INSERT INTO users (username, password) VALUES (?, ?)',
        [username, hashedPassword],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, username, score: 0 });
        }
      );
    } catch (error) {
      reject(error);
    }
  });
};

const getUserByUsername = (username) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM users WHERE username = ?',
      [username],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

const getUserById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM users WHERE id = ?',
      [id],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

const updateUserScore = (userId, score) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET score = ? WHERE id = ?',
      [score, userId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

// Prediction operations
const savePrediction = (userId, matchId, homeScore, awayScore, isDoubler, gameweek) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO predictions 
       (user_id, match_id, home_score, away_score, is_doubler, gameweek, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [userId, matchId, homeScore, awayScore, isDoubler, gameweek],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
};

const getUserPredictions = (userId) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM predictions WHERE user_id = ?',
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          matchId: row.match_id,
          homeScore: row.home_score,
          awayScore: row.away_score,
          isDoubler: row.is_doubler,
          gameweek: row.gameweek
        })));
      }
    );
  });
};

const getAllPredictions = () => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM predictions',
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          matchId: row.match_id,
          homeScore: row.home_score,
          awayScore: row.away_score,
          isDoubler: row.is_doubler,
          gameweek: row.gameweek
        })));
      }
    );
  });
};

// Doubler operations
const saveDoubler = (userId, gameweek, matchId) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO doublers (user_id, gameweek, match_id) VALUES (?, ?, ?)',
      [userId, gameweek, matchId],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
};

const getUserDoubler = (userId, gameweek) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM doublers WHERE user_id = ? AND gameweek = ?',
      [userId, gameweek],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? { matchId: row.match_id } : null);
      }
    );
  });
};

// Leaderboard
const getAllUsers = () => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT id, username, score FROM users ORDER BY score DESC',
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

module.exports = {
  initDatabase,
  createUser,
  getUserByUsername,
  getUserById,
  updateUserScore,
  savePrediction,
  getUserPredictions,
  getAllPredictions,
  saveDoubler,
  getUserDoubler,
  getAllUsers
};
