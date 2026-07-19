# AGENTS.md

Source of truth for AI coding agents working in this repo (Claude Code, Codex, Cursor, Aider, etc.). Read this before making design/layout decisions.

## GitHub Attribution (Required)

For any GitHub write action in `michaeltorbert/games`, do not use the user's personal GitHub identity.

Required identity:
- Codex GitHub App auth profile: `games-codex`
- Codex visible GitHub actor: `codex-bot-mt[bot]`
- Claude GitHub App auth profile: `claude`
- Claude visible GitHub actor: `claude-bot-mt[bot]`
- Local git commit identity (shared across agents in this repo): `codex-michaeltorbert[bot] <3357630+codex-michaeltorbert[bot]@users.noreply.github.com>`
- The auth profiles, visible GitHub actors, and local git commit identity are separate values; do not assume they match.

Required behavior:
- Prefer `github-app-token` and `github-app-curl` for GitHub API writes. Use an explicit profile argument when you need to select the agent profile directly.
- Agent-specific defaults for GitHub writes:
  - Claude agents use `github-app-curl --profile claude` and appear as `claude-bot-mt[bot]`.
  - Codex agents use `github-app-curl --profile games-codex` and appear as `codex-bot-mt[bot]`.
- When asked to perform a GitHub write, do it directly as the agent bot. Do not offer "draft for you to post" or "post as the user" as alternatives unless the user explicitly asks for personal-account posting. You may still ask clarifying questions about what to write.
- For issue comments, PR comments, PR reviews, PR creation, merges, labels, and similar GitHub writes, use the agent bot by default.
- Do not use connector-backed GitHub writes if they would attribute the action to `@michaeltorbert`.
- Before any commit, verify:
  - `git config user.name` = `codex-michaeltorbert[bot]`
  - `git config user.email` = `3357630+codex-michaeltorbert[bot]@users.noreply.github.com`
- If bot attribution cannot be guaranteed, stop and report that explicitly instead of writing as the user.
- Every PR body must declare the actual implementation author with exactly one
  hidden marker: `<!-- ai-author: codex -->`, `<!-- ai-author: claude -->`, or
  `<!-- ai-author: human -->`. Reviewer independence follows this marker, not
  the PR opener or the shared commit identity. Update it if implementation
  ownership materially changes.

Keep this identity block within the first 180 lines. The Claude PR-review helper
injects that prefix into its review prompt and marks longer instruction files as
truncated.

## Release and Concurrent-Worktree Safety

- Before release work, fetch `origin` and record `HEAD`, `origin/main`, status,
  and `git worktree list --porcelain` evidence.
- The current task worktree is the sole authoritative writable checkout. Never
  mutate, switch, reset, clean, prune, delete, or write into sibling worktrees or
  their branches. Rebase only the current task branch onto current `origin/main`.
- `games.js` and `version.json` are shared merge surfaces. Preserve every game
  from the declared exact release base and each non-target game's complete
  descriptor and version, then run `npm run test:registry`.
- For Football releases, synchronize `GAME_VERSION` in `football/football.js`,
  every cache key in `football/index.html`, `games.js`, and `version.json`, then
  finish `football/progress.md` with a superseding release entry.
- `npm run test:football:release` is writeful because it recreates release
  artifacts. Run it only in the authoritative writable checkout, and give
  read-only reviewers the exact-head SHA and test/artifact evidence.
- Reviews and approvals must cover the exact final PR-head SHA. Any rebase or fix
  invalidates prior verdicts; a truncated or metadata-only review cannot approve.
- After merge, wait for the Pages deployment tied to the merge SHA, verify the
  live target version and unaffected registered games, then clean only this
  task's branch, ref, and temporary artifacts.

## Device Targets

Design and test against these devices in this priority order. When choices trade off between devices, favor the higher-priority one.

### Football

1. **iPad 11th gen (A16, 2025)** — 820×1180pt — **primary**. Played mostly in landscape (1180×820).
2. **iPad Pro 13" M4 (2024)** — 1032×1376pt — secondary.
3. **iPhone 15** — 393×852pt — must be playable.
4. **iPhone 17 Pro Max** — 440×956pt — must be playable.

Design rules:
- Optimize the desktop/tablet layout for iPad 11 landscape (1180pt) first.
- Touch-first. No hover-only interactions — every state must be reachable via tap.
- Tap targets ≥44pt in every tier.
- Breakpoints should cover all six device × orientation combos, not generic widths. Phone tier must include 440 (iPhone 17 Pro Max), not just ≤420.

### Kayak

TBD — document when prioritized.

### Prague

TBD — document when prioritized.

## Verification Matrix (Football)

Any UI change to football must be verified against the primary targets before merge. Minimum matrix:

| Device | Orientation | Must verify |
|---|---|---|
| iPad 11 | landscape (1180×820) | full playthrough + call grid above fold (no scroll) |
| iPad 11 | portrait (820×1180) | full playthrough + call grid above fold (no scroll) |
| iPad Pro 13 | landscape (1376×1032) | full playthrough + call grid above fold (no scroll) |
| iPad Pro 13 | portrait (1032×1376) | full playthrough + call grid above fold (no scroll) |
| iPhone 15 | portrait (393×852) | full offense cycle + call grid above fold (no scroll) |
| iPhone 17 Pro Max | portrait (440×956) | full offense cycle + call grid above fold (no scroll) |

Each full playthrough must exercise all overlay states: start, player-TD,
defense transition, offense transition, quarter-end, halftime, final — plus
offense call/question/feedback and defense call/question/feedback. It must also
cover a legal three-card fourth-down decision, the two-card conversion decision,
player and opponent conversion questions/results, and player/opponent punt or
field-goal questions/results. Choosing “go” must still render exactly five
offensive calls; ordinary defense must still render exactly four calls.

## Local Development

There is no build step. From the repository root, run:

```bash
python3 -m http.server 8080
```

Use `http://localhost:8080/`, `/football/`, `/kayak/`, `/prague/`, or
`/place-value-practice/`. Serving from the root preserves each game's
`../shared/` paths.

Install the pinned test dependency with `npm install`, then run:

```bash
npm run test:registry
npm run test:football
npm run test:football:release
```

Use `test:football` for the focused layout suite and
`test:football:release` for the complete football release matrix.

The registry gate resolves `REGISTRY_RELEASE_BASE` once to an exact commit
(default `origin/main`) and permits baseline changes only for
`REGISTRY_RELEASE_TARGET` (default `football`), while allowing genuinely new
games. Override both explicitly when validating another release target:

```bash
REGISTRY_RELEASE_BASE=<git-revision> REGISTRY_RELEASE_TARGET=<game-id> npm run test:registry
```

## Repository Structure

```text
games/
├── index.html, games.js       # portal and game registry
├── shared/                    # reset, fonts, and portal CSS
├── football/                  # DOM-based math quiz
├── kayak/                     # canvas kayak game
├── place-value-practice/      # place-value reading practice
└── prague/                    # canvas endless runner
```

The `place-value/`, `place-value-v5/`, and `place-value-v6/` folders are
intentionally preserved unregistered prototypes.

The portal renders entries from the global `GAMES` array in `games.js`. Add a
game by adding its `games.js` registry entry, a matching `version.json` key with
the exact same version, and its folder containing `index.html`.

## Architecture

Every game uses plain globals and ordered `<script>` tags; there are no modules
or bundlers. Preserve each `index.html` load order.

### Football

Football is DOM-based and keeps one UI `state` object, but its football and
instructional authority are split across ordered plain-global scripts:

`copy.js` → `learning.js` → `stats.js` → `opponent.js` →
`football-domain.js` → `contextual-questions.js` → `football.js`

- `football-domain.js` owns the immutable tagged `activePlay` union
  (`scrimmage`, `punt`, `fieldGoal`, `conversion`) and independently validated,
  type-specific transition projection/reprojection. `activeSnap` is only the
  derived scrimmage compatibility view.
- `contextual-questions.js` owns DOM-free, play-grounded question families and
  structured stable choices. Scrimmage and special-team pools consume only
  their closed public context shapes.
- `learning.js`, `stats.js`, and `opponent.js` own scheduling/support,
  privacy-safe linked history, and the exact frozen opponent plan respectively.
- `football.js` orchestrates the UI around authoritative `activePlay`,
  `questionInstance`, and `pendingResolution` contracts and commits each play
  atomically after instruction resolves. A six-point touchdown and its later
  conversion are distinct plays with distinct IDs; the conversion closes the
  possession.

### Kayak

Load order: `kayak.js` → `physics.js` → `renderer.js` → `levels.js` → inline
initialization.

- `kayak.js`: canvas, dimensions, game state, initialization, input, render loop.
- `physics.js`: lake geometry, collectibles, audio, effects, and `update()`.
- `renderer.js`: shared drawing plus all `drawScene*()` functions.
- `levels.js`: `LEVELS` definitions referencing renderer functions.

### Prague

Load order: `prague.js` → `chars.js` → `obstacles.js` → `renderer.js` → inline
`loop()`.

- `prague.js`: canvas, globals, input, update/reset/loop.
- `chars.js`: character definitions and rider drawing.
- `obstacles.js`: spawning, hit testing, and collision handling.
- `renderer.js`: backgrounds, player, obstacles, HUD, and screens.

## Routing and Deployment

Static hosts route each folder's `index.html` naturally—for example,
`/football/`. Publish the repository root with no build command.
