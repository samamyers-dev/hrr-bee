CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    episode_number INTEGER,
    description TEXT,
    pub_date BIGINT NOT NULL,
    audio_url TEXT NOT NULL,
    duration INTEGER,
    play_state TEXT DEFAULT 'unplayed',
    last_position INTEGER DEFAULT 0,
    image_url TEXT
);
