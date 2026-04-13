# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Codex will review your output once you are done.

## Local Development

No build step. Serve from the repo root — the `../shared/` paths in each game require a real HTTP server:

```bash
cd /Users/michaeltorbert/Documents/games
python3 -m http.server 8080
# http://localhost:8080           → portal
# http://localhost:8080/football/ → Football Math
# http://localhost:8080/kayak/    → Kayak Adventures
# http://localhost:8080/prague/   → Prague Bike Panic
```

## Structure

```
games/
├── index.html          ← portal landing page
├── games.js            ← game registry (add a new game here)
├── shared/
│   ├── reset.css
│   ├── fonts.css       ← Google Fonts (Nunito)
│   └── portal.css      ← portal card grid only
├── football/           ← DOM-based math quiz
│   ├── index.html
│   ├── football.css
│   └── football.js
├── kayak/              ← canvas kayak game, 12 real-world levels
│   ├── index.html
│   ├── kayak.css
│   ├── kayak.js        ← canvas setup, game state, init, render, loop, buttons
│   ├── physics.js      ← water polys, collectibles, audio, ripples, update()
│   ├── renderer.js     ← all draw functions + 13 drawScene* functions
│   └── levels.js       ← LEVELS array (references drawScene fns from renderer.js)
└── prague/             ← canvas endless runner
    ├── index.html
    ├── prague.css
    ├── prague.js       ← canvas, globals, input, update(), reset(), loop()
    ├── chars.js        ← CHARS array, riderMichael(), riderSydney(), miniHead()
    ├── renderer.js     ← all draw functions (bg, player, obstacles, HUD, screens)
    └── obstacles.js    ← spawnObs(), spawnBigLog(), hitTest(), doHit()
```

## Architecture

Every game is **plain globals + ordered `<script>` tags** — no modules, no bundler. Each game's `index.html` loads files in dependency order and ends with a small inline `<script>` that fires the entry point (e.g. `loop()` or `initLevel(false)`).

**Portal:** `games.js` exports a `GAMES` array. `index.html` loads it and renders cards dynamically with an inline script. To add a new game: add one entry to `games.js` and create a folder with an `index.html`.

**Football:** Single state object (`state`). `buildPlay()` randomly picks one of four question types (`buildType1`–`buildType4`). `handleAnswer()` drives all game-state transitions. Field is pure DOM (no canvas).

**Kayak** script load order: `kayak.js` → `physics.js` → `renderer.js` → `levels.js` → inline init.
- `kayak.js`: canvas, `W()`/`H()`/`sc()`, game state, `getLevelDef()`, `initLevel()`, input, `showLevelComplete()`, `render()`, `loop()`, button wiring.
- `physics.js`: water polygon functions, `getLakePoly()`, `isInLake()`, collectible spawn, Web Audio, ripple/splash, physics constants, `update()`.
- `renderer.js`: `drawSky/drawWater/drawKayak/drawCollectibles`, all 13 `drawScene*` functions (one per level), `drawMapScreen()`.
- `levels.js`: `LEVELS` array with `drawScene` references (loads after `renderer.js` so functions exist).

**Prague** script load order: `prague.js` → `chars.js` → `obstacles.js` → `renderer.js` → inline `loop()`.
- `prague.js`: canvas (`G`), all state globals (`K`/`JP`, `P`, `OBS`, `BGL`, etc.), `rr()`/`pad()` utilities, `update()`, `reset()`, `loop()`.
- `chars.js`: `CHARS` array, `riderMichael()`, `riderSydney()`, `miniHead()`.
- `renderer.js`: `drawBG()`, `drawPlayer()`, `drawBikeRider()`, `drawObs()`, `drawHUD()`, `drawTitle()`, `drawCharSelect()`, `drawGameOver()`, helper draw functions.
- `obstacles.js`: `spawnObs()`, `spawnBigLog()`, `hitTest()`, `doHit()`.

## Routing

`domain.com/football/` → `football/index.html`. No server config needed — every static host (Netlify, GitHub Pages, Cloudflare Pages) handles this natively.

## Deployment

Drop the repo root into Netlify, GitHub Pages, or Cloudflare Pages. Set publish directory to `/`. No build command.
