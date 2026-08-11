CREATE TABLE IF NOT EXISTS UserTokens (
discord_id BIGINT,
access_token VARCHAR(2048),
refresh_token VARCHAR(2048),
expires_at INTEGER,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (discord_id),
INDEX idx_expires_at (expires_at) -- Index on expires_at for quick filtering
);
CREATE TABLE IF NOT EXISTS UserStats (
discord_id BIGINT,
streak INTEGER DEFAULT 0,
times_played INTEGER DEFAULT 0,
average_guess_count DECIMAL(4,1) DEFAULT 0,
played_today BOOLEAN DEFAULT FALSE,
PRIMARY KEY (discord_id)
);

CREATE TABLE IF NOT EXISTS TodaysLeaderboard (
discord_id BIGINT,
guess_count INT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (discord_id),
INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS SplatdleChannels(
guild_id BIGINT,
channel_id BIGINT,
PRIMARY KEY (guild_id)
);

CREATE TABLE IF NOT EXISTS SplatdleReminders (
discord_id BIGINT PRIMARY KEY,
reminders_enabled BOOLEAN DEFAULT TRUE,
hours_before_reset INT DEFAULT 2,
last_reminder_sent DATETIME,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
INDEX idx_reminders_enabled (reminders_enabled),
INDEX idx_hours_before_reset (hours_before_reset)
);

CREATE TABLE IF NOT EXISTS  drafts (
guild_id BIGINT PRIMARY KEY,
channel_id BIGINT NOT NULL,
message_id BIGINT,
organizer_id BIGINT NOT NULL,
team_size INT NOT NULL,
mode VARCHAR(20) NOT NULL DEFAULT 'standard',
players JSON NOT NULL,
pairs JSON NOT NULL,
pending_invites JSON NOT NULL,
notification_channel_id BIGINT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
INDEX idx_channel (channel_id),
INDEX idx_created (created_at)
);

CREATE TABLE IF NOT EXISTS SplatdleReminders (
discord_id BIGINT PRIMARY KEY,
reminders_enabled BOOLEAN DEFAULT TRUE,
hours_before_reset INT DEFAULT 2,
last_reminder_sent DATETIME,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
INDEX idx_reminders_enabled (reminders_enabled),
INDEX idx_hours_before_reset (hours_before_reset)
);

CREATE TABLE IF NOT EXISTS confirmed_teams (
id INT AUTO_INCREMENT PRIMARY KEY,
guild_id BIGINT NOT NULL,
channel_id BIGINT NOT NULL,
teams JSON NOT NULL,
voice_category_id BIGINT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
INDEX idx_guild_created (guild_id, created_at DESC),
INDEX idx_created (created_at)
);

-- Tournament tables
CREATE TABLE IF NOT EXISTS tournaments (
id INT AUTO_INCREMENT PRIMARY KEY,
guild_id BIGINT NOT NULL,
name VARCHAR(100) NOT NULL,
status ENUM('signup','active','complete','cancelled') DEFAULT 'signup',
team_size TINYINT NOT NULL DEFAULT 4,
special_rules TEXT DEFAULT NULL,
affects_rating BOOLEAN NOT NULL DEFAULT TRUE,
channel_id BIGINT,
created_by BIGINT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
INDEX idx_guild_status (guild_id, status)
);
-- Migration for existing installs: ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS team_size TINYINT NOT NULL DEFAULT 4;
-- Migration for existing installs: ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS special_rules TEXT DEFAULT NULL;
-- Migration for existing installs: ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS affects_rating BOOLEAN NOT NULL DEFAULT TRUE;
-- Migration for existing installs: ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS rank_tier TINYINT DEFAULT NULL;
-- Migration for existing installs: ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS special_tournament_wins INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS tournament_signups (
id INT AUTO_INCREMENT PRIMARY KEY,
tournament_id INT NOT NULL,
discord_id BIGINT,
twitch_username VARCHAR(50),
display_name VARCHAR(100) NOT NULL,
assigned_team_id INT,
signed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
UNIQUE KEY unique_discord (tournament_id, discord_id),
INDEX idx_tournament (tournament_id)
);

CREATE TABLE IF NOT EXISTS tournament_teams (
id INT AUTO_INCREMENT PRIMARY KEY,
tournament_id INT NOT NULL,
team_name VARCHAR(100) NOT NULL,
seed INT NOT NULL,
captain_discord_id BIGINT,
captain_signup_id INT,
name_confirmed BOOLEAN DEFAULT FALSE,
is_pre_created BOOLEAN DEFAULT FALSE,
FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
FOREIGN KEY (captain_signup_id) REFERENCES tournament_signups(id) ON DELETE SET NULL,
INDEX idx_tournament (tournament_id)
);

CREATE TABLE IF NOT EXISTS tournament_team_members (
team_id INT NOT NULL,
signup_id INT NOT NULL,
is_sub TINYINT(1) NOT NULL DEFAULT 0,
PRIMARY KEY (team_id, signup_id),
UNIQUE KEY uq_signup_one_team (signup_id),
FOREIGN KEY (team_id) REFERENCES tournament_teams(id) ON DELETE CASCADE,
FOREIGN KEY (signup_id) REFERENCES tournament_signups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tournament_matches (
id INT AUTO_INCREMENT PRIMARY KEY,
tournament_id INT NOT NULL,
round INT NOT NULL,
match_number INT NOT NULL,
team1_id INT,
team2_id INT,
winner_id INT,
home_team_id INT DEFAULT NULL,
room_code CHAR(4) DEFAULT NULL,
status ENUM('pending','awaiting_confirmation','complete') DEFAULT 'pending',
FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
FOREIGN KEY (team1_id) REFERENCES tournament_teams(id),
FOREIGN KEY (team2_id) REFERENCES tournament_teams(id),
FOREIGN KEY (winner_id) REFERENCES tournament_teams(id),
FOREIGN KEY (home_team_id) REFERENCES tournament_teams(id),
INDEX idx_tournament_round (tournament_id, round)
);
-- Migration for existing installs:
-- ALTER TABLE tournament_matches ADD COLUMN home_team_id INT DEFAULT NULL;
-- ALTER TABLE tournament_matches ADD COLUMN room_code CHAR(4) DEFAULT NULL;
-- ALTER TABLE tournament_matches ADD FOREIGN KEY (home_team_id) REFERENCES tournament_teams(id);

CREATE TABLE IF NOT EXISTS player_profiles (
id INT AUTO_INCREMENT PRIMARY KEY,
discord_id BIGINT UNIQUE,
twitch_username VARCHAR(50),
display_name VARCHAR(100) NOT NULL,
splattag VARCHAR(30) UNIQUE,
`rank` TINYINT DEFAULT NULL,
rank_tier TINYINT DEFAULT NULL,
predicted_rank TINYINT DEFAULT NULL,
predicted_rank_tier TINYINT DEFAULT NULL,
last_rank_check DATETIME DEFAULT NULL,
twitch_native BOOLEAN NOT NULL DEFAULT FALSE,
trueskill_mu FLOAT DEFAULT 25.0,
trueskill_sigma FLOAT DEFAULT 8.333,
tournament_wins INT DEFAULT 0,
special_tournament_wins INT DEFAULT 0,
matches_won INT DEFAULT 0,
matches_lost INT DEFAULT 0,
games_won INT DEFAULT 0,
games_lost INT DEFAULT 0,
tournaments_played INT DEFAULT 0,
first_played_at DATETIME,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
INDEX idx_discord (discord_id),
INDEX idx_twitch (twitch_username),
INDEX idx_rank (`rank` DESC),
INDEX idx_mu (trueskill_mu DESC)
);
-- Migration for existing installs:
-- ALTER TABLE player_profiles ADD COLUMN predicted_rank TINYINT DEFAULT NULL;
-- ALTER TABLE player_profiles ADD COLUMN predicted_rank_tier TINYINT DEFAULT NULL;
-- ALTER TABLE player_profiles ADD COLUMN last_rank_check DATETIME DEFAULT NULL;
-- ALTER TABLE player_profiles ADD COLUMN twitch_native BOOLEAN NOT NULL DEFAULT FALSE;
-- ALTER TABLE player_profiles ADD COLUMN games_won INT DEFAULT 0;
-- ALTER TABLE player_profiles ADD COLUMN games_lost INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS tournament_match_ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  match_id INT NOT NULL,
  discord_id BIGINT NOT NULL,
  mu_before FLOAT NOT NULL,
  sigma_before FLOAT NOT NULL,
  games_won_before INT NOT NULL DEFAULT 0,
  games_lost_before INT NOT NULL DEFAULT 0,
  matches_won_before INT NOT NULL DEFAULT 0,
  matches_lost_before INT NOT NULL DEFAULT 0,
  tournament_wins_before INT NOT NULL DEFAULT 0,
  special_tournament_wins_before INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq (match_id, discord_id),
  FOREIGN KEY (match_id) REFERENCES tournament_matches(id) ON DELETE CASCADE
);
-- Migration: (run the CREATE TABLE above)

CREATE TABLE IF NOT EXISTS tournament_win_reports (
id INT AUTO_INCREMENT PRIMARY KEY,
match_id INT NOT NULL,
reported_winner_id INT NOT NULL,
reported_by_discord BIGINT,
reported_by_twitch VARCHAR(50),
confirmed_by_discord BIGINT,
confirmed_by_twitch VARCHAR(50),
status ENUM('pending','confirmed','disputed') DEFAULT 'pending',
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (match_id) REFERENCES tournament_matches(id) ON DELETE CASCADE,
FOREIGN KEY (reported_winner_id) REFERENCES tournament_teams(id)
);

CREATE TABLE IF NOT EXISTS tournament_round_schedule (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NOT NULL,
  round INT NOT NULL,
  stage_name VARCHAR(100),
  mode_id VARCHAR(30),
  mode_name VARCHAR(50),
  best_of TINYINT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_round (tournament_id, round),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);
-- Migration for existing installs: ALTER TABLE tournament_round_schedule ADD COLUMN IF NOT EXISTS best_of TINYINT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS tournament_round_games (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NOT NULL,
  round INT NOT NULL,
  game_number INT NOT NULL,
  stage_name VARCHAR(100),
  mode_id VARCHAR(30),
  mode_name VARCHAR(50),
  UNIQUE KEY uq_game (tournament_id, round, game_number),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);
-- Migration for existing installs: (run the CREATE TABLE above)
-- ALTER TABLE tournament_round_games ADD COLUMN IF NOT EXISTS mode_id VARCHAR(30);
-- ALTER TABLE tournament_round_games ADD COLUMN IF NOT EXISTS mode_name VARCHAR(50);

CREATE TABLE IF NOT EXISTS tournament_match_games (
  id INT AUTO_INCREMENT PRIMARY KEY,
  match_id INT NOT NULL,
  game_number INT NOT NULL,
  winner_team_id INT NOT NULL,
  reported_by_discord BIGINT,
  confirmed_by_discord BIGINT,
  status ENUM('pending','confirmed','disputed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_match_game (match_id, game_number),
  FOREIGN KEY (match_id) REFERENCES tournament_matches(id) ON DELETE CASCADE,
  FOREIGN KEY (winner_team_id) REFERENCES tournament_teams(id)
);
-- Migration for existing installs: (run the CREATE TABLE above)

CREATE TABLE IF NOT EXISTS map_pool_presets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  pool JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS SplatdleVisits (
visitor_id VARCHAR(64) NOT NULL,
visit_date DATE NOT NULL,
first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (visitor_id, visit_date),
INDEX idx_visit_date (visit_date)
);

CREATE TABLE IF NOT EXISTS SplatdlePlays (
id INT AUTO_INCREMENT PRIMARY KEY,
discord_id BIGINT NOT NULL,
guess_count INT NOT NULL,
played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
play_date DATE NOT NULL,
UNIQUE KEY uq_player_day (discord_id, play_date),
INDEX idx_play_date (play_date)
);
