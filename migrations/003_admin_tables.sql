-- First-goal overrides (admin manual entry for bonus scoring)
CREATE TABLE IF NOT EXISTS first_goal_overrides (
  match_id TEXT PRIMARY KEY,
  first_team TEXT,        -- 'home', 'away', 'none'
  first_scorer TEXT       -- player name or NULL
);

-- Score adjustments (manual corrections per user)
CREATE TABLE IF NOT EXISTS score_adjustments (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  adjustment INTEGER NOT NULL DEFAULT 0
);

-- User titles (badge titles)
CREATE TABLE IF NOT EXISTS user_titles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  title_key TEXT NOT NULL
);

-- Seed score adjustments: adjustment = desired_GW2_total - calculated_GW1_GW2
-- Jona=56-21=35, Matha=54-36=18, Sevo=53-38=15, Kero=39-22=17, Luka=36-22=14
INSERT INTO score_adjustments (user_id, adjustment) VALUES
  (4, 35), (5, 18), (8, 15), (1, 17), (7, 14)
ON CONFLICT (user_id) DO UPDATE SET adjustment = EXCLUDED.adjustment;
