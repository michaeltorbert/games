// Public device endpoints: enrollment-code exchange and batched upload. Each is one
// fixed set of statements whatever the batch size. The upload batch is a single D1
// transaction whose every write re-checks, inside the transaction, that the installation,
// the device credential and the profile assignment are still current, so a racing
// revocation or deletion can never be undone by an in-flight upload.
import { LIMITS } from './config.js';
import { exactKeys, isRecord, isUuid, json, readJson } from './http.js';
import { CODE, newDeviceToken, newUuid, normalizeCode, parseBearer, sha256Hex } from './tokens.js';
import { canonical, validateEvent, validateStatus } from './validator.js';

const DEVICE_OK = `EXISTS (SELECT 1 FROM devices d, system s WHERE s.id = 1 AND d.device_id = ?1 AND d.token_hash = ?2
  AND d.revoked_at IS NULL AND s.installation = ?3)`;

export const SYNC_SQL = Object.freeze({
  insert: `INSERT INTO events (event_id, device_id, epoch_id, seq, profile_id, game, kind, recorded_at, received_at, payload)
    SELECT j.value ->> 'eventId', ?1, j.value ->> 'epochId', j.value ->> 'seq', j.value ->> 'profileId', j.value ->> 'game',
      j.value ->> 'kind', j.value ->> 'recordedAt', ?4, j.value ->> 'payload'
    FROM json_each(?5) AS j
    WHERE ${DEVICE_OK}
      AND EXISTS (SELECT 1 FROM device_profiles dp WHERE dp.device_id = ?1 AND dp.profile_id = j.value ->> 'profileId')
      AND NOT EXISTS (SELECT 1 FROM profile_tombstones t WHERE t.profile_id = j.value ->> 'profileId')
      AND NOT EXISTS (SELECT 1 FROM retired_events r WHERE r.event_id = j.value ->> 'eventId'
        OR (r.device_id = ?1 AND r.epoch_id = j.value ->> 'epochId' AND r.seq = j.value ->> 'seq'))
    ON CONFLICT DO NOTHING`,
  // An authenticated upload for an already deleted profile is answered 'deleted' (never
  // acknowledged as stored) and leaves an ID-only 'refused-deleted' receipt in its own,
  // still-free slot of this device, so an intentionally refused event never shows as an
  // unreceived gap. Its payload is never stored; it is not counted as a received event.
  // INSERT OR IGNORE keeps a resend idempotent; an occupied slot or ID is never overwritten.
  refused: `INSERT OR IGNORE INTO retired_events (event_id, device_id, epoch_id, seq, reason, retired_at)
    SELECT j.value ->> 'eventId', ?1, j.value ->> 'epochId', j.value ->> 'seq', 'refused-deleted', ?4
    FROM json_each(?5) AS j
    WHERE ${DEVICE_OK}
      AND EXISTS (SELECT 1 FROM profile_tombstones t WHERE t.profile_id = j.value ->> 'profileId')
      AND NOT EXISTS (SELECT 1 FROM events e WHERE e.event_id = j.value ->> 'eventId'
        OR (e.device_id = ?1 AND e.epoch_id = j.value ->> 'epochId' AND e.seq = j.value ->> 'seq'))`,
  anomalies: `INSERT OR IGNORE INTO anomalies (device_id, event_id, reason, epoch_id, seq, other_event_id, detected_at)
    SELECT ?1, c.event_id, c.reason, c.epoch_id, c.seq, c.other_id, ?4 FROM (
      SELECT j.value ->> 'eventId' AS event_id, j.value ->> 'epochId' AS epoch_id, j.value ->> 'seq' AS seq,
        CASE
          WHEN EXISTS (SELECT 1 FROM events e WHERE e.event_id = j.value ->> 'eventId' AND e.payload <> j.value ->> 'payload') THEN 'payload-mismatch'
          WHEN EXISTS (SELECT 1 FROM retired_events r WHERE r.event_id = j.value ->> 'eventId'
            AND NOT (r.device_id = ?1 AND r.epoch_id = j.value ->> 'epochId' AND r.seq = j.value ->> 'seq')) THEN 'retired-mismatch'
          WHEN EXISTS (SELECT 1 FROM events e WHERE e.device_id = ?1 AND e.epoch_id = j.value ->> 'epochId'
            AND e.seq = j.value ->> 'seq' AND e.event_id <> j.value ->> 'eventId') THEN 'seq-conflict'
          WHEN EXISTS (SELECT 1 FROM retired_events r WHERE r.device_id = ?1 AND r.epoch_id = j.value ->> 'epochId'
            AND r.seq = j.value ->> 'seq' AND r.event_id <> j.value ->> 'eventId') THEN 'seq-conflict'
        END AS reason,
        COALESCE(
          (SELECT e.event_id FROM events e WHERE e.device_id = ?1 AND e.epoch_id = j.value ->> 'epochId'
            AND e.seq = j.value ->> 'seq' AND e.event_id <> j.value ->> 'eventId'),
          (SELECT r.event_id FROM retired_events r WHERE r.device_id = ?1 AND r.epoch_id = j.value ->> 'epochId'
            AND r.seq = j.value ->> 'seq' AND r.event_id <> j.value ->> 'eventId')) AS other_id
      FROM json_each(?5) AS j
    ) AS c
    WHERE c.reason IS NOT NULL AND ${DEVICE_OK}
      AND (SELECT count(*) FROM anomalies a WHERE a.device_id = ?1) < ${LIMITS.anomaliesPerDevice}`,
  epochs: `INSERT OR IGNORE INTO epochs (device_id, epoch_id, first_seen_at)
    SELECT ?1, x.epoch_id, ?4 FROM (
      SELECT ?6 AS epoch_id
      UNION SELECT e.epoch_id FROM events e
        WHERE e.device_id = ?1 AND e.event_id IN (SELECT j.value ->> 'eventId' FROM json_each(?5) AS j)
    ) AS x
    WHERE ${DEVICE_OK}`,
  status: `UPDATE devices SET last_sync_at = ?4, status_epoch = ?6, status_highest_seq = ?7, dropped_local = ?8, write_failures = ?9
    WHERE device_id = ?1 AND token_hash = ?2 AND revoked_at IS NULL AND (SELECT installation FROM system WHERE id = 1) = ?3
      AND ?5 IS NOT NULL`,
  // The receipt: computed from this same transaction's committed state only.
  receipt: `SELECT j.key AS i, j.value ->> 'eventId' AS eventId,
      CASE
        WHEN NOT ${DEVICE_OK} THEN 'revoked'
        WHEN EXISTS (SELECT 1 FROM events e WHERE e.event_id = j.value ->> 'eventId' AND e.device_id = ?1
          AND e.payload = j.value ->> 'payload') THEN 'accepted'
        WHEN EXISTS (SELECT 1 FROM profile_tombstones t WHERE t.profile_id = j.value ->> 'profileId') THEN 'deleted'
        WHEN EXISTS (SELECT 1 FROM retired_events r WHERE r.event_id = j.value ->> 'eventId' AND r.device_id = ?1
          AND r.epoch_id = j.value ->> 'epochId' AND r.seq = j.value ->> 'seq') THEN 'deleted'
        WHEN EXISTS (SELECT 1 FROM events e WHERE e.device_id = ?1 AND e.epoch_id = j.value ->> 'epochId'
          AND e.seq = j.value ->> 'seq' AND e.event_id <> j.value ->> 'eventId') THEN 'seq-conflict'
        WHEN EXISTS (SELECT 1 FROM retired_events r WHERE r.device_id = ?1 AND r.epoch_id = j.value ->> 'epochId'
          AND r.seq = j.value ->> 'seq' AND r.event_id <> j.value ->> 'eventId') THEN 'seq-conflict'
        WHEN EXISTS (SELECT 1 FROM events e WHERE e.event_id = j.value ->> 'eventId')
          OR EXISTS (SELECT 1 FROM retired_events r WHERE r.event_id = j.value ->> 'eventId') THEN 'conflict'
        ELSE 'unassigned'
      END AS outcome
    FROM json_each(?5) AS j ORDER BY j.key`,
});

// Authentication of a device token. Only a stored hash proves issuance: an active hash
// authenticates, a revoked-credential hash proves revocation. A well-formed token from
// an erased installation (delete everything rotated the marker) is also revoked. Any
// other token is invalid, and the device keeps its queue.
export const AUTH_SQL = `SELECT s.installation AS installation,
    (SELECT device_id FROM devices WHERE token_hash = ?1 AND revoked_at IS NULL) AS deviceId,
    (EXISTS (SELECT 1 FROM revoked_credentials WHERE token_hash = ?1)
      OR EXISTS (SELECT 1 FROM devices WHERE token_hash = ?1 AND revoked_at IS NOT NULL)) AS revoked
  FROM system s WHERE s.id = 1`;

export async function authenticateDevice(db, header) {
  const parsed = parseBearer(header);
  if (!parsed) return { status: 401, error: 'invalid-credential' };
  const tokenHash = await sha256Hex(parsed.token);
  let row;
  try { row = await db.first(AUTH_SQL, tokenHash); } catch (error) { return { status: 503, error: 'unavailable' }; }
  if (!row || !/^[0-9a-f]{32}$/.test(row.installation)) return { status: 503, error: 'unavailable' };
  if (row.deviceId && parsed.installation === row.installation) return { deviceId: row.deviceId, tokenHash, installation: row.installation };
  if (row.revoked || parsed.installation !== row.installation) return { status: 403, error: 'revoked' };
  return { status: 401, error: 'invalid-credential' };
}

// Validates the sync body. Returns {status, error} for the whole request, or the
// per-event plan: invalid events are answered 'invalid' and never reach storage.
export function planSync(body, deviceId) {
  const versioned = value => isRecord(value) && typeof value.schemaVersion === 'number';
  // A numeric version other than 1 anywhere is unsupported: answer 422, the device keeps it.
  if ((versioned(body) && body.schemaVersion !== 1) || (versioned(body?.status) && body.status.schemaVersion !== 1)
    || (Array.isArray(body?.events) && body.events.some(event => versioned(event) && event.schemaVersion !== 1))) {
    return { status: 422, error: 'unsupported-schema' };
  }
  if (!exactKeys(body, ['schemaVersion', 'status', 'events']) || !Array.isArray(body.events)) return { status: 400, error: 'malformed' };
  if (body.events.length > LIMITS.syncEvents) return { status: 413, error: 'too-many-events' };
  const status = body.status;
  if (!validateStatus(status) || status.deviceId !== deviceId) return { status: 400, error: 'malformed-status' };
  const ids = new Set(), slots = new Set(), rows = [], results = [];
  body.events.forEach((event, index) => {
    const eventId = isRecord(event) && isUuid(event.eventId) ? event.eventId : null;
    const slot = isRecord(event) ? `${event.epochId}:${event.seq}` : null;
    const valid = eventId !== null && validateEvent(event) && event.deviceId === deviceId
      && !(event.epochId === status.epochId && event.seq > status.highestSeq) && !ids.has(eventId) && !slots.has(slot);
    if (eventId) ids.add(eventId);
    if (slot) slots.add(slot);
    if (!valid) {
      results[index] = { eventId, outcome: 'invalid' };
      return;
    }
    results[index] = null;
    rows.push({
      index, row: {
        eventId, epochId: event.epochId, seq: event.seq, profileId: event.profileId, game: event.game, kind: event.kind,
        recordedAt: event.recordedAt, payload: canonical(event),
      },
    });
  });
  return { status: 200, deviceStatus: status, rows, results };
}

export async function handleSync(request, db, auth, now) {
  const body = await readJson(request, LIMITS.syncBytes);
  if (body.status) return { status: body.status, body: { error: body.error } };
  const plan = planSync(body.value, auth.deviceId);
  if (plan.status !== 200) return { status: plan.status, body: { error: plan.error } };
  const rowsJson = JSON.stringify(plan.rows.map(item => item.row));
  const s = plan.deviceStatus;
  const params = [auth.deviceId, auth.tokenHash, auth.installation, now, rowsJson];
  const results = await db.batch([
    [SYNC_SQL.insert, ...params],
    [SYNC_SQL.refused, ...params],
    [SYNC_SQL.anomalies, ...params],
    [SYNC_SQL.epochs, ...params, s.epochId],
    [SYNC_SQL.status, ...params, s.epochId, s.highestSeq, s.droppedLocal, s.writeFailures],
    [SYNC_SQL.receipt, ...params],
  ]);
  const receipt = results[5];
  if (receipt.length !== plan.rows.length) throw new Error('Receipt does not match the batch');
  if (receipt.some(row => row.outcome === 'revoked')) return { status: 403, body: { error: 'revoked' } };
  for (const row of receipt) {
    const item = plan.rows[row.i];
    if (!item || item.row.eventId !== row.eventId) throw new Error('Receipt does not match the batch');
    plan.results[item.index] = { eventId: row.eventId, outcome: row.outcome };
  }
  return { status: 200, body: { schemaVersion: 1, results: plan.results } };
}

export const ENROLL_SQL = Object.freeze({
  claim: `UPDATE enrollment_codes SET claimed_by = ?2 WHERE code_hash = ?1 AND claimed_by IS NULL AND expires_at > ?3
    AND (SELECT installation FROM system WHERE id = 1) = ?4`,
  device: `INSERT INTO devices (device_id, name, token_hash, enrolled_at)
    SELECT ?1, c.device_name, ?2, ?3 FROM enrollment_codes c
    WHERE c.claimed_by = ?4
      AND (SELECT count(*) FROM devices WHERE revoked_at IS NULL) < ${LIMITS.devices}
      AND NOT EXISTS (SELECT 1 FROM json_each(c.profile_ids) AS j
        WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.profile_id = j.value))`,
  assign: `INSERT INTO device_profiles (device_id, profile_id, slot)
    SELECT ?1, j.value, j.key + 1 FROM enrollment_codes c, json_each(c.profile_ids) AS j
    WHERE c.claimed_by = ?2 AND EXISTS (SELECT 1 FROM devices d WHERE d.device_id = ?1 AND d.token_hash = ?3)`,
  scope: `UPDATE system SET scope_version = scope_version + 1
    WHERE id = 1 AND EXISTS (SELECT 1 FROM devices d WHERE d.device_id = ?1 AND d.token_hash = ?2)`,
  result: `SELECT dp.profile_id AS profileId FROM device_profiles dp
    WHERE dp.device_id = ?1 AND EXISTS (SELECT 1 FROM devices d WHERE d.device_id = ?1 AND d.token_hash = ?2)
    ORDER BY dp.slot`,
  release: `DELETE FROM enrollment_codes WHERE claimed_by = ?1`,
});

// One-time code exchange. The claim, the device, its assignments and the code's removal
// are one transaction, so two concurrent exchanges of one code cannot both succeed.
export async function handleEnroll(request, db, system, now) {
  const body = await readJson(request, LIMITS.enrollBytes);
  if (body.status) return { status: body.status, body: { error: body.error } };
  if (!exactKeys(body.value, ['code']) || typeof body.value.code !== 'string') return { status: 400, body: { error: 'malformed' } };
  const code = normalizeCode(body.value.code);
  if (!CODE.test(code)) return { status: 400, body: { error: 'invalid-code' } };
  const codeHash = await sha256Hex(`code|${code}`);
  const claim = newUuid(), deviceId = newUuid();
  const token = newDeviceToken(system.installation);
  const tokenHash = await sha256Hex(token);
  const results = await db.batch([
    [ENROLL_SQL.claim, codeHash, claim, now, system.installation],
    [ENROLL_SQL.device, deviceId, tokenHash, now, claim],
    [ENROLL_SQL.assign, deviceId, claim, tokenHash],
    [ENROLL_SQL.scope, deviceId, tokenHash],
    [ENROLL_SQL.result, deviceId, tokenHash],
    [ENROLL_SQL.release, claim],
  ]);
  const profileIds = results[4].map(row => row.profileId);
  if (!profileIds.length) return { status: 400, body: { error: 'invalid-code' } };
  return { status: 200, body: { schemaVersion: 1, token, deviceId, profileIds } };
}
