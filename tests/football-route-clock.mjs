// Football route probes run under a Playwright clock that is already paused at
// an exact epoch before any Football page loads.
//
// A pause sampled from a running clock, pauseAt(Date.now() + margin), throws
// "Cannot fast-forward to the past" whenever the browser has passed that target
// by the time the pause lands. Here setFixedTime holds browser Date at the
// epoch, so pauseAt(epoch) consumes no time however late it lands, and
// setSystemTime then restores ordinary Date progression, which advances only
// through runFor() while paused. Later navigation replays these public calls;
// that is observed pinned Playwright 1.56.1 behavior, not a documented contract.
export const ROUTE_CLOCK_EPOCH = new Date('2026-01-03T12:00:00Z');

// `clock` defaults to page.clock; a diagnostic may pass a delegating wrapper.
export async function installPausedRouteClock(page, { clock = page.clock, epoch = ROUTE_CLOCK_EPOCH } = {}) {
  if (page.url() !== 'about:blank') throw new Error(`Install the route clock before navigation, not on ${page.url()}`);
  await clock.install({ time: epoch });
  await clock.setFixedTime(epoch);
  await clock.pauseAt(epoch);
  await clock.setSystemTime(epoch);
}

// A real host wait that the page clock cannot see; resolves to the elapsed ms.
export async function waitOnHost(ms) {
  const start = performance.now();
  await new Promise(resolve => setTimeout(resolve, ms));
  return performance.now() - start;
}
