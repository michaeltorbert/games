import { DASHBOARD_CLIENT_SOURCE } from './dashboard-client.js';

// The private dashboard: served only by this Worker behind a verified Access JWT. Plain
// DOM code; every data value is written with textContent, never as HTML.

export function dashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>Learning report</title>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<header class="bar">
  <h1>Learning report</h1>
  <nav class="tabs" aria-label="Sections">
    <button type="button" class="tab" data-view="report" aria-pressed="true">Report</button>
    <button type="button" class="tab" data-view="devices" aria-pressed="false">Devices</button>
    <button type="button" class="tab" data-view="setup" aria-pressed="false">Setup</button>
  </nav>
</header>
<main id="main">
  <p class="status" id="status" role="status" aria-live="polite">Loading…</p>
  <section id="view-report" class="view" aria-label="Report"></section>
  <section id="view-devices" class="view" aria-label="Devices" hidden></section>
  <section id="view-setup" class="view" aria-label="Setup" hidden></section>
</main>
<script src="/app.js"></script>
</body>
</html>`;
}

export const DASHBOARD_CSS = `
:root { --navy: #13294b; --navy-soft: #1f3c66; --cream: #faf6ec; --gold: #f2b632; --line: #d8cfb8; --ink: #13294b; --muted: #4a5a72; --alert: #8a2a12; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--cream); color: var(--ink); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
.bar { background: var(--navy); color: var(--cream); border-bottom: 4px solid var(--gold); padding: 10px max(16px, env(safe-area-inset-left)); display: flex; flex-wrap: wrap; gap: 8px 20px; align-items: center; }
.bar h1 { margin: 0; font-size: 20px; }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.tab { min-height: 44px; min-width: 44px; padding: 0 16px; border: 1px solid var(--cream); border-radius: 8px; background: transparent; color: var(--cream); font: 600 16px/1 inherit; cursor: pointer; }
.tab[aria-pressed="true"] { background: var(--cream); color: var(--navy); }
main { max-width: 1120px; margin: 0 auto; padding: 16px; display: grid; gap: 14px; }
.view { display: grid; gap: 14px; min-width: 0; }
/* An author display rule beats the UA [hidden] style, which left inactive views visible. */
[hidden] { display: none !important; }
.panel { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; min-width: 0; }
.panel h2 { margin: 0 0 8px; font-size: 18px; }
.panel h3 { margin: 12px 0 6px; font-size: 16px; }
.panel p { margin: 0 0 8px; }
.controls { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: end; }
.controls label { display: grid; gap: 4px; font-weight: 600; }
input, select { min-height: 44px; padding: 6px 10px; border: 2px solid var(--navy-soft); border-radius: 8px; font: inherit; background-color: #fff; color: var(--ink); max-width: 100%; }
/* WebKit's native select ignores min-height (it rendered 25px tall); a styled select keeps its
   native semantics and picker, with a drawn chevron. */
select { -webkit-appearance: none; appearance: none; padding-right: 38px;
  background-image: linear-gradient(45deg, transparent 50%, var(--navy) 50%), linear-gradient(135deg, var(--navy) 50%, transparent 50%);
  background-position: calc(100% - 20px) 50%, calc(100% - 14px) 50%; background-size: 6px 6px; background-repeat: no-repeat; }
.controls { margin-bottom: 10px; }
.action { min-height: 44px; min-width: 44px; padding: 0 16px; border: 2px solid var(--navy); border-radius: 8px; background: var(--navy); color: var(--cream); font: 600 16px/1 inherit; cursor: pointer; }
.action.quiet { background: transparent; color: var(--navy); }
.action.danger { background: transparent; color: var(--alert); border-color: var(--alert); }
fieldset { border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; min-width: 0; }
fieldset label { display: flex; align-items: center; gap: 8px; min-height: 44px; font-weight: 400; }
fieldset input[type="checkbox"] { width: 24px; height: 24px; min-height: 0; margin: 0; }
:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
.muted { color: var(--muted); }
.note { color: var(--muted); font-size: 15px; }
.alert { color: var(--alert); font-weight: 600; }
.list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.list > li { border-top: 1px solid var(--line); padding-top: 6px; overflow-wrap: anywhere; }
details > summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; font-weight: 600; overflow-wrap: anywhere; }
dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 6px 0; }
dl.facts dt { font-weight: 600; }
dl.facts dd { margin: 0; overflow-wrap: anywhere; }
.counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 4px 16px; margin: 6px 0; padding: 0; list-style: none; }
.confirm { border: 2px solid var(--alert); border-radius: 10px; padding: 12px; background: #fff7f2; }
.code { font: 700 22px/1.3 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.05em; overflow-wrap: anywhere; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
@media (max-width: 520px) { dl.facts { grid-template-columns: 1fr; } main { padding: 10px; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; scroll-behavior: auto !important; } }
`;

// The browser program is opaque text to the Worker bundler.
export const dashboardScript = () => DASHBOARD_CLIENT_SOURCE;
