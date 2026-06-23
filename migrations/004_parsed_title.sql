ALTER TABLE episodes ADD COLUMN IF NOT EXISTS parsed_title JSONB;
CREATE INDEX IF NOT EXISTS idx_episodes_parsed_title ON episodes USING GIN(parsed_title);
