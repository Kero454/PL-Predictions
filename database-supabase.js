// ===== SUPABASE DATABASE LAYER =====
// Drop-in replacement for database.js (SQLite) — uses @supabase/supabase-js
// Set SUPABASE_URL and SUPABASE_SERVICE_KEY in your environment variables.

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // use service role key server-side
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize database (tables created via migration SQL — this is a no-op for Supabase)
const initDatabase = () => {
  return new Promise((resolve) => {
    console.log('Supabase client initialized');
    resolve();
  });
};

// ===== USER OPERATIONS =====

const createUser = async (username, password) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('users')
    .insert({ username, password: hashedPassword, score: 0 })
    .select('id, username, score')
    .single();
  if (error) throw error;
  return data;
};

const getUserByUsername = async (username) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
};

const getUserById = async (id) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
};

const updateUserScore = async (userId, score) => {
  const { error } = await supabase
    .from('users')
    .update({ score })
    .eq('id', userId);
  if (error) throw error;
};

// ===== PREDICTION OPERATIONS =====

const savePrediction = async (userId, matchId, homeScore, awayScore, isDoubler, gameweek) => {
  const { data, error } = await supabase
    .from('predictions')
    .upsert(
      {
        user_id: userId,
        match_id: String(matchId),
        home_score: homeScore,
        away_score: awayScore,
        is_doubler: !!isDoubler,
        gameweek,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,match_id' }
    )
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
};

const _mapPrediction = (row) => ({
  id: row.id,
  userId: row.user_id,
  matchId: row.match_id,
  homeScore: row.home_score,
  awayScore: row.away_score,
  isDoubler: row.is_doubler,
  gameweek: row.gameweek
});

const getUserPredictions = async (userId) => {
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(_mapPrediction);
};

const getAllPredictions = async () => {
  const { data, error } = await supabase
    .from('predictions')
    .select('*');
  if (error) throw error;
  return (data || []).map(_mapPrediction);
};

const clearDoublerFlags = async (userId, gameweek) => {
  const { data, error } = await supabase
    .from('predictions')
    .update({ is_doubler: false })
    .eq('user_id', userId)
    .eq('gameweek', gameweek);
  if (error) throw error;
  return { changes: data ? data.length : 0 };
};

// ===== DOUBLER OPERATIONS =====

const saveDoubler = async (userId, gameweek, matchId) => {
  const { data, error } = await supabase
    .from('doublers')
    .upsert(
      { user_id: userId, gameweek, match_id: String(matchId) },
      { onConflict: 'user_id,gameweek' }
    )
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
};

const getUserDoubler = async (userId, gameweek) => {
  const { data, error } = await supabase
    .from('doublers')
    .select('match_id')
    .eq('user_id', userId)
    .eq('gameweek', gameweek)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ? { matchId: data.match_id } : null;
};

// ===== LEADERBOARD =====

const getAllUsers = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, score')
    .order('score', { ascending: false });
  if (error) throw error;
  return data || [];
};

// ===== LEAGUE OPERATIONS =====

const createLeague = async (name, inviteCode, createdBy) => {
  const { data: league, error } = await supabase
    .from('leagues')
    .insert({ name, invite_code: inviteCode, created_by: createdBy })
    .select('id, name, invite_code')
    .single();
  if (error) throw error;

  await supabase
    .from('league_members')
    .insert({ league_id: league.id, user_id: createdBy });

  return { id: league.id, name: league.name, inviteCode: league.invite_code };
};

const joinLeague = async (inviteCode, userId) => {
  const { data: league, error: leagueErr } = await supabase
    .from('leagues')
    .select('*')
    .eq('invite_code', inviteCode)
    .single();
  if (leagueErr || !league) throw new Error('League not found');

  const { error: joinErr } = await supabase
    .from('league_members')
    .insert({ league_id: league.id, user_id: userId });
  if (joinErr) {
    if (joinErr.code === '23505') throw new Error('Already in this league');
    throw joinErr;
  }
  return { leagueId: league.id, name: league.name };
};

const getUserLeagues = async (userId) => {
  const { data, error } = await supabase
    .from('league_members')
    .select(`
      joined_at,
      leagues (
        id, name, invite_code, created_by, created_at,
        users!leagues_created_by_fkey ( username )
      )
    `)
    .eq('user_id', userId);
  if (error) throw error;

  // Reshape to match SQLite format
  const result = [];
  for (const row of (data || [])) {
    const l = row.leagues;
    // Count members
    const { count } = await supabase
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', l.id);
    result.push({
      id: l.id,
      name: l.name,
      invite_code: l.invite_code,
      created_by: l.created_by,
      created_at: l.created_at,
      joined_at: row.joined_at,
      creator_name: l.users?.username || 'Unknown',
      member_count: count || 0
    });
  }
  return result;
};

const getLeagueById = async (leagueId) => {
  const { data, error } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', leagueId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
};

const getLeagueMembers = async (leagueId) => {
  const { data, error } = await supabase
    .from('league_members')
    .select('users ( id, username, score )')
    .eq('league_id', leagueId);
  if (error) throw error;
  return (data || []).map(r => r.users).sort((a, b) => b.score - a.score);
};

const getLeagueLeaderboard = async (leagueId) => {
  const { data, error } = await supabase
    .from('league_members')
    .select('users ( id, username, score )')
    .eq('league_id', leagueId);
  if (error) throw error;

  const members = (data || []).map(r => r.users);
  // Count predictions per member
  const result = [];
  for (const m of members) {
    const { count } = await supabase
      .from('predictions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', m.id);
    result.push({ ...m, predictions: count || 0 });
  }
  return result.sort((a, b) => b.score - a.score);
};

// ===== STREAK OPERATIONS =====

const getUserStreak = async (userId) => {
  const { data, error } = await supabase
    .from('user_streaks')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || { current_streak: 0, best_streak: 0, last_correct_gameweek: 0 };
};

const updateUserStreak = async (userId, currentStreak, bestStreak, lastCorrectGameweek) => {
  const { error } = await supabase
    .from('user_streaks')
    .upsert(
      { user_id: userId, current_streak: currentStreak, best_streak: bestStreak, last_correct_gameweek: lastCorrectGameweek },
      { onConflict: 'user_id' }
    );
  if (error) throw error;
};

// ===== BADGE OPERATIONS =====

const awardBadge = async (userId, badgeKey) => {
  // First check if badge already exists
  const { data: existing } = await supabase
    .from('user_badges')
    .select('id')
    .eq('user_id', userId)
    .eq('badge_key', badgeKey)
    .maybeSingle();
  
  if (existing) return { awarded: false };

  const { error } = await supabase
    .from('user_badges')
    .insert({ user_id: userId, badge_key: badgeKey });
  
  if (error && error.code === '23505') return { awarded: false }; // unique violation
  if (error) throw error;
  return { awarded: true };
};

const getUserBadges = async (userId) => {
  const { data, error } = await supabase
    .from('user_badges')
    .select('badge_key, earned_at')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

// ===== WEEKLY WINNER OPERATIONS =====

const setWeeklyWinner = async (gameweek, userId, score) => {
  const { error } = await supabase
    .from('weekly_winners')
    .upsert(
      { gameweek, user_id: userId, score },
      { onConflict: 'gameweek' }
    );
  if (error) throw error;
};

const getWeeklyWinner = async (gameweek) => {
  const { data, error } = await supabase
    .from('weekly_winners')
    .select('*, users ( username )')
    .eq('gameweek', gameweek)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;
  return { ...data, username: data.users?.username };
};

const getAllWeeklyWinners = async () => {
  const { data, error } = await supabase
    .from('weekly_winners')
    .select('*, users ( username )')
    .order('gameweek', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ ...r, username: r.users?.username }));
};

// ===== STATS HELPERS =====

const getUserPredictionCount = async (userId) => {
  const { count, error } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count || 0;
};

const getUserGameweekScores = async (userId) => {
  const { data, error } = await supabase
    .from('predictions')
    .select('gameweek, home_score, away_score')
    .eq('user_id', userId);
  if (error) throw error;

  // Group by gameweek manually (Supabase doesn't support GROUP BY in select)
  const groups = {};
  for (const row of (data || [])) {
    if (!groups[row.gameweek]) groups[row.gameweek] = { gameweek: row.gameweek, totalHomePred: 0, totalAwayPred: 0, matchesPredicted: 0 };
    groups[row.gameweek].totalHomePred += row.home_score;
    groups[row.gameweek].totalAwayPred += row.away_score;
    groups[row.gameweek].matchesPredicted++;
  }
  return Object.values(groups).sort((a, b) => a.gameweek - b.gameweek);
};

const searchUsers = async (query) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, score')
    .ilike('username', `%${query}%`)
    .limit(20);
  if (error) throw error;
  return data || [];
};

// ===== HEAD-TO-HEAD OPERATIONS =====

const createH2HChallenge = async (challengerId, opponentId, gameweek) => {
  const { data, error } = await supabase
    .from('h2h_challenges')
    .insert({ challenger_id: challengerId, opponent_id: opponentId, gameweek, status: 'pending' })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Challenge already exists for this gameweek');
    throw error;
  }
  return { id: data.id };
};

const acceptH2HChallenge = async (challengeId, userId) => {
  const { data, error } = await supabase
    .from('h2h_challenges')
    .update({ status: 'accepted' })
    .eq('id', challengeId)
    .eq('opponent_id', userId)
    .eq('status', 'pending')
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Challenge not found or already accepted');
};

const declineH2HChallenge = async (challengeId, userId) => {
  const { error } = await supabase
    .from('h2h_challenges')
    .update({ status: 'declined' })
    .eq('id', challengeId)
    .eq('opponent_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
};

const getUserH2HChallenges = async (userId) => {
  const { data, error } = await supabase
    .from('h2h_challenges')
    .select(`
      *,
      challenger:users!h2h_challenges_challenger_id_fkey ( username ),
      opponent:users!h2h_challenges_opponent_id_fkey ( username ),
      winner:users!h2h_challenges_winner_id_fkey ( username )
    `)
    .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({
    ...r,
    challenger_name: r.challenger?.username,
    opponent_name: r.opponent?.username,
    winner_name: r.winner?.username
  }));
};

const getH2HChallenge = async (challengeId) => {
  const { data, error } = await supabase
    .from('h2h_challenges')
    .select(`
      *,
      challenger:users!h2h_challenges_challenger_id_fkey ( username ),
      opponent:users!h2h_challenges_opponent_id_fkey ( username )
    `)
    .eq('id', challengeId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;
  return {
    ...data,
    challenger_name: data.challenger?.username,
    opponent_name: data.opponent?.username
  };
};

const updateH2HScores = async (challengeId, challengerScore, opponentScore, winnerId) => {
  const { error } = await supabase
    .from('h2h_challenges')
    .update({ challenger_score: challengerScore, opponent_score: opponentScore, winner_id: winnerId, status: 'completed' })
    .eq('id', challengeId);
  if (error) throw error;
};

// Expire pending H2H challenges for a given gameweek (called when GW starts)
const expirePendingH2HChallenges = async (gameweek) => {
  const { data, error } = await supabase
    .from('h2h_challenges')
    .update({ status: 'expired' })
    .eq('gameweek', gameweek)
    .eq('status', 'pending')
    .select('id');
  if (error) throw error;
  return { expired: data ? data.length : 0 };
};

// Count how many challenges a user has sent/received for a specific gameweek
const getUserH2HChallengeCountForGW = async (userId, gameweek) => {
  const { data, error } = await supabase
    .from('h2h_challenges')
    .select('id')
    .eq('gameweek', gameweek)
    .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
    .in('status', ['pending', 'accepted', 'completed']);
  if (error) throw error;
  return data ? data.length : 0;
};

// Get accepted (active) H2H challenges for a gameweek (for scoring)
const getAcceptedH2HChallengesForGW = async (gameweek) => {
  const { data, error } = await supabase
    .from('h2h_challenges')
    .select('*')
    .eq('gameweek', gameweek)
    .eq('status', 'accepted');
  if (error) throw error;
  return data || [];
};

// Get H2H leaderboard: aggregate points from completed challenges
// Winner = 3 pts, Draw = 1 pt each, Loser = 0 pts
const getH2HLeaderboard = async () => {
  const { data, error } = await supabase
    .from('h2h_challenges')
    .select(`
      challenger_id, opponent_id, challenger_score, opponent_score, winner_id,
      challenger:users!h2h_challenges_challenger_id_fkey ( username ),
      opponent:users!h2h_challenges_opponent_id_fkey ( username )
    `)
    .eq('status', 'completed');
  if (error) throw error;

  const points = {};
  const stats = {};

  const ensure = (id, name) => {
    if (!points[id]) {
      points[id] = 0;
      stats[id] = { username: name, wins: 0, draws: 0, losses: 0, played: 0 };
    }
  };

  (data || []).forEach(c => {
    const cName = c.challenger?.username || 'Unknown';
    const oName = c.opponent?.username || 'Unknown';
    ensure(c.challenger_id, cName);
    ensure(c.opponent_id, oName);
    stats[c.challenger_id].played++;
    stats[c.opponent_id].played++;

    if (c.winner_id === null) {
      // Draw
      points[c.challenger_id] += 1;
      points[c.opponent_id] += 1;
      stats[c.challenger_id].draws++;
      stats[c.opponent_id].draws++;
    } else if (c.winner_id === c.challenger_id) {
      points[c.challenger_id] += 3;
      stats[c.challenger_id].wins++;
      stats[c.opponent_id].losses++;
    } else {
      points[c.opponent_id] += 3;
      stats[c.opponent_id].wins++;
      stats[c.challenger_id].losses++;
    }
  });

  return Object.entries(points).map(([id, pts]) => ({
    id: parseInt(id),
    username: stats[id].username,
    glory: pts,
    wins: stats[id].wins,
    draws: stats[id].draws,
    losses: stats[id].losses,
    played: stats[id].played
  })).sort((a, b) => b.glory - a.glory);
};

// Get H2H win count for a user (for achievements)
const getUserH2HWins = async (userId) => {
  const { data, error } = await supabase
    .from('h2h_challenges')
    .select('id')
    .eq('winner_id', userId)
    .eq('status', 'completed');
  if (error) throw error;
  return data ? data.length : 0;
};

// ===== NOTIFICATION OPERATIONS =====

const createNotification = async (userId, type, title, message, data = null) => {
  const { data: row, error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, type, title, message, data: data ? JSON.stringify(data) : null })
    .select('id')
    .single();
  if (error) throw error;
  return { id: row.id };
};

const getUserNotifications = async (userId, limit = 30) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(r => ({ ...r, data: r.data ? JSON.parse(r.data) : null }));
};

const getUnreadNotificationCount = async (userId) => {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', 0);
  if (error) throw error;
  return count || 0;
};

const markNotificationsRead = async (userId) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: 1 })
    .eq('user_id', userId)
    .eq('is_read', 0);
  if (error) throw error;
};

const markNotificationRead = async (notificationId, userId) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: 1 })
    .eq('id', notificationId)
    .eq('user_id', userId);
  if (error) throw error;
};

// ===== PREDICTION REVEAL OPERATIONS =====

const getGameweekPredictions = async (gameweek) => {
  const { data, error } = await supabase
    .from('predictions')
    .select('*, users ( username )')
    .eq('gameweek', gameweek)
    .order('user_id');
  if (error) throw error;
  return (data || []).map(r => ({
    userId: r.user_id,
    username: r.users?.username,
    matchId: r.match_id,
    homeScore: r.home_score,
    awayScore: r.away_score,
    isDoubler: r.is_doubler,
    gameweek: r.gameweek
  }));
};

// ===== PUSH SUBSCRIPTION OPERATIONS =====

const savePushSubscription = async (userId, endpoint, p256dh, auth) => {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint, keys_p256dh: p256dh, keys_auth: auth },
      { onConflict: 'endpoint' }
    )
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
};

const getUserPushSubscriptions = async (userId) => {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
};

const getAllPushSubscriptions = async () => {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*');
  if (error) throw error;
  return data || [];
};

const removePushSubscription = async (endpoint) => {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);
  if (error) throw error;
  return { changes: data ? data.length : 0 };
};

// ===== SUBSCRIPTION OPERATIONS =====

const getUserSubscription = async (userId) => {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
};

const createOrUpdateSubscription = async (userId, plan, status, stripeSubId, expiresAt) => {
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan,
        status,
        stripe_subscription_id: stripeSubId,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
};

const updateSubscriptionStatus = async (userId, status) => {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
  return { changes: data ? data.length : 0 };
};

const deactivateSubscriptionByStripeId = async (stripeSubId) => {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', stripeSubId);
  if (error) throw error;
  return { changes: data ? data.length : 0 };
};

// ===== SCORE ADJUSTMENT OPERATIONS =====
// Stored in a local JSON file to avoid needing a DB column

const fs = require('fs');
const path = require('path');
const ADJUSTMENTS_FILE = path.join(__dirname, 'score-adjustments.json');

let _adjustmentsCache = null;
const loadAdjustments = () => {
  if (_adjustmentsCache) return _adjustmentsCache;
  try {
    if (fs.existsSync(ADJUSTMENTS_FILE)) {
      _adjustmentsCache = JSON.parse(fs.readFileSync(ADJUSTMENTS_FILE, 'utf8'));
    } else {
      _adjustmentsCache = {};
    }
  } catch (e) {
    _adjustmentsCache = {};
  }
  return _adjustmentsCache;
};

const setScoreAdjustment = async (userId, adjustment) => {
  const adj = loadAdjustments();
  adj[String(userId)] = adjustment;
  _adjustmentsCache = adj;
  fs.writeFileSync(ADJUSTMENTS_FILE, JSON.stringify(adj, null, 2));
};

const getScoreAdjustment = (userId) => {
  const adj = loadAdjustments();
  return adj[String(userId)] || 0;
};

// ===== USER TITLE OPERATIONS =====

const setUserTitle = async (userId, titleKey) => {
  try {
    const { error } = await supabase
      .from('users')
      .update({ title: titleKey || null })
      .eq('id', userId);
    if (error) throw error;
  } catch (e) {
    console.error('setUserTitle error (title column may not exist):', e.message);
  }
};

const getUserTitle = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('title')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data ? data.title : null;
  } catch (e) {
    return null;
  }
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
  expirePendingH2HChallenges,
  getUserH2HChallengeCountForGW,
  getAcceptedH2HChallengesForGW,
  getH2HLeaderboard,
  getUserH2HWins,
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
  removePushSubscription,
  // Score adjustments
  setScoreAdjustment,
  getScoreAdjustment,
  // Titles
  setUserTitle,
  getUserTitle
};
