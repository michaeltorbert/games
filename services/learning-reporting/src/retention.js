// Scheduled retention (daily cron). Events older than the configured window, by server
// receipt time, are removed in bounded rounds. Each round is one transaction that first
// writes ID-only receipts for exactly the selected events and then deletes only events
// holding such a receipt, so a resent copy is answered 'deleted' and its slot is never
// shown as a gap. Rounds that do not finish today continue at the next run.
import { LIMITS, readConfig } from './config.js';
import { createDb } from './db.js';
import { log } from './http.js';

export const RETENTION_SQL = Object.freeze({
  receipts: `INSERT OR IGNORE INTO retired_events (event_id, device_id, epoch_id, seq, reason, retired_at)
    SELECT event_id, device_id, epoch_id, seq, 'retention', ?2 FROM events
    WHERE received_at < ?1 ORDER BY received_at, event_id LIMIT ${LIMITS.retentionBatch}`,
  remove: `DELETE FROM events WHERE received_at < ?1 AND EXISTS (SELECT 1 FROM retired_events r
    WHERE r.event_id = events.event_id AND r.device_id = events.device_id AND r.epoch_id = events.epoch_id AND r.seq = events.seq)`,
  remaining: 'SELECT count(*) AS remaining FROM events WHERE received_at < ?1',
  codes: 'DELETE FROM enrollment_codes WHERE expires_at < ?1',
  operations: 'DELETE FROM operations WHERE created_at < ?1',
});

export async function runRetention(env, now) {
  const config = readConfig(env);
  // A misconfigured window must not silently keep or drop data: fail loudly.
  if (!config.retentionValid) {
    log('scheduled', 'retention-misconfigured', 0);
    throw new Error('RETENTION_DAYS is not a valid whole number of days');
  }
  const db = createDb(env.DB, LIMITS.statementBudget);
  const cutoff = now - config.retentionDays * 86400000;
  let rounds = 0, remaining = 0;
  do {
    const [, , left] = await db.batch([
      [RETENTION_SQL.receipts, cutoff, now],
      [RETENTION_SQL.remove, cutoff],
      [RETENTION_SQL.remaining, cutoff],
    ]);
    remaining = left[0].remaining;
    rounds++;
  } while (remaining > 0 && rounds < LIMITS.retentionRounds);
  await db.batch([[RETENTION_SQL.codes, now], [RETENTION_SQL.operations, now - 3600000]]);
  log('scheduled', remaining > 0 ? 'retention-continues' : 'retention-done', rounds);
  return { rounds, remaining };
}
