ALTER TABLE provider_settings
  ADD COLUMN IF NOT EXISTS active_model_id TEXT;

ALTER TABLE provider_settings
  ALTER COLUMN deployment_name DROP NOT NULL,
  ALTER COLUMN model_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS provider_models (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  deployment_name TEXT NOT NULL,
  modes JSONB NOT NULL DEFAULT '["chat"]'::jsonb,
  supports_temperature BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, model_id)
);

INSERT INTO provider_models (user_id, model_id, deployment_name, modes, supports_temperature)
SELECT user_id, model_id, deployment_name,
  CASE model_id
    WHEN 'gpt-5.4-mini' THEN '["chat", "knowledge", "vision", "document", "meeting"]'::jsonb
    WHEN 'gpt-5.4' THEN '["chat", "knowledge", "vision", "document", "meeting"]'::jsonb
    ELSE '["chat"]'::jsonb
  END,
  FALSE
FROM provider_settings
WHERE model_id IS NOT NULL AND deployment_name IS NOT NULL
ON CONFLICT (user_id, model_id) DO NOTHING;

UPDATE provider_settings
SET active_model_id = model_id
WHERE active_model_id IS NULL AND model_id IS NOT NULL;