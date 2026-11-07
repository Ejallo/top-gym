-- TOP GYM accounts and synced data (Cloudflare D1)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,         -- Google account id (sub)
  email TEXT,
  name TEXT,
  created INTEGER,
  seq INTEGER NOT NULL DEFAULT 0 -- last sequence number given to this user's records
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,  -- SHA-256 of the session token; the token itself is never stored
  user_id TEXT NOT NULL,
  created INTEGER,
  user_agent TEXT,
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS records (
  user_id TEXT NOT NULL,
  tbl TEXT NOT NULL,            -- customExercises | templates | programs | workouts | kv
  id TEXT NOT NULL,
  body TEXT,                    -- JSON; NULL when deleted
  updated INTEGER NOT NULL,     -- client time of the last change (last write wins)
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,         -- per-user change counter for incremental pulls
  PRIMARY KEY (user_id, tbl, id)
);
CREATE INDEX IF NOT EXISTS records_seq ON records (user_id, seq);

CREATE TABLE IF NOT EXISTS photos (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,             -- <exerciseId>_<content hash>
  body BLOB NOT NULL,
  type TEXT,
  PRIMARY KEY (user_id, id)
);

-- Paired sign-in hand-over: session waiting for the app that holds the secret (nonce = sha256(secret)); lives 10 min
CREATE TABLE IF NOT EXISTS pairs (
  nonce TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  name TEXT,
  email TEXT,
  created INTEGER NOT NULL
);
