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
    average_guess_count INTEGER DEFAULT 0,
    played_today BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (discord_id)
)

CREATE TABLE IF NOT EXISTS TodaysLeaderboard (
    discord_id BIGINT,
    guess_count INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (discord_id),
    INDEX idx_created_at (created_at)
);