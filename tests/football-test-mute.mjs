// Session-only Football mute for cases that do not exercise sound. After the
// game's classic scripts finish, the game's own lexical soundOn is cleared and
// the button refreshed. The stored preference is never written, and Web Audio
// and the trusted-gesture unlock stay native.
import { expect } from '@playwright/test';

export const MUTE_PREFERENCE_KEY = 'footballAudioMuted';

// Context-level, so every page, navigation, and reload in the context is muted.
export async function muteFootballForTests(context) {
  await context.addInitScript(key => {
    if (!location.pathname.startsWith('/football')) return;
    const readPref = () => {
      try { return { ok: true, value: localStorage.getItem(key) }; } catch (e) { return { ok: false, value: null }; }
    };
    // DOMContentLoaded follows every classic script, so soundOn is initialized by now.
    document.addEventListener('DOMContentLoaded', () => {
      const proof = { applied: false, prefBefore: readPref() };
      try {
        // A window property would mean soundOn is not the game's lexical binding.
        if (Object.prototype.hasOwnProperty.call(window, 'soundOn')) proof.reason = 'soundOn is a window property';
        else if (typeof soundOn !== 'boolean' || typeof updateMuteButton !== 'function') proof.reason = 'soundOn or updateMuteButton unreachable';
        else { soundOn = false; updateMuteButton(); proof.applied = true; }
      } catch (error) { proof.reason = String(error); }
      proof.prefAfter = readPref();
      window.__footballTestMute = Object.freeze(proof);
    }, { once: true });
  }, MUTE_PREFERENCE_KEY);
}

// Run on a loaded Football page before the test's first input there.
export async function expectFootballTestMuted(page) {
  const state = await page.evaluate(key => {
    let pref, sound;
    try { pref = { ok: true, value: localStorage.getItem(key) }; } catch (e) { pref = { ok: false, value: null }; }
    try { sound = soundOn; } catch (error) { sound = String(error); }
    const pressed = document.getElementById('mute-toggle')?.getAttribute('aria-pressed') ?? null;
    return { proof: window.__footballTestMute ?? null, soundOn: sound, pressed, pref };
  }, MUTE_PREFERENCE_KEY);
  expect(state.proof, 'Football test mute ran at DOMContentLoaded').not.toBeNull();
  expect(state.proof.applied, `Football test mute applied (${state.proof.reason ?? 'no reason'})`).toBe(true);
  expect(state.soundOn, 'game soundOn is session-muted').toBe(false);
  expect(state.pressed, 'mute button shows the session mute').toBe('true');
  expect(state.proof.prefAfter, 'session mute wrote no preference').toEqual(state.proof.prefBefore);
  expect(state.pref, 'preference unchanged before the first input').toEqual(state.proof.prefBefore);
  return state;
}
