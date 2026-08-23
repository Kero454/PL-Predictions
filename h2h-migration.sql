-- ===== H2H REDESIGN MIGRATION =====
-- Run this SQL in the Supabase SQL Editor.
-- This replaces the old challenge-based H2H with automatic round-robin matchups.

-- Drop old H2H table (backup data first if needed)
DROP TABLE IF EXISTS h2h_challenges;
DROP INDEX IF EXISTS idx_h2h_challenger;
DROP INDEX IF EXISTS idx_h2h_opponent;

-- New H2H matches table: stores the pre-determined schedule + results
CREATE TABLE IF NOT EXISTS h2h_matches (
  id SERIAL PRIMARY KEY,
  season INTEGER NOT NULL DEFAULT 2026,
  gameweek INTEGER NOT NULL,
  player1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player1_score INTEGER DEFAULT NULL,
  player2_score INTEGER DEFAULT NULL,
  winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  player1_used_monkey BOOLEAN DEFAULT FALSE,
  player2_used_monkey BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'scheduled',
  scored_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season, gameweek, player1_id, player2_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_h2h_matches_gw ON h2h_matches(gameweek);
CREATE INDEX IF NOT EXISTS idx_h2h_matches_p1 ON h2h_matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_h2h_matches_p2 ON h2h_matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_h2h_matches_season ON h2h_matches(season, gameweek);

-- Enable RLS
ALTER TABLE h2h_matches ENABLE ROW LEVEL SECURITY;
