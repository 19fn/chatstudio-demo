ALTER TABLE provider_settings
  ADD COLUMN IF NOT EXISTS api_version TEXT NOT NULL DEFAULT '2025-04-01-preview';