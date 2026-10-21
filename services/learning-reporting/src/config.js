// Strict reading of the Worker's configuration. Any missing or malformed value makes the
// affected routes fail closed (503); nothing falls back to a permissive default.

export const LIMITS = Object.freeze({
  profiles: 8,
  devices: 16,
  activeCodes: 20,
  codeTtlMs: 10 * 60 * 1000,
  syncEvents: 20,
  syncBytes: 65536,
  enrollBytes: 1024,
  adminBytes: 4096,
  statementBudget: 49,
  anomaliesPerDevice: 1000,
  reportRows: 50000,
  gapRanges: 500,
  previewTtlMs: 5 * 60 * 1000,
  retentionBatch: 1000,
  // Three statements per round plus two cleanup statements: 47 total, below the
  // shared 49-statement budget and Workers Free's 50-query invocation ceiling.
  retentionRounds: 15,
});

// Documented report rules (README "Decisions").
export const RULES = Object.freeze({
  sparseMinimum: 3,
  suggestionLimit: 6,
  reviewLimit: 2,
  reviewAgeDays: 7,
  recentWindow: 5,
  recentSupported: 8,
  defaultRangeDays: 30,
});

const ORIGIN = /^(https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*|http:\/\/(?:127\.0\.0\.1|localhost))(?::\d{1,5})?$/;
const TEAM = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
const AUD = /^[0-9a-f]{64}$/;

export function readConfig(env) {
  const origins = String(env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const retentionDays = Number(env.RETENTION_DAYS);
  const timeZone = String(env.DISPLAY_TIME_ZONE ?? '');
  let zoneValid = false;
  try {
    zoneValid = timeZone.length > 0 && Boolean(new Intl.DateTimeFormat('en-US', { timeZone }).format(0));
  } catch (error) {
    zoneValid = false;
  }
  const team = String(env.ACCESS_TEAM_DOMAIN ?? '');
  const aud = String(env.ACCESS_AUD ?? '');
  return Object.freeze({
    enabled: env.REPORTING_ENABLED === 'true',
    origins: Object.freeze(origins),
    originsValid: origins.length > 0 && origins.every(origin => ORIGIN.test(origin)),
    team,
    aud,
    accessReady: TEAM.test(team) && AUD.test(aud),
    retentionDays,
    retentionValid: Number.isInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 3650,
    timeZone,
    zoneValid,
  });
}
