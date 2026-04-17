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
      )`);

      // Leagues table
      db.run(`CREATE TABLE IF NOT EXISTS leagues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        invite_code TEXT UNIQUE NOT NULL,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`);

      // League members table
      db.run(`CREATE TABLE IF NOT EXISTS league_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        league_id INTEGER,
        user_id INTEGER,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (league_id) REFERENCES leagues(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(league_id, user_id)
      )`);

      // User badges table
      db.run(`CREATE TABLE IF NOT EXISTS user_badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        badge_key TEXT NOT NULL,
        earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, badge_key)
      )`);

      // User streaks table
      db.run(`CREATE TABLE IF NOT EXISTS user_streaks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        current_streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        last_correct_gameweek INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      // Weekly winners table
      db.run(`CREATE TABLE IF NOT EXISTS weekly_winners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gameweek INTEGER UNIQUE,
        user_id INTEGER,
        score INTEGER,
        declared_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      // Head-to-head challenges table
      db.run(`CREATE TABLE IF NOT EXISTS h2h_challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenger_id INTEGER NOT NULL,
        opponent_id INTEGER NOT NULL,
        gameweek INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        challenger_score INTEGER DEFAULT 0,
        opponent_score INTEGER DEFAULT 0,
        winner_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (challenger_id) REFERENCES users(id),
        FOREIGN KEY (opponent_id) REFERENCES users(id),
        UNIQUE(challenger_id, opponent_id, gameweek)
      )`);

      // Notifications table
      db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      // Push subscriptions table
      db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        keys_p256dh TEXT NOT NULL,
        keys_auth TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      // Subscriptions table
      db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        plan TEXT NOT NULL DEFAULT 'pro_monthly',
        status TEXT NOT NULL DEFAULT 'active',
        stripe_subscription_id TEXT,
        stripe_customer_id TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
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

// Clear doubler flag from all predictions in a gameweek for a user
const clearDoublerFlags = (userId, gameweek) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE predictions SET is_doubler = 0 WHERE user_id = ? AND gameweek = ?',
      [userId, gameweek],
      function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
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

// ===== LEAGUE OPERATIONS =====

const createLeague = (name, inviteCode, createdBy) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO leagues (name, invite_code, created_by) VALUES (?, ?, ?)',
      [name, inviteCode, createdBy],
      function(err) {
        if (err) reject(err);
        else {
          // Auto-add creator as member
          db.run(
            'INSERT INTO league_members (league_id, user_id) VALUES (?, ?)',
            [this.lastID, createdBy],
            (memberErr) => {
              if (memberErr) reject(memberErr);
              else resolve({ id: this.lastID, name, inviteCode });
            }
          );
        }
      }
    );
  });
};

const joinLeague = (inviteCode, userId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM leagues WHERE invite_code = ?', [inviteCode], (err, league) => {
      if (err) return reject(err);
      if (!league) return reject(new Error('League not found'));
      db.run(
        'INSERT INTO league_members (league_id, user_id) VALUES (?, ?)',
        [league.id, userId],
        function(memberErr) {
          if (memberErr) {
            if (memberErr.message.includes('UNIQUE')) return reject(new Error('Already in this league'));
            return reject(memberErr);
          }
          resolve({ leagueId: league.id, name: league.name });
        }
      );
    });
  });
};

const getUserLeagues = (userId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT l.*, lm.joined_at, u.username as creator_name,
       (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count
       FROM leagues l
       JOIN league_members lm ON l.id = lm.league_id
       JOIN users u ON l.created_by = u.id
       WHERE lm.user_id = ?`,
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

const getLeagueById = (leagueId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM leagues WHERE id = ?', [leagueId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const getLeagueMembers = (leagueId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT u.id, u.username, u.score FROM users u
       JOIN league_members lm ON u.id = lm.user_id
       WHERE lm.league_id = ?
       ORDER BY u.score DESC`,
      [leagueId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

// ===== STREAK OPERATIONS =====

const getUserStreak = (userId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM user_streaks WHERE user_id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row || { current_streak: 0, best_streak: 0, last_correct_gameweek: 0 });
    });
  });
};

const updateUserStreak = (userId, currentStreak, bestStreak, lastCorrectGameweek) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO user_streaks (user_id, current_streak, best_streak, last_correct_gameweek)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
       current_streak = excluded.current_streak,
       best_streak = excluded.best_streak,
       last_correct_gameweek = excluded.last_correct_gameweek`,
      [userId, currentStreak, bestStreak, lastCorrectGameweek],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

// ===== BADGE OPERATIONS =====

const awardBadge = (userId, badgeKey) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR IGNORE INTO user_badges (user_id, badge_key) VALUES (?, ?)',
      [userId, badgeKey],
      function(err) {
        if (err) reject(err);
        else resolve({ awarded: this.changes > 0 });
      }
    );
  });
};

const getUserBadges = (userId) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT badge_key, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at DESC',
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

// ===== WEEKLY WINNER OPERATIONS =====

const setWeeklyWinner = (gameweek, userId, score) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO weekly_winners (gameweek, user_id, score) VALUES (?, ?, ?)`,
      [gameweek, userId, score],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

const getWeeklyWinner = (gameweek) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT ww.*, u.username FROM weekly_winners ww
       JOIN users u ON ww.user_id = u.id
       WHERE ww.gameweek = ?`,
      [gameweek],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

const getAllWeeklyWinners = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT ww.*, u.username FROM weekly_winners ww
       JOIN users u ON ww.user_id = u.id
       ORDER BY ww.gameweek DESC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

// ===== STATS HELPERS =====

const getUserPredictionCount = (userId) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT COUNT(*) as count FROM predictions WHERE user_id = ?',
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      }
    );
  });
};

const getLeagueLeaderboard = (leagueId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT u.id, u.username, u.score,
       (SELECT COUNT(*) FROM predictions WHERE user_id = u.id) as predictions
       FROM users u
       JOIN league_members lm ON u.id = lm.user_id
       WHERE lm.league_id = ?
       ORDER BY u.score DESC`,
      [leagueId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

// ===== HEAD-TO-HEAD OPERATIONS =====

const createH2HChallenge = (challengerId, opponentId, gameweek) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO h2h_challenges (challenger_id, opponent_id, gameweek, status) VALUES (?, ?, ?, 'pending')`,
      [challengerId, opponentId, gameweek],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) return reject(new Error('Challenge already exists for this gameweek'));
          return reject(err);
        }
        resolve({ id: this.lastID });
      }
    );
  });
};

const acceptH2HChallenge = (challengeId, userId) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE h2h_challenges SET status = 'accepted' WHERE id = ? AND opponent_id = ? AND status = 'pending'`,
      [challengeId, userId],
      function(err) {
        if (err) return reject(err);
        if (this.changes === 0) return reject(new Error('Challenge not found or already accepted'));
        resolve();
      }
    );
  });
};

const declineH2HChallenge = (challengeId, userId) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE h2h_challenges SET status = 'declined' WHERE id = ? AND opponent_id = ? AND status = 'pending'`,
      [challengeId, userId],
      function(err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
};

const getUserH2HChallenges = (userId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT h.*,
        c.username as challenger_name,
        o.username as opponent_name,
        w.username as winner_name
       FROM h2h_challenges h
       JOIN users c ON h.challenger_id = c.id
       JOIN users o ON h.opponent_id = o.id
       LEFT JOIN users w ON h.winner_id = w.id
       WHERE h.challenger_id = ? OR h.opponent_id = ?
       ORDER BY h.created_at DESC`,
      [userId, userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

const getH2HChallenge = (challengeId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT h.*,
        c.username as challenger_name,
        o.username as opponent_name
       FROM h2h_challenges h
       JOIN users c ON h.challenger_id = c.id
       JOIN users o ON h.opponent_id = o.id
       WHERE h.id = ?`,
      [challengeId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

const updateH2HScores = (challengeId, challengerScore, opponentScore, winnerId) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE h2h_challenges SET challenger_score = ?, opponent_score = ?, winner_id = ?, status = 'completed' WHERE id = ?`,
      [challengerScore, opponentScore, winnerId, challengeId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

// ===== NOTIFICATION OPERATIONS =====

const createNotification = (userId, type, title, message, data = null) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO notifications (user_id, type, title, message, data) VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, message, data ? JSON.stringify(data) : null],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
};

const getUserNotifications = (userId, limit = 30) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => ({ ...r, data: r.data ? JSON.parse(r.data) : null })));
      }
    );
  });
};

const getUnreadNotificationCount = (userId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      }
    );
  });
};

const markNotificationsRead = (userId) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
      [userId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

const markNotificationRead = (notificationId, userId) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [notificationId, userId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

// ===== PREDICTION REVEAL OPERATIONS =====

const getGameweekPredictions = (gameweek) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT p.*, u.username FROM predictions p
       JOIN users u ON p.user_id = u.id
       WHERE p.gameweek = ?
       ORDER BY u.username`,
      [gameweek],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => ({
          userId: r.user_id,
          username: r.username,
          matchId: r.match_id,
          homeScore: r.home_score,
          awayScore: r.away_score,
          isDoubler: r.is_doubler,
          gameweek: r.gameweek
        })));
      }
    );
  });
};

// ===== SEASON STATS OPERATIONS =====

const getUserGameweekScores = (userId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT gameweek, SUM(home_score) as totalHomePred, SUM(away_score) as totalAwayPred,
       COUNT(*) as matchesPredicted
       FROM predictions WHERE user_id = ? GROUP BY gameweek ORDER BY gameweek`,
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

const searchUsers = (query) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, username, score FROM users WHERE username LIKE ? LIMIT 20`,
      [`%${query}%`],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

// ===== PUSH SUBSCRIPTION OPERATIONS =====

const savePushSubscription = (userId, endpoint, p256dh, auth) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         keys_p256dh = excluded.keys_p256dh,
         keys_auth = excluded.keys_auth`,
      [userId, endpoint, p256dh, auth],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
};

const getUserPushSubscriptions = (userId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM push_subscriptions WHERE user_id = ?`,
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
};

const getAllPushSubscriptions = () => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM push_subscriptions`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

const removePushSubscription = (endpoint) => {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [endpoint], function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
};

// ===== SUBSCRIPTION OPERATIONS =====

const getUserSubscription = (userId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM subscriptions WHERE user_id = ?`,
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
};

const createOrUpdateSubscription = (userId, plan, status, stripeSubId, expiresAt) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO subscriptions (user_id, plan, status, stripe_subscription_id, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         plan = excluded.plan,
         status = excluded.status,
         stripe_subscription_id = excluded.stripe_subscription_id,
         expires_at = excluded.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, plan, status, stripeSubId, expiresAt],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
};

const updateSubscriptionStatus = (userId, status) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      [status, userId],
      function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      }
    );
  });
};

const deactivateSubscriptionByStripeId = (stripeSubId) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?`,
      [stripeSubId],
      function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
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
  clearDoublerFlags,
  saveDoubler,
  getUserDoubler,
  getAllUsers,
  // Leagues
  createLeague,
  joinLeague,
  getUserLeagues,
  getLeagueById,
  getLeagueMembers,
  getLeagueLeaderboard,
  // Streaks
  getUserStreak,
  updateUserStreak,
  // Badges
  awardBadge,
  getUserBadges,
  // Weekly winners
  setWeeklyWinner,
  getWeeklyWinner,
  getAllWeeklyWinners,
  // Stats
  getUserPredictionCount,
  getUserGameweekScores,
  // H2H
  createH2HChallenge,
  acceptH2HChallenge,
  declineH2HChallenge,
  getUserH2HChallenges,
  getH2HChallenge,
  updateH2HScores,
  // Notifications
  createNotification,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationsRead,
  markNotificationRead,
  // Prediction Reveal
  getGameweekPredictions,
  // Search
  searchUsers,
  // Subscriptions
  getUserSubscription,
  createOrUpdateSubscription,
  updateSubscriptionStatus,
  deactivateSubscriptionByStripeId,
  // Push Notifications
  savePushSubscription,
  getUserPushSubscriptions,
  getAllPushSubscriptions,
  removePushSubscription
};
