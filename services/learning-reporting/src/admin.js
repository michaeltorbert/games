// Access-protected admin, export and destructive operations. Every destructive action
// is a preview listing the affected scope, then a signed confirmation bound to the action,
// target, installation, Access session, expiry and the scope version the preview saw.
// The confirmation's batch first writes a fresh operation guard only if that scope is
// still exactly current; every destructive statement then requires this operation's own
// guard, so a failed check (including a scope already moved to expected + 1) deletes
// nothing. Confirmations are not single-use by themselves: a repeat finds the scope
// version already advanced and is refused.
import { LIMITS } from './config.js';
import { exactKeys, isUuid } from './http.js';
import { base64url, formatCode, fromBase64url, hmacHex, newEnrollmentCode, newUuid, randomHex, safeEqual, sha256Hex } from './tokens.js';

const LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{N} '.-]{0,22}[\p{L}\p{N}.])?$/u;
export const cleanLabel = value => (typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ') : '');
export const labelValid = value => LABEL.test(value);

export const csrfToken = (system, session) => hmacHex(system.confirmKey, `csrf|${system.installation}|${session}`);

export async function overview(db) {
  const [profiles, devices, assignments, codes] = await db.batch([
    ['SELECT profile_id AS profileId, label, created_at AS createdAt FROM profiles ORDER BY created_at, profile_id'],
    [`SELECT device_id AS deviceId, name, enrolled_at AS enrolledAt, revoked_at AS revokedAt, last_sync_at AS lastSyncAt
      FROM devices ORDER BY enrolled_at, device_id`],
    ['SELECT device_id AS deviceId, profile_id AS profileId, slot FROM device_profiles ORDER BY device_id, slot'],
    ['SELECT device_name AS deviceName, expires_at AS expiresAt FROM enrollment_codes WHERE claimed_by IS NULL AND expires_at > ?1 ORDER BY expires_at', Date.now()],
  ]);
  return {
    profiles,
    devices: devices.map(device => ({ ...device, profiles: assignments.filter(item => item.deviceId === device.deviceId).map(({ profileId, slot }) => ({ profileId, slot })) })),
    codes,
  };
}

export async function createProfile(db, body, now) {
  if (!exactKeys(body, ['label'])) return { status: 400, body: { error: 'malformed' } };
  const label = cleanLabel(body.label);
  if (!labelValid(label)) return { status: 400, body: { error: 'label' } };
  const profileId = newUuid();
  const results = await db.batch([
    [`INSERT INTO profiles (profile_id, label, created_at) SELECT ?1, ?2, ?3
      WHERE (SELECT count(*) FROM profiles) < ${LIMITS.profiles}`, profileId, label, now],
    ['UPDATE system SET scope_version = scope_version + 1 WHERE id = 1 AND EXISTS (SELECT 1 FROM profiles WHERE profile_id = ?1)', profileId],
    ['SELECT profile_id AS profileId FROM profiles WHERE profile_id = ?1', profileId],
  ]);
  return results[2].length ? { status: 200, body: { profileId, label } } : { status: 409, body: { error: 'profile-limit' } };
}

export async function renameProfile(db, body) {
  if (!exactKeys(body, ['profileId', 'label']) || !isUuid(body.profileId)) return { status: 400, body: { error: 'malformed' } };
  const label = cleanLabel(body.label);
  if (!labelValid(label)) return { status: 400, body: { error: 'label' } };
  const results = await db.batch([
    ['UPDATE profiles SET label = ?2 WHERE profile_id = ?1', body.profileId, label],
    ['UPDATE system SET scope_version = scope_version + 1 WHERE id = 1 AND EXISTS (SELECT 1 FROM profiles WHERE profile_id = ?1)', body.profileId],
    ['SELECT label FROM profiles WHERE profile_id = ?1', body.profileId],
  ]);
  return results[2].length ? { status: 200, body: { profileId: body.profileId, label } } : { status: 404, body: { error: 'not-found' } };
}

export async function createCode(db, body, now) {
  if (!exactKeys(body, ['deviceName', 'profileIds']) || !Array.isArray(body.profileIds) || body.profileIds.length < 1
    || body.profileIds.length > LIMITS.profiles || !body.profileIds.every(isUuid) || new Set(body.profileIds).size !== body.profileIds.length) {
    return { status: 400, body: { error: 'malformed' } };
  }
  const deviceName = cleanLabel(body.deviceName);
  if (!labelValid(deviceName)) return { status: 400, body: { error: 'label' } };
  const code = newEnrollmentCode();
  const codeHash = await sha256Hex(`code|${code}`);
  const expiresAt = now + LIMITS.codeTtlMs;
  const meta = await db.run(`INSERT INTO enrollment_codes (code_hash, device_name, profile_ids, created_at, expires_at)
    SELECT ?1, ?2, ?3, ?4, ?5
    WHERE NOT EXISTS (SELECT 1 FROM json_each(?3) AS j WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.profile_id = j.value))
      AND (SELECT count(*) FROM enrollment_codes WHERE claimed_by IS NULL AND expires_at > ?4) < ${LIMITS.activeCodes}
      AND (SELECT count(*) FROM devices WHERE revoked_at IS NULL) < ${LIMITS.devices}`,
  codeHash, deviceName, JSON.stringify(body.profileIds), now, expiresAt);
  if (meta.changes !== 1) return { status: 409, body: { error: 'code-not-created' } };
  return { status: 200, body: { code: formatCode(code), expiresAt } };
}

// ---- Destructive previews and guarded confirmations ----

const ACTIONS = ['delete-profile', 'delete-device', 'revoke-device', 'delete-all'];

export async function preview(db, system, session, body, now) {
  if (!exactKeys(body, ['action', 'target']) || !ACTIONS.includes(body.action)
    || (body.action === 'delete-all' ? body.target !== null : !isUuid(body.target))) return { status: 400, body: { error: 'malformed' } };
  const { action, target } = body;
  let affected;
  if (action === 'delete-profile') {
    const [profile, devices, counts] = await db.batch([
      ['SELECT profile_id AS profileId, label FROM profiles WHERE profile_id = ?1', target],
      [`SELECT d.device_id AS deviceId, d.name FROM device_profiles dp JOIN devices d ON d.device_id = dp.device_id
        WHERE dp.profile_id = ?1 ORDER BY d.enrolled_at, d.device_id`, target],
      ['SELECT count(*) AS events FROM events WHERE profile_id = ?1', target],
    ]);
    if (!profile.length) return { status: 404, body: { error: 'not-found' } };
    affected = { profiles: profile, devices, events: counts[0].events,
      consequence: 'Deletes this profile, its reported practice and its device assignments. Shared devices keep reporting for their other profiles. Later uploads for this profile are refused. This cannot be undone.' };
  } else if (action === 'delete-device' || action === 'revoke-device') {
    const [device, profiles, counts] = await db.batch([
      ['SELECT device_id AS deviceId, name, revoked_at AS revokedAt FROM devices WHERE device_id = ?1', target],
      [`SELECT p.profile_id AS profileId, p.label FROM device_profiles dp JOIN profiles p ON p.profile_id = dp.profile_id
        WHERE dp.device_id = ?1 ORDER BY dp.slot`, target],
      ['SELECT count(*) AS events FROM events WHERE device_id = ?1', target],
    ]);
    if (!device.length || (action === 'revoke-device' && device[0].revokedAt !== null)) return { status: 404, body: { error: 'not-found' } };
    affected = { devices: device.map(({ deviceId, name }) => ({ deviceId, name })), profiles, events: counts[0].events,
      consequence: action === 'delete-device'
        ? 'Deletes this device’s reported practice and revokes its connection for every profile listed. The device must be connected again with a new code to report. This cannot be undone.'
        : 'Revokes this device’s connection for every profile listed. Its reported practice stays. The device must be connected again with a new code to report.' };
  } else {
    const [profiles, devices, counts] = await db.batch([
      ['SELECT profile_id AS profileId, label FROM profiles ORDER BY created_at, profile_id'],
      ['SELECT device_id AS deviceId, name FROM devices ORDER BY enrolled_at, device_id'],
      ['SELECT count(*) AS events FROM events'],
    ]);
    affected = { profiles, devices, events: counts[0].events,
      consequence: 'Deletes every profile, device, report and record, and revokes every device. Every device must be connected again with a new code. This cannot be undone.' };
  }
  const claims = { v: 1, action, target, installation: system.installation, scope: system.scopeVersion, session, exp: now + LIMITS.previewTtlMs, nonce: randomHex(8) };
  const payload = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const confirmation = `${payload}.${await hmacHex(system.confirmKey, `confirm|${payload}`)}`;
  return { status: 200, body: { action, target, affected, confirmation, expiresAt: claims.exp } };
}

const guard = 'EXISTS (SELECT 1 FROM operations WHERE op_id = ?1)';

// The statements of one confirmed action, in order. ?1 is the operation ID; the first
// statement is the guard, the last two read and remove it.
export function destructiveStatements(action, target, op, scope, installation, now) {
  const begin = [`INSERT INTO operations (op_id, action, target, created_at)
    SELECT ?1, ?2, ?3, ?4 FROM system WHERE id = 1 AND scope_version = ?5 AND installation = ?6
      AND (?2 = 'delete-all'
        OR (?2 = 'delete-profile' AND EXISTS (SELECT 1 FROM profiles WHERE profile_id = ?3))
        OR (?2 = 'delete-device' AND EXISTS (SELECT 1 FROM devices WHERE device_id = ?3))
        OR (?2 = 'revoke-device' AND EXISTS (SELECT 1 FROM devices WHERE device_id = ?3 AND revoked_at IS NULL)))`,
  op, action, target, now, scope, installation];
  const bump = [`UPDATE system SET scope_version = scope_version + 1 WHERE id = 1 AND ${guard}`, op];
  const end = [[`SELECT ${guard} AS ok`, op], ['DELETE FROM operations WHERE op_id = ?1', op]];
  let body;
  if (action === 'delete-profile') {
    body = [
      [`INSERT OR IGNORE INTO retired_events (event_id, device_id, epoch_id, seq, reason, retired_at)
        SELECT event_id, device_id, epoch_id, seq, 'profile-deleted', ?3 FROM events WHERE profile_id = ?2 AND ${guard}`, op, target, now],
      [`DELETE FROM events WHERE profile_id = ?2 AND ${guard}`, op, target],
      [`DELETE FROM device_profiles WHERE profile_id = ?2 AND ${guard}`, op, target],
      [`DELETE FROM enrollment_codes WHERE EXISTS (SELECT 1 FROM json_each(profile_ids) AS j WHERE j.value = ?2) AND ${guard}`, op, target],
      [`DELETE FROM profiles WHERE profile_id = ?2 AND ${guard}`, op, target],
      [`INSERT OR IGNORE INTO profile_tombstones (profile_id, deleted_at) SELECT ?2, ?3 WHERE ${guard}`, op, target, now],
      bump,
    ];
  } else if (action === 'delete-device') {
    body = [
      [`INSERT OR IGNORE INTO revoked_credentials (token_hash, device_id, revoked_at)
        SELECT token_hash, device_id, ?3 FROM devices WHERE device_id = ?2 AND ${guard}`, op, target, now],
      ...['events', 'retired_events', 'epochs', 'anomalies', 'device_profiles', 'devices']
        .map(table => [`DELETE FROM ${table} WHERE device_id = ?2 AND ${guard}`, op, target]),
      [`INSERT OR IGNORE INTO device_tombstones (device_id, deleted_at) SELECT ?2, ?3 WHERE ${guard}`, op, target, now],
      bump,
    ];
  } else if (action === 'revoke-device') {
    body = [
      [`INSERT OR IGNORE INTO revoked_credentials (token_hash, device_id, revoked_at)
        SELECT token_hash, device_id, ?3 FROM devices WHERE device_id = ?2 AND ${guard}`, op, target, now],
      [`UPDATE devices SET revoked_at = ?3 WHERE device_id = ?2 AND ${guard}`, op, target, now],
      bump,
    ];
  } else {
    // Erases every user-linked row, including tombstones and revoked-credential proofs,
    // then rotates only the random system markers. Old tokens are then 'revoked' by
    // installation. The guard row goes last, after everything that depended on it.
    body = [
      ...['events', 'retired_events', 'epochs', 'anomalies', 'device_profiles', 'devices', 'device_tombstones',
        'revoked_credentials', 'enrollment_codes', 'profiles', 'profile_tombstones']
        .map(table => [`DELETE FROM ${table} WHERE ${guard}`, op]),
      [`UPDATE system SET installation = lower(hex(randomblob(16))), confirm_key = lower(hex(randomblob(32))),
        scope_version = scope_version + 1 WHERE id = 1 AND ${guard}`, op],
    ];
    return [begin, ...body, [`SELECT ${guard} AS ok`, op], ['DELETE FROM operations']];
  }
  return [begin, ...body, ...end];
}

export async function confirm(db, system, session, body, now) {
  if (!exactKeys(body, ['confirmation']) || typeof body.confirmation !== 'string' || body.confirmation.length > 1024) {
    return { status: 400, body: { error: 'malformed' } };
  }
  const [payload, signature, extra] = body.confirmation.split('.');
  if (extra !== undefined || !payload || !signature) return { status: 400, body: { error: 'malformed' } };
  if (!safeEqual(signature, await hmacHex(system.confirmKey, `confirm|${payload}`))) return { status: 403, body: { error: 'confirmation' } };
  let claims;
  try { claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))); } catch (error) { return { status: 400, body: { error: 'malformed' } }; }
  if (!exactKeys(claims, ['v', 'action', 'target', 'installation', 'scope', 'session', 'exp', 'nonce']) || claims.v !== 1
    || !ACTIONS.includes(claims.action)) return { status: 400, body: { error: 'malformed' } };
  if (claims.session !== session) return { status: 403, body: { error: 'confirmation' } };
  if (!(claims.exp >= now)) return { status: 409, body: { error: 'expired' } };
  if (claims.installation !== system.installation) return { status: 409, body: { error: 'stale' } };
  const op = newUuid();
  const statements = destructiveStatements(claims.action, claims.target, op, claims.scope, claims.installation, now);
  const results = await db.batch(statements);
  const ok = results[statements.length - 2][0]?.ok === 1;
  if (!ok) return { status: 409, body: { error: 'stale', message: 'Something changed since this was previewed. Review the new list and confirm again.' } };
  return { status: 200, body: { action: claims.action, target: claims.target, done: true } };
}

// ---- Export ----

export async function exportProfile(db, profileId, config, now) {
  if (!isUuid(profileId)) return { status: 400, body: { error: 'malformed' } };
  const [profile, devices, events] = await db.batch([
    ['SELECT profile_id AS profileId, label FROM profiles WHERE profile_id = ?1', profileId],
    [`SELECT d.device_id AS deviceId, d.name, d.enrolled_at AS enrolledAt, d.revoked_at AS revokedAt, d.last_sync_at AS lastSyncAt,
        d.status_epoch AS epochId, d.status_highest_seq AS highestSeq, d.dropped_local AS droppedLocal, d.write_failures AS writeFailures,
        (SELECT count(*) FROM device_profiles x WHERE x.device_id = d.device_id) > 1 AS shared
      FROM devices d WHERE d.device_id IN (SELECT device_id FROM device_profiles WHERE profile_id = ?1)
        OR d.device_id IN (SELECT DISTINCT device_id FROM events WHERE profile_id = ?1)
      ORDER BY d.enrolled_at, d.device_id`, profileId],
    [`SELECT payload, received_at AS receivedAt FROM events WHERE profile_id = ?1 ORDER BY device_id, epoch_id, seq LIMIT ${LIMITS.reportRows + 1}`, profileId],
  ]);
  if (!profile.length) return { status: 404, body: { error: 'not-found' } };
  if (events.length > LIMITS.reportRows) return { status: 413, body: { error: 'too-large' } };
  const file = {
    format: 'learning-reporting-export',
    schemaVersion: 1,
    exportedAt: new Date(now).toISOString(),
    retentionDays: config.retentionDays,
    profile: profile[0],
    note: 'Contains this profile’s retained events only. Device status is shared by every profile on a shared device. Practice before enrollment, practice not yet sent and practice past the retention window is not included.',
    devices: devices.map(device => ({ ...device, shared: device.shared === 1, revoked: device.revokedAt !== null })),
    events: events.map(row => ({ receivedAt: new Date(row.receivedAt).toISOString(), event: JSON.parse(row.payload) })),
  };
  return { status: 200, file };
}
