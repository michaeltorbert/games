// Raw classic-browser program: keep this as text, never serialize a bundled function.
// Escapes below preserve browser template literals without evaluating them in the Worker.
export const DASHBOARD_CLIENT_SOURCE = `(function dashboardClient() {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = String(text); if (cls) n.className = cls; return n; };
  const state = { session: null, overview: null, view: 'report', profile: null, from: null, to: null };
  const status = message => { $('status').textContent = message; };
  const fmt = iso => {
    if (!iso) return 'Not yet';
    const date = typeof iso === 'number' ? new Date(iso) : new Date(iso);
    return new Intl.DateTimeFormat(undefined, { timeZone: state.session.timeZone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date) + \` (\${state.session.timeZone})\`;
  };
  async function api(path, body) {
    const init = body === undefined ? { credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.session.csrf }, body: JSON.stringify(body) };
    const response = await fetch(path, init);
    let data = null;
    try { data = await response.json(); } catch (error) { data = null; }
    return { ok: response.ok, status: response.status, data };
  }
  const labelOf = id => state.overview.profiles.find(p => p.profileId === id)?.label ?? 'Deleted profile';
  const plural = (n, word) => \`\${n} \${word}\${n === 1 ? '' : 's'}\`;

  // Every render and view change takes a new token. An awaited response may touch the page
  // (status, panels, busy state) only while its token is still the latest: a slower earlier
  // request for another profile, range or view can never append to or overwrite the current one.
  let renderToken = 0;
  const current = token => token === renderToken;

  function show(view) {
    renderToken++;
    state.view = view;
    for (const tab of document.querySelectorAll('.tab')) tab.setAttribute('aria-pressed', String(tab.dataset.view === view));
    for (const name of ['report', 'devices', 'setup']) $(\`view-\${name}\`).hidden = name !== view;
    if (view === 'report') renderReport();
    else if (view === 'devices') renderDevices();
    else renderSetup();
  }

  // ---- Report ----
  async function renderReport() {
    const token = ++renderToken;
    const root = $('view-report');
    root.replaceChildren();
    root.removeAttribute('aria-busy');
    const profiles = state.overview.profiles;
    if (!profiles.length) { root.append(panel('No profiles yet', [el('p', 'Add a profile and connect a device in Setup.')])); status(''); return; }
    if (!state.profile || !profiles.some(p => p.profileId === state.profile)) state.profile = profiles[0].profileId;
    const controls = el('div', null, 'controls');
    if (profiles.length > 1) {
      const label = el('label', 'Profile'), select = el('select');
      for (const p of profiles) { const o = el('option', p.label); o.value = p.profileId; select.append(o); }
      select.value = state.profile;
      select.addEventListener('change', () => { state.profile = select.value; renderReport(); });
      label.append(select); controls.append(label);
    }
    for (const [key, name] of [['from', 'From'], ['to', 'To']]) {
      const label = el('label', name), input = el('input');
      input.type = 'date'; input.value = state[key];
      input.addEventListener('change', () => { if (input.value) { state[key] = input.value; renderReport(); } });
      label.append(input); controls.append(label);
    }
    const head = panel(profiles.find(p => p.profileId === state.profile).label, [controls]);
    root.append(head);
    status('Loading report…');
    root.setAttribute('aria-busy', 'true');
    let result;
    try {
      result = await api(\`/api/report?profile=\${encodeURIComponent(state.profile)}&from=\${state.from}&to=\${state.to}\`);
    } catch (error) {
      result = { ok: false, status: 0 };
    }
    // A newer render (another profile, range or view) owns the page now: drop this response.
    if (!current(token)) return;
    root.removeAttribute('aria-busy');
    if (!result.ok) { status(result.status === 400 ? 'Check the dates: From must be on or before To.' : 'The report could not be loaded.'); return; }
    status('');
    const r = result.data;
    const devices = r.coverage.devices.length ? r.coverage.devices.map(d => \`\${d.name}\${d.revoked ? ' (revoked)' : ''}\`).join(', ') : 'none';
    head.append(el('p', \`Devices: \${devices}. \${r.range.from} to \${r.range.to} (\${r.range.timeZone}). Last sync: \${fmt(r.coverage.lastSyncAt)}.\`),
      el('p', \`\${r.coverage.exclusions} \${r.coverage.undetectable} \${r.range.note}\`, 'note'));
    if (r.coverage.truncated) head.append(el('p', 'This range has more events than one report shows; choose a shorter range.', 'alert'));
    root.append(factsPanel(r), footballPanel(r), suggestionPanel(r));
  }
  function panel(title, children) { const s = el('section', null, 'panel'); s.append(el('h2', title), ...children); return s; }
  function absentList(title, items, total, unit) {
    const d = el('details'); d.append(el('summary', \`\${title}: \${items.length} of \${total} \${unit}\`));
    const p = el('p', items.join(', ') || 'None'); d.append(p); return d;
  }
  function factsPanel(r) {
    const f = r.facts, list = el('ul', null, 'list');
    for (const row of f.rows) {
      const li = el('li'), d = el('details');
      const parts = [plural(row.completed, 'completed check'), plural(row.eligibleChecks, 'reported eligible check')];
      if (row.latestEligibleTiming) parts.push(\`latest eligible: \${row.latestEligibleTiming}\`);
      if (row.anotherTryLabel) parts.push(row.anotherTryLabel);
      if (row.statusLabel) parts.push(row.statusLabel);
      d.append(el('summary', \`\${row.equation}: \${parts.join(' · ')}\`));
      const dl = el('dl', null, 'facts');
      for (const [k, v] of [['First try, no help', row.firstTry], ['After a retry', row.afterRetry], ['Answer shown', row.answerShown],
        ['Help shown', row.helpShown], ['Eligible checks timed', row.eligibleTimed], ['Eligible checks not timed', row.eligibleNotTimed],
        ['Left unfinished', row.leftUnfinished], ['Started, no result reported yet', row.pending]]) { dl.append(el('dt', k), el('dd', v)); }
      d.append(dl); li.append(d); list.append(li);
    }
    return panel('Number facts', [
      el('p', \`\${plural(f.totals.completed, 'completed check')}, \${plural(f.totals.eligibleChecks, 'reported eligible check')}.\`),
      el('p', f.caveat, 'note'), el('p', f.sharedDeviceNote, 'note'),
      f.rows.length ? list : el('p', r.absentLabel),
      absentList('No reported unsupported check in this range', f.noEligibleCheck, f.rows.length + f.absent.length, 'facts'),
      absentList(r.absentLabel, f.absent, f.rows.length + f.absent.length, 'facts'),
    ]);
  }
  function footballPanel(r) {
    const fb = r.football, list = el('ul', null, 'list');
    for (const row of fb.rows) {
      const li = el('li'), d = el('details');
      const ind = row.counts.independent;
      const helped = ind.guidedFirstTry + ind.retryAfterHint + ind.guidedRetry + ind.secondMiss + ind.secondMissWorked;
      // Work-it-out questions without a result (help shown with no answer yet, pending, left
      // unfinished) are listed apart and never counted as completed.
      const unfinished = ind.guidedFirstNoAnswer + ind.retryHintNoAnswer + ind.guidedRetryNoAnswer + ind.workedNoContinue + ind.pending + ind.leftUnfinished;
      const summary = row.onlyLiteracyOrNoStakes ? 'No work-it-out questions reported (reading questions only)'
        : \`\${plural(row.independentResults, 'completed work-it-out question')}: \${ind.firstTry} first try without help, \${helped} needed help or a second try\`
          + (unfinished ? \`; \${plural(unfinished, 'more question')} without a result yet\` : '');
      d.append(el('summary', \`\${row.name}: \${summary}\${row.statusLabel ? ' · ' + row.statusLabel : ''}\`));
      for (const [axis, title] of [['independent', 'Work-it-out questions (the child calculates or reasons the answer)'],
        ['literacy', 'Reading questions (the answer is read from the field or scoreboard; not counted as work-it-out)'],
        ['noStakes', 'No-stakes questions (not counted as work-it-out)']]) {
        const counts = row.counts[axis], entries = Object.entries(counts).filter(([, n]) => n > 0);
        if (!entries.length) continue;
        d.append(el('h3', title));
        const ul = el('ul', null, 'counts');
        for (const [k, n] of entries) {
          const item = el('li', \`\${fb.labels[k]}: \${plural(n, 'question')}\`);
          if (k === 'leftUnfinished' || k === 'pending') {
            // Help observed on these questions, per stage; a question may show more than one stage.
            const stages = Object.entries((k === 'pending' ? row.pendingHelp : row.leftHelp)[axis]).filter(([, count]) => count > 0);
            if (stages.length) {
              const sub = el('ul');
              for (const [stage, count] of stages) sub.append(el('li', \`\${plural(count, 'question')} where \${fb.leftHelpLabels[stage]}\`));
              item.append(sub);
            }
          }
          ul.append(item);
        }
        d.append(ul);
      }
      li.append(d); list.append(li);
    }
    const recent = el('ul', null, 'list');
    for (const item of fb.recent) recent.append(el('li', \`\${item.name}: \${fb.labels[item.outcome]}\${item.axis === 'independent' ? '' : \` (\${item.axis === 'literacy' ? 'reading' : 'no-stakes'})\`}\`));
    return panel('Football', [
      el('p', 'Counts by kind of question. Each outcome is listed separately and never combined into a score. Football reports no timing.', 'note'),
      fb.rows.length ? list : el('p', r.absentLabel),
      el('h3', 'Recent supported outcomes'), fb.recent.length ? recent : el('p', 'None reported in this range.', 'muted'),
      absentList(r.absentLabel, fb.absent, fb.rows.length + fb.absent.length, 'Football concepts'),
    ]);
  }
  function suggestionPanel(r) {
    const list = el('ol', null, 'list');
    for (const s of r.suggestions) list.append(el('li', \`\${s.kind === 'review' ? 'Easy review' : 'Practice'} in \${s.place}: \${s.item}. \${s.reason}\`));
    return panel('Suggested next practice', [el('p', r.suggestionNote, 'note'), r.suggestions.length ? list : el('p', 'No suggestions from the reported results in this range.', 'muted')]);
  }

  // ---- Destructive confirmation (inline, lists the affected scope) ----
  async function askConfirm(container, action, target, after) {
    const result = await api('/api/preview', { action, target });
    if (!result.ok) { status('That could not be prepared. Reload and try again.'); return; }
    const p = result.data, box = el('div', null, 'confirm');
    box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Confirm');
    box.tabIndex = -1;
    box.append(el('p', p.affected.consequence, 'alert'));
    if (p.affected.profiles.length) box.append(el('p', \`Profiles affected: \${p.affected.profiles.map(x => x.label).join(', ')}\`));
    if (p.affected.devices.length) box.append(el('p', \`Devices affected: \${p.affected.devices.map(x => x.name).join(', ')}\`));
    box.append(el('p', \`Reported events affected: \${p.affected.events}\`));
    const row = el('div', null, 'row'), yes = el('button', 'Confirm', 'action danger'), no = el('button', 'Cancel', 'action quiet');
    yes.type = no.type = 'button';
    no.addEventListener('click', () => box.remove());
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      const done = await api('/api/confirm', { confirmation: p.confirmation });
      if (done.ok) { status('Done.'); await refresh(); after?.(); }
      else status(done.data?.message ?? 'Not done. Something changed; review the new list and try again.');
      box.remove();
    });
    row.append(yes, no); box.append(row); container.append(box); box.focus();
  }

  // ---- Devices ----
  async function renderDevices() {
    const token = ++renderToken;
    const root = $('view-devices');
    root.replaceChildren();
    status('Loading devices…');
    let result;
    try { result = await api('/api/devices'); } catch (error) { result = { ok: false, status: 0 }; }
    if (!current(token)) return;
    if (!result.ok) { status('Devices could not be loaded.'); return; }
    status('');
    root.append(panel('Device health', [el('p', 'Unreceived numbers below the highest received are possibly pending, delayed or lost, not proven lost. Losses after the last received event, and devices that never sent anything, cannot be detected. Intentionally deleted events are not shown as gaps.', 'note')]));
    if (result.data.gapsTruncated) root.append(el('p', 'Some unreceived ranges are not shown.', 'alert'));
    for (const d of result.data.devices) {
      const p = panel(\`\${d.name}\${d.revokedAt ? ' (revoked)' : ''}\`, []);
      const dl = el('dl', null, 'facts');
      const current = d.epochs.find(e => e.current);
      for (const [k, v] of [['Players', d.profiles.map(x => \`Player \${x.slot}: \${labelOf(x.profileId)}\`).join(', ') || 'None'],
        ['Last successful sync', fmt(d.lastSyncAt)], ['Current log', d.epochId ? d.epochId.slice(0, 8) : 'None reported'],
        ['Events received', \`\${d.received} (\${d.retained} still kept)\`], ['Removed on the device to make room (latest report)', d.droppedLocal ?? 'Not reported'],
        ['Not saved on the device (latest report)', d.writeFailures ?? 'Not reported']]) dl.append(el('dt', k), el('dd', v));
      if (d.refusedDeleted) dl.append(el('dt', 'Refused for deleted profiles (never stored)'), el('dd', d.refusedDeleted));
      p.append(dl);
      for (const e of d.epochs) {
        if (e.freshLog) p.append(el('p', \`A fresh log started \${fmt(e.firstSeenAt)}\${e.current ? ' (current)' : ''}. Missing events from before it cannot be counted.\`, 'note'));
        for (const g of e.unreceived) p.append(el('p', \`Log \${e.epochId.slice(0, 8)}: \${g.first === g.last ? \`number \${g.first}\` : \`numbers \${g.first}–\${g.last}\`} not received (\${g.count}), possibly pending, delayed or lost.\`));
      }
      if (current === undefined && d.epochs.length) p.append(el('p', 'The device’s current log has not been reported yet.', 'note'));
      const anomalies = Object.entries(d.anomalies);
      if (anomalies.length) p.append(el('p', \`Conflicts recorded: \${anomalies.map(([k, n]) => \`\${k} \${n}\`).join(', ')}\`, 'alert'));
      const row = el('div', null, 'row');
      if (!d.revokedAt) { const b = el('button', 'Revoke…', 'action quiet'); b.type = 'button'; b.addEventListener('click', () => askConfirm(p, 'revoke-device', d.deviceId, renderDevices)); row.append(b); }
      const del = el('button', 'Delete device…', 'action danger'); del.type = 'button';
      del.addEventListener('click', () => askConfirm(p, 'delete-device', d.deviceId, renderDevices)); row.append(del);
      p.append(row); root.append(p);
    }
    if (!result.data.devices.length) root.append(el('p', 'No devices connected yet.', 'muted'));
  }

  // ---- Setup ----
  function renderSetup() {
    const root = $('view-setup');
    root.replaceChildren();
    const profiles = state.overview.profiles;
    const list = el('ul', null, 'list');
    for (const p of profiles) {
      const li = el('li'), row = el('div', null, 'row');
      const name = el('input'); name.value = p.label; name.setAttribute('aria-label', \`Nickname for \${p.label}\`); name.maxLength = 24;
      const save = el('button', 'Rename', 'action quiet'), exp = el('a', 'Export', 'action quiet'), del = el('button', 'Delete…', 'action danger');
      save.type = del.type = 'button';
      exp.href = \`/api/export?profile=\${encodeURIComponent(p.profileId)}\`; exp.setAttribute('download', '');
      exp.style.display = 'inline-flex'; exp.style.alignItems = 'center'; exp.style.textDecoration = 'none';
      save.addEventListener('click', async () => { const r = await api('/api/profiles/rename', { profileId: p.profileId, label: name.value }); status(r.ok ? 'Renamed.' : 'Use 1–24 letters, numbers or spaces.'); await refresh(); });
      del.addEventListener('click', () => askConfirm(li, 'delete-profile', p.profileId, renderSetup));
      row.append(name, save, exp, del); li.append(row); list.append(li);
    }
    const add = el('form', null, 'controls'), label = el('label', 'New profile nickname'), input = el('input'), go = el('button', 'Add profile', 'action');
    input.maxLength = 24; label.append(input); go.type = 'submit'; add.append(label, go);
    add.addEventListener('submit', async e => { e.preventDefault(); const r = await api('/api/profiles', { label: input.value }); status(r.ok ? 'Profile added.' : r.status === 409 ? 'The profile limit is reached.' : 'Use 1–24 letters, numbers or spaces.'); if (r.ok) await refresh(); });
    root.append(panel('Profiles', [el('p', 'Use a nickname, not a full name. Nicknames appear only on this private page.', 'note'), list, add]));

    const code = el('form', null, 'controls'), dn = el('label', 'Device nickname'), dinput = el('input'), boxes = el('fieldset');
    dinput.maxLength = 24; dn.append(dinput); boxes.append(el('legend', 'Who plays on it'));
    for (const p of profiles) { const l = el('label'), c = el('input'); c.type = 'checkbox'; c.value = p.profileId; l.append(c, el('span', \` \${p.label}\`)); boxes.append(l); }
    const make = el('button', 'Create one-time code', 'action'); make.type = 'submit';
    const out = el('div');
    code.append(dn, boxes, make);
    code.addEventListener('submit', async e => {
      e.preventDefault();
      const ids = [...boxes.querySelectorAll('input:checked')].map(c => c.value);
      const r = await api('/api/codes', { deviceName: dinput.value, profileIds: ids });
      out.replaceChildren();
      if (!r.ok) { status('Choose a device nickname and at least one profile.'); return; }
      out.append(el('p', 'On the device, open the games site’s “shared/learning-reporting/” page and enter:'), el('p', r.data.code, 'code'),
        el('p', \`Works once, until \${fmt(r.data.expiresAt)}. Players are shown on the device only as Player 1, Player 2… in the order listed above.\`, 'note'));
      status('Code created.');
    });
    root.append(panel('Connect a device', [code, out]));
    const wipe = el('button', 'Delete everything…', 'action danger'); wipe.type = 'button';
    const wipePanel = panel('Delete everything', [el('p', 'Export anything you want to keep first.', 'note'), wipe]);
    wipe.addEventListener('click', () => askConfirm(wipePanel, 'delete-all', null, renderSetup));
    root.append(wipePanel);
    status(state.session.reportingEnabled ? '' : 'Uploads are switched off for this service (REPORTING_ENABLED).');
  }

  async function refresh() {
    const o = await api('/api/overview');
    if (o.ok) state.overview = o.data;
    if (state.view === 'setup') renderSetup();
  }
  async function start() {
    const s = await api('/api/session');
    if (!s.ok) { status('This page needs a signed-in grown-up account.'); return; }
    state.session = s.data;
    state.to = s.data.today;
    const end = Date.parse(\`\${s.data.today}T00:00:00Z\`);
    state.from = new Date(end - (s.data.rules.defaultRangeDays - 1) * 86400000).toISOString().slice(0, 10);
    const o = await api('/api/overview');
    if (!o.ok) { status('The report could not be loaded.'); return; }
    state.overview = o.data;
    for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => show(tab.dataset.view));
    show('report');
  }
  start();
}
)();
`;
