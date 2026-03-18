CREATE TABLE IF NOT EXISTS experiment_results (
  id SERIAL PRIMARY KEY,
  operation TEXT NOT NULL,
  params JSONB,
  explain_text TEXT,
  artifact_path TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
