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

-- Seed existing score adjustments (from previous JSON file)
INSERT INTO score_adjustments (user_id, adjustment) VALUES
  (4, 37), (5, 12), (8, 12), (1, 10), (7, 9)
ON CONFLICT (user_id) DO UPDATE SET adjustment = EXCLUDED.adjustment;
