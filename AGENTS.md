# AGENTS.md

Source of truth for AI coding agents working in this repo (Claude Code, Codex, Cursor, Aider, etc.). Read this before making design/layout decisions.

## GitHub Attribution (Required)

For any GitHub write action in `michaeltorbert/games`, do not use the user's personal GitHub identity.

Required identity:
- Codex GitHub App auth profile: `games-codex`
- Codex visible GitHub actor: `codex-bot-mt[bot]`
- Claude GitHub App auth profile: `claude`
- Claude visible GitHub actor: `claude-bot-mt[bot]`
- Local git commit identity: `codex-michaeltorbert[bot] <3357630+codex-michaeltorbert[bot]@users.noreply.github.com>`
- The auth profiles, visible GitHub actors, and local git commit identity are separate values; do not assume they match.

Required behavior:
- Prefer `github-app-token` and `github-app-curl` for GitHub API writes. Use an explicit profile argument when you need to select the agent profile directly.
- Agent-specific defaults for GitHub writes:
  - Claude agents use `github-app-curl --profile claude` and appear as `claude-bot-mt[bot]`.
  - Codex agents use the default `games-codex` profile and appear as `codex-bot-mt[bot]`.
- When asked to perform a GitHub write, do it directly as the agent bot. Do not offer "draft for you to post" or "post as the user" as alternatives unless the user explicitly asks for personal-account posting. You may still ask clarifying questions about what to write.
- For issue comments, PR comments, PR reviews, PR creation, merges, labels, and similar GitHub writes, use the agent bot by default.
- Do not use connector-backed GitHub writes if they would attribute the action to `@michaeltorbert`.
- Before any commit, verify:
  - `git config user.name` = `codex-michaeltorbert[bot]`
  - `git config user.email` = `3357630+codex-michaeltorbert[bot]@users.noreply.github.com`
- If bot attribution cannot be guaranteed, stop and report that explicitly instead of writing as the user.

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
| iPad 11 | landscape (1180×820) | full playthrough |
| iPad 11 | portrait (820×1180) | full playthrough |
| iPad Pro 13 | landscape (1376×1032) | full playthrough |
| iPad Pro 13 | portrait (1032×1376) | full playthrough |
| iPhone 15 | portrait (393×852) | overlay spot-check |
| iPhone 17 Pro Max | portrait (440×956) | overlay spot-check |

Each full playthrough must exercise all overlay states: start, player-TD, defense transition, offense transition, quarter-end, halftime, final — plus offense call/question/feedback and defense call/question/feedback.
