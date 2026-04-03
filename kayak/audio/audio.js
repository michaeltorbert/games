const AUDIO_DIAGNOSTIC_VERSION = '1.1.27';

const environmentList = document.getElementById('environment-list');
const audioStateList = document.getElementById('audio-state-list');
const eventLog = document.getElementById('event-log');
const copyResultsButton = document.getElementById('copy-results');
const clearLogButton = document.getElementById('clear-log');

let audioCtx = null;
let htmlAudio = null;
let logEntries = [];
let lastUnlockResult = 'never attempted';
let lastHtmlAudioResult = 'never attempted';

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function getAudioContextState() {
  return audioCtx ? audioCtx.state : 'not-created';
}

function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioCtx = new AudioContextCtor();
  audioCtx.onstatechange = renderStatus;
  renderStatus();
  return audioCtx;
}

function buildHtmlAudioUrl() {
  const sampleRate = 22050;
  const durationSeconds = 0.22;
  const frameCount = Math.floor(sampleRate * durationSeconds);
  const dataLength = frameCount * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  function writeString(offset, value) {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  for (let i = 0; i < frameCount; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-9 * t);
    const sample =
      Math.sin(2 * Math.PI * 784 * t) * 0.35 * envelope +
      Math.sin(2 * Math.PI * 1176 * t) * 0.15 * envelope;
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, value * 0x7fff, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function ensureHtmlAudio() {
  if (htmlAudio) return htmlAudio;
  htmlAudio = new Audio(buildHtmlAudioUrl());
  htmlAudio.preload = 'auto';
  htmlAudio.playsInline = true;
  htmlAudio.setAttribute('webkit-playsinline', 'true');
  return htmlAudio;
}

function formatTime() {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function summarizeUserAgent() {
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone Safari-family';
  if (/iPad/.test(ua)) return 'iPad Safari-family';
  if (/Safari/.test(ua) && !/Chrome|CriOS|EdgiOS/.test(ua)) return 'Safari';
  if (/CriOS|Chrome/.test(ua)) return 'Chrome-family';
  return ua.slice(0, 80) || 'unknown';
}

function createEnvironmentEntries() {
  return [
    ['version', AUDIO_DIAGNOSTIC_VERSION],
    ['mode', isStandaloneMode() ? 'standalone' : 'browser tab'],
    ['visibility', document.visibilityState],
    ['context state', getAudioContextState()],
    ['last unlock', lastUnlockResult],
    ['last html audio', lastHtmlAudioResult],
    ['user agent', summarizeUserAgent()]
  ];
}

function renderDetails(target, entries) {
  target.innerHTML = '';
  entries.forEach(([term, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    target.appendChild(dt);
    target.appendChild(dd);
  });
}

function renderStatus() {
  renderDetails(environmentList, createEnvironmentEntries());

  const stateEntries = [
    ['has context', audioCtx ? 'yes' : 'no'],
    ['context state', getAudioContextState()],
    ['base latency', audioCtx ? String(audioCtx.baseLatency || 'n/a') : 'n/a'],
    ['sample rate', audioCtx ? String(audioCtx.sampleRate || 'n/a') : 'n/a'],
    ['html audio ready', htmlAudio ? String(htmlAudio.readyState) : 'not-created'],
    ['html audio paused', htmlAudio ? String(htmlAudio.paused) : 'n/a']
  ];
  renderDetails(audioStateList, stateEntries);
}

function renderLog() {
  if (!logEntries.length) {
    eventLog.textContent = 'No actions yet.';
    return;
  }
  eventLog.textContent = logEntries.map((entry) => JSON.stringify(entry)).join('\n');
}

function pushLog(entry) {
  logEntries.push(entry);
  renderLog();
  renderStatus();
}

async function logAction(label, eventType, run) {
  const before = getAudioContextState();
  let outcome = 'resolved';
  let details = '';
  try {
    const result = await run();
    if (typeof result === 'string') details = result;
    if (typeof result === 'boolean') details = result ? 'true' : 'false';
    if (result && typeof result === 'object') details = JSON.stringify(result);
  } catch (error) {
    outcome = 'rejected';
    details = error && error.message ? error.message : String(error);
  }
  const after = getAudioContextState();
  pushLog({
    time: formatTime(),
    control: label,
    eventType,
    before,
    after,
    outcome,
    details: details || 'none',
    mode: isStandaloneMode() ? 'standalone' : 'browser tab'
  });
}

async function unlock(event) {
  const ctx = ensureAudioContext();
  if (!ctx) {
    lastUnlockResult = 'no AudioContext';
    renderStatus();
    return false;
  }
  if (!event || !event.isTrusted) {
    lastUnlockResult = 'ignored untrusted event';
    renderStatus();
    return false;
  }
  if (ctx.state === 'running') {
    lastUnlockResult = 'already running';
    renderStatus();
    return true;
  }
  await ctx.resume();
  lastUnlockResult = `resume -> ${ctx.state}`;
  renderStatus();
  return ctx.state === 'running';
}

function playWebTone() {
  if (!audioCtx || audioCtx.state !== 'running') throw new Error('AudioContext is not running');
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(660, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(330, audioCtx.currentTime + 0.28);
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.14, audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.28);
}

function playPaddleSample() {
  if (!audioCtx || audioCtx.state !== 'running') throw new Error('AudioContext is not running');
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.setValueAtTime(220, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 0.18);
  gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.18);
}

function playCollectSample() {
  if (!audioCtx || audioCtx.state !== 'running') throw new Error('AudioContext is not running');
  [523, 659, 784, 1047].forEach((freq, index) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0, audioCtx.currentTime + index * 0.07);
    gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + index * 0.07 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + index * 0.07 + 0.2);
    osc.start(audioCtx.currentTime + index * 0.07);
    osc.stop(audioCtx.currentTime + index * 0.07 + 0.22);
  });
}

async function playHtmlClip() {
  const audio = ensureHtmlAudio();
  audio.pause();
  audio.currentTime = 0;
  await audio.play();
  lastHtmlAudioResult = 'play resolved';
  renderStatus();
}

function reset() {
  if (audioCtx && typeof audioCtx.close === 'function') {
    audioCtx.close().catch(() => {});
  }
  audioCtx = null;
  lastUnlockResult = 'reset';
  if (htmlAudio) {
    htmlAudio.pause();
    try {
      htmlAudio.currentTime = 0;
    } catch (e) {}
  }
  lastHtmlAudioResult = 'reset';
  renderStatus();
}

function buildReport() {
  return JSON.stringify({
    version: AUDIO_DIAGNOSTIC_VERSION,
    environment: Object.fromEntries(createEnvironmentEntries()),
    audioState: {
      hasContext: !!audioCtx,
      contextState: getAudioContextState(),
      sampleRate: audioCtx ? audioCtx.sampleRate : null,
      baseLatency: audioCtx ? audioCtx.baseLatency : null,
      htmlAudioReadyState: htmlAudio ? htmlAudio.readyState : null
    },
    logEntries
  }, null, 2);
}

async function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    } catch (error) {}
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('copy command failed');
  return 'execCommand';
}

function bindAction(buttonId, handler, config = {}) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  (config.events || ['click']).forEach((eventName) => {
    button.addEventListener(eventName, async (event) => {
      if (config.preventDefault) event.preventDefault();
      await logAction(button.dataset.control || buttonId, event.type, () => handler(event));
    }, config.listenerOptions);
  });
}

bindAction('unlock-press', (event) => unlock(event), {
  events: ['pointerdown', 'touchstart', 'mousedown'],
  preventDefault: true,
  listenerOptions: { passive: false }
});

bindAction('unlock-release', (event) => unlock(event), {
  events: ['pointerup', 'touchend', 'mouseup', 'click'],
  preventDefault: true,
  listenerOptions: { passive: false }
});

bindAction('web-tone', async () => {
  playWebTone();
  return 'web tone fired';
});

bindAction('html-audio', async () => {
  await playHtmlClip();
  return lastHtmlAudioResult;
});

bindAction('paddle-sfx', async () => {
  playPaddleSample();
  return 'paddle sample fired';
});

bindAction('collect-sfx', async () => {
  playCollectSample();
  return 'collect sample fired';
});

bindAction('reset-audio', async () => {
  reset();
  return 'audio reset';
});

copyResultsButton.addEventListener('click', async () => {
  const report = buildReport();
  try {
    const method = await copyText(report);
    pushLog({
      time: formatTime(),
      control: 'copy-results',
      eventType: 'click',
      before: getAudioContextState(),
      after: getAudioContextState(),
      outcome: 'resolved',
      details: `copy succeeded via ${method}`,
      mode: isStandaloneMode() ? 'standalone' : 'browser tab'
    });
  } catch (error) {
    pushLog({
      time: formatTime(),
      control: 'copy-results',
      eventType: 'click',
      before: getAudioContextState(),
      after: getAudioContextState(),
      outcome: 'rejected',
      details: error && error.message ? error.message : String(error),
      mode: isStandaloneMode() ? 'standalone' : 'browser tab'
    });
  }
});

clearLogButton.addEventListener('click', () => {
  logEntries = [];
  renderLog();
});

document.addEventListener('visibilitychange', renderStatus);
window.addEventListener('pageshow', renderStatus);
window.addEventListener('focus', renderStatus);

pushLog({
  time: formatTime(),
  control: 'page-load',
  eventType: 'load',
  before: getAudioContextState(),
  after: getAudioContextState(),
  outcome: 'resolved',
  details: 'diagnostics ready',
  mode: isStandaloneMode() ? 'standalone' : 'browser tab'
});
