ALTER TABLE provider_settings
  ADD COLUMN IF NOT EXISTS model_id TEXT NOT NULL DEFAULT 'gpt-5.4-mini';