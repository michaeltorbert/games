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

// A page whose application timers already run under a live Playwright clock
// pauses here instead, about `lead` ms of clock time after a sample.
//
// pauseAt(Date.now() + lead) throws "Cannot fast-forward to the past" whenever
// the running clock passes that target before the pause lands. Here Date and
// performance are sampled together, setFixedTime holds Date at the sample so
// pauseAt(sample) consumes no time however late it lands, and setSystemTime
// restores Date to the sample plus the ticks the clock actually ran. Only the
// rest of the lead is then fast-forwarded; a clock that already ran past the
// lead stays where it paused. Timers that fired before the pause stay fired,
// reading the held Date, and fastForward truncates a fractional remainder.
//
// A running clock's performance.now() follows real time, so a reading that
// stays put across a host wait means the clock is already paused. Nothing can
// move it before the next call, so the original absolute pause is exact there
// and cannot target the past; it keeps repeated pauses' timer order unchanged.
// `clock` defaults to page.clock; a diagnostic may pass a delegating wrapper.
export async function pauseLiveClockAfterLead(page, lead, { clock = page.clock } = {}) {
  const probe = await page.evaluate(() => performance.now());
  await waitOnHost(20);
  const sample = await page.evaluate(() => ({ date: Date.now(), ticks: performance.now() }));
  if (sample.ticks === probe) {
    await clock.pauseAt(sample.date + lead);
    return { alreadyPaused: true, sample, pausedTicks: sample.ticks, elapsed: 0, remaining: lead };
  }
  await clock.setFixedTime(sample.date);
  await clock.pauseAt(sample.date);
  const pausedTicks = await page.evaluate(() => performance.now());
  const elapsed = pausedTicks - sample.ticks;
  await clock.setSystemTime(sample.date + elapsed);
  const remaining = Math.max(0, lead - elapsed);
  if (remaining > 0) await clock.fastForward(remaining);
  return { alreadyPaused: false, sample, pausedTicks, elapsed, remaining };
}
