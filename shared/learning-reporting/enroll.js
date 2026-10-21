// Public device-enrollment page (#200). Shows only neutral player slots and local counts;
// profile labels exist only in the private, Access-protected report.
(() => {
  'use strict';
  const S = globalThis.LEARNING_SYNC;
  const $ = id => document.getElementById(id);
  const MESSAGES = {
    'not-configured': 'Reporting is not set up for this site.',
    'code-format': 'That code is not complete. Codes have 26 letters and numbers.',
    'invalid-code': 'That code did not work. It may have expired or already been used. Ask for a new code.',
    'already-enrolled': 'This device is already connected. Stop reporting first to connect it again.',
    stopping: 'Removing the previous setup is still waiting for another open game tab. Close other game tabs and try again.',
    legacy: 'An older, unsent practice record is on this device. Stop reporting first.',
    unavailable: 'This browser cannot keep reporting data, so this device cannot be connected.',
    future: 'A newer version of the games saved reporting data here. Update this page, or stop reporting first.',
    'hint-failed': 'Connected, but this browser did not save the final setting. Reload this page to finish.',
    timeout: 'The report service did not answer in time. Check the connection and try again.',
    network: 'The report service could not be reached. Check the connection and try again.',
    service: 'The report service could not connect this device right now. Try again later.',
  };
  const NOTICES = {
    'credential-not-recognized': 'The report service did not recognize this device. Waiting practice is kept. Ask a grown-up to check this device on the private report.',
    'unsupported-version': 'The report service does not accept this game version yet. Waiting practice is kept.',
  };
  const STATES = {
    disabled: null,
    'no-consent': null,
    'no-credential': 'Practice recording is on, but this device has no report connection. Nothing is sent.',
    stopping: 'Removing the previous setup is waiting for another open game tab.',
    stopped: 'Reporting was stopped in this tab. Reload to check again.',
    legacy: 'An older, unsent practice record pauses reporting here. Stop reporting to remove it.',
    future: 'A newer version of the games saved reporting data here. Reporting is paused, and the data is kept.',
    malformed: 'The waiting practice could not be read, so reporting is paused and the data is kept.',
    unavailable: 'This browser cannot keep reporting data.',
  };
  const when = iso => {
    if (!iso) return 'Not yet';
    const date = new Date(iso);
    return `${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  };

  async function render() {
    const configured = Boolean(S && S.serviceOrigin());
    const health = S ? await S.health() : { state: 'unavailable' };
    const enrolled = health.state === 'ok';
    $('lr-setup').hidden = enrolled || !['disabled', 'no-consent'].includes(health.state);
    $('lr-stop').hidden = health.state === 'disabled' || health.state === 'no-consent';
    $('lr-health').hidden = !enrolled;
    $('lr-sync-actions').hidden = !enrolled || !configured || !health.originMatches;
    $('lr-connect').disabled = !configured;
    $('lr-code').disabled = !configured;
    if (!configured && !enrolled) {
      $('lr-summary').textContent = MESSAGES['not-configured'];
      $('lr-form-status').textContent = MESSAGES['not-configured'];
      return;
    }
    if (!enrolled) {
      $('lr-summary').textContent = STATES[health.state] ?? 'This device is not connected. Nothing is recorded or sent.';
      return;
    }
    const roster = S.players();
    $('lr-players').textContent = roster ? roster.list.map(item => item.label).join(', ') : `${health.profiles}`;
    $('lr-last').textContent = when(health.lastSuccessAt);
    $('lr-waiting').textContent = `${health.waiting} practice event${health.waiting === 1 ? '' : 's'}`;
    $('lr-held').textContent = health.held ? `${health.held} kept here because the service did not accept them` : 'None';
    $('lr-lost').textContent = health.droppedLocal || health.writeFailures
      ? `${health.droppedLocal} removed to make room, ${health.writeFailures} not saved`
      : 'None reported';
    $('lr-summary').textContent = !configured || !health.originMatches
      ? 'Connected, but sending is paused because this site’s report setting changed. Waiting practice is kept.'
      : NOTICES[health.notice] ?? 'Connected. Practice is sent automatically while a game is open.';
    $('lr-summary').dataset.tone = health.notice ? 'alert' : '';
  }

  $('lr-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('lr-connect');
    if (button.disabled) return;
    button.disabled = true;
    $('lr-form-status').textContent = 'Connecting…';
    try {
      const result = await S.enroll($('lr-code').value);
      $('lr-form-status').textContent = result.ok ? 'Connected.' : MESSAGES[result.reason] ?? MESSAGES.service;
      if (result.ok) $('lr-code').value = '';
    } finally {
      button.disabled = false;
      await render();
    }
  });
  $('lr-sync-now').addEventListener('click', async () => {
    $('lr-sync-now').disabled = true;
    try { await S.syncNow(); } finally { $('lr-sync-now').disabled = false; await render(); }
  });
  const asking = value => {
    $('lr-stop-ask').hidden = value;
    $('lr-stop-confirm').hidden = !value;
    $('lr-stop-cancel').hidden = !value;
  };
  $('lr-stop-ask').addEventListener('click', () => { asking(true); $('lr-stop-confirm').focus(); });
  $('lr-stop-cancel').addEventListener('click', () => { asking(false); $('lr-stop-ask').focus(); });
  $('lr-stop-confirm').addEventListener('click', async () => {
    asking(false);
    $('lr-stop-status').textContent = 'Stopping…';
    const result = await S.stopThisDevice();
    $('lr-stop-status').textContent = result.ok
      ? (result.hintRemoved === false ? 'Stopped. Reload this page to finish removing the setting.' : 'Reporting stopped on this device.')
      : result.pending ? 'Waiting for another open game tab to close before removal finishes.' : 'Reporting could not be stopped. Try again.';
    await render();
  });
  render();
})();
