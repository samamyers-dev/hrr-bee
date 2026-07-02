CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at BIGINT
);
INSERT INTO user_preferences (key, value, updated_at) VALUES
('sort_order', '"unplayed-first"', FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('filter_state', '"all"', FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('playback_speed', '1.0', FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT)
ON CONFLICT (key) DO NOTHING;
