CREATE TABLE IF NOT EXISTS playback_history (
    id SERIAL PRIMARY KEY,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    position_seconds INTEGER DEFAULT 0,
    playback_speed REAL DEFAULT 1.0,
    recorded_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_playback_episode ON playback_history(episode_id);
CREATE INDEX IF NOT EXISTS idx_playback_timestamp ON playback_history(recorded_at DESC);
