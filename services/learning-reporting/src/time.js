// Day boundaries in the configured display time zone, without a time-zone library.
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function offsetAt(ms, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(ms).map(part => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - ms;
}

// The UTC instant of local midnight starting `day` (YYYY-MM-DD) in `timeZone`.
export function zonedMidnight(day, timeZone) {
  const guess = Date.parse(`${day}T00:00:00.000Z`);
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
}

export function today(timeZone, now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00.000Z`) + count * 86400000).toISOString().slice(0, 10);

export function validRange(from, to) {
  if (!DAY.test(from) || !DAY.test(to)) return false;
  const start = Date.parse(`${from}T00:00:00.000Z`), end = Date.parse(`${to}T00:00:00.000Z`);
  return Number.isFinite(start) && Number.isFinite(end) && start <= end && end - start <= 366 * 86400000
    && new Date(start).toISOString().slice(0, 10) === from && new Date(end).toISOString().slice(0, 10) === to;
}
