CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at BIGINT
);
INSERT INTO user_preferences (key, value, updated_at) VALUES
('sort_order', '"unplayed-first"', EXTRACT(EPOCH FROM NOW())::BIGINT),
('filter_state', '"all"', EXTRACT(EPOCH FROM NOW())::BIGINT),
('playback_speed', '1.0', EXTRACT(EPOCH FROM NOW())::BIGINT)
ON CONFLICT (key) DO NOTHING;
