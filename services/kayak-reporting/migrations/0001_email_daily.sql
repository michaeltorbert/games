CREATE TABLE IF NOT EXISTS email_daily (
  day TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts >= 0)
);
