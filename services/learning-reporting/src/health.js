// Device health: last sync, epochs, events received, the latest reported status record
// and unreceived seq ranges. A gap is a seq below the highest received in an epoch that
// is neither stored nor intentionally retired; it is computed as intervals (window SQL),
// never by enumerating slots, and never from the device's own highestSeq claim.
import { LIMITS } from './config.js';

export const HEALTH_SQL = Object.freeze({
  devices: `SELECT device_id AS deviceId, name, enrolled_at AS enrolledAt, revoked_at AS revokedAt, last_sync_at AS lastSyncAt,
      status_epoch AS epochId, status_highest_seq AS highestSeq, dropped_local AS droppedLocal, write_failures AS writeFailures
    FROM devices ORDER BY enrolled_at, device_id`,
  epochs: `SELECT e.device_id AS deviceId, e.epoch_id AS epochId, e.first_seen_at AS firstSeenAt,
      (SELECT count(*) FROM events x WHERE x.device_id = e.device_id AND x.epoch_id = e.epoch_id) AS retained,
      (SELECT count(*) FROM retired_events r WHERE r.device_id = e.device_id AND r.epoch_id = e.epoch_id
        AND r.reason <> 'refused-deleted') AS retired,
      (SELECT count(*) FROM retired_events r WHERE r.device_id = e.device_id AND r.epoch_id = e.epoch_id
        AND r.reason = 'refused-deleted') AS refused,
      max(COALESCE((SELECT max(seq) FROM events x WHERE x.device_id = e.device_id AND x.epoch_id = e.epoch_id), 0),
        COALESCE((SELECT max(seq) FROM retired_events r WHERE r.device_id = e.device_id AND r.epoch_id = e.epoch_id), 0)) AS maxSeq
    FROM epochs e ORDER BY e.device_id, e.first_seen_at, e.epoch_id`,
  gaps: `WITH seqs AS (
      SELECT device_id, epoch_id, seq FROM events
      UNION SELECT device_id, epoch_id, seq FROM retired_events
    ), ordered AS (
      SELECT device_id, epoch_id, seq, LAG(seq, 1, 0) OVER (PARTITION BY device_id, epoch_id ORDER BY seq) AS prev FROM seqs
    )
    SELECT device_id AS deviceId, epoch_id AS epochId, prev + 1 AS first, seq - 1 AS last
    FROM ordered WHERE seq > prev + 1 ORDER BY device_id, epoch_id, first LIMIT ${LIMITS.gapRanges + 1}`,
  anomalies: 'SELECT device_id AS deviceId, reason, count(*) AS count FROM anomalies GROUP BY device_id, reason ORDER BY device_id, reason',
  assignments: 'SELECT device_id AS deviceId, profile_id AS profileId, slot FROM device_profiles ORDER BY device_id, slot',
});

export async function deviceHealth(db) {
  const [devices, epochs, gaps, anomalies, assignments] = await db.batch([
    [HEALTH_SQL.devices], [HEALTH_SQL.epochs], [HEALTH_SQL.gaps], [HEALTH_SQL.anomalies], [HEALTH_SQL.assignments],
  ]);
  return assembleHealth({ devices, epochs, gaps, anomalies, assignments });
}

export function assembleHealth({ devices, epochs, gaps, anomalies, assignments }) {
  const truncated = gaps.length > LIMITS.gapRanges;
  const shown = gaps.slice(0, LIMITS.gapRanges);
  return {
    gapsTruncated: truncated,
    devices: devices.map(device => {
      const own = epochs.filter(epoch => epoch.deviceId === device.deviceId);
      return {
        ...device,
        profiles: assignments.filter(item => item.deviceId === device.deviceId).map(({ profileId, slot }) => ({ profileId, slot })),
        // Received learning events: stored now, or stored and later retired on purpose.
        // Uploads refused for an already deleted profile were never stored: counted apart.
        received: own.reduce((sum, epoch) => sum + epoch.retained + epoch.retired, 0),
        retained: own.reduce((sum, epoch) => sum + epoch.retained, 0),
        refusedDeleted: own.reduce((sum, epoch) => sum + (epoch.refused ?? 0), 0),
        epochs: own.map((epoch, index) => ({
          epochId: epoch.epochId,
          firstSeenAt: epoch.firstSeenAt,
          freshLog: index > 0,
          current: epoch.epochId === device.epochId,
          received: epoch.retained + epoch.retired,
          highestReceived: epoch.maxSeq,
          // Ranges of unreceived seq values below the highest received: possibly pending,
          // delayed or lost. Nothing after the highest received value is detectable.
          unreceived: shown.filter(gap => gap.deviceId === device.deviceId && gap.epochId === epoch.epochId)
            .map(gap => ({ first: gap.first, last: gap.last, count: gap.last - gap.first + 1 })),
        })),
        anomalies: Object.fromEntries(anomalies.filter(item => item.deviceId === device.deviceId).map(item => [item.reason, item.count])),
      };
    }),
  };
}
