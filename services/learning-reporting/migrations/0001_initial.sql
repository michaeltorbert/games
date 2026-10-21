-- Learning reporting (#200), schema 1. Times are integer milliseconds since the epoch,
-- except events.recorded_at, which is the device's informational ISO 8601 wall clock.
-- No table stores an IP address, location, grown-up identity, prompt or answer text.

-- One system row. installation is a random, non-user marker embedded in device tokens;
-- confirm_key signs CSRF and destructive-confirmation tokens. Delete everything rotates
-- both and erases every other table. scope_version changes whenever profiles, devices or
-- assignments change, so a destructive preview cannot apply to a changed scope.
CREATE TABLE system (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  installation TEXT NOT NULL,
  confirm_key TEXT NOT NULL,
  scope_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO system (id, installation, confirm_key, scope_version, created_at)
VALUES (1, lower(hex(randomblob(16))), lower(hex(randomblob(32))), 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- Pseudonymous labels exist only here and in Access-protected responses.
CREATE TABLE profiles (
  profile_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE profile_tombstones (
  profile_id TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL
);

-- token_hash is SHA-256 of the issued device token; the token itself is never stored.
-- The latest reported status record is kept per device.
CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  enrolled_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_sync_at INTEGER,
  status_epoch TEXT,
  status_highest_seq INTEGER,
  dropped_local INTEGER,
  write_failures INTEGER
);
CREATE TABLE device_profiles (
  device_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  PRIMARY KEY (device_id, profile_id),
  UNIQUE (device_id, slot)
);
CREATE INDEX device_profiles_profile ON device_profiles (profile_id);
CREATE TABLE device_tombstones (
  device_id TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL
);
-- Proof that a token was issued and later revoked: only its hash and device ID.
CREATE TABLE revoked_credentials (
  token_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  revoked_at INTEGER NOT NULL
);

CREATE TABLE enrollment_codes (
  code_hash TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  profile_ids TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_by TEXT
);

-- payload is the canonical JSON of one event that passed the #199 allowlist validator.
CREATE TABLE events (
  event_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  epoch_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  profile_id TEXT NOT NULL,
  game TEXT NOT NULL,
  kind TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (device_id, epoch_id, seq)
);
CREATE INDEX events_profile ON events (profile_id, recorded_at);
CREATE INDEX events_received ON events (received_at);

-- ID-only receipts, so a resent copy is answered 'deleted' and the slot is never shown
-- as a gap. No payload, hash or profile. 'retention' and 'profile-deleted' retire events
-- that were stored; 'refused-deleted' marks an upload for an already deleted profile that
-- was refused and never stored (counted apart from received events).
CREATE TABLE retired_events (
  event_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  epoch_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('retention', 'profile-deleted', 'refused-deleted')),
  retired_at INTEGER NOT NULL,
  UNIQUE (device_id, epoch_id, seq)
);

CREATE TABLE epochs (
  device_id TEXT NOT NULL,
  epoch_id TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, epoch_id)
);

-- Bounded metadata only: IDs, seq and reason. Never the conflicting payload.
CREATE TABLE anomalies (
  device_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('payload-mismatch', 'seq-conflict', 'retired-mismatch')),
  epoch_id TEXT,
  seq INTEGER,
  other_event_id TEXT,
  detected_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, event_id, reason)
);

-- Transaction-owned guard for one destructive confirmation; removed in the same batch.
CREATE TABLE operations (
  op_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT,
  created_at INTEGER NOT NULL
);
