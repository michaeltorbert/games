# Football Agent Instructions

These instructions apply to work under `football/` and supplement the
repository-level `AGENTS.md`.

## Curriculum Reference

- Use `Math Mammoth Grade 1-A.pdf` as the primary curriculum reference for
  issue #54 and future Football learning-system changes.
- The PDF is committed with permission from the license holder for educational
  use. Treat it as an intentional repository asset, not an accidental binary.
- The learner's dated progress and near-term lesson map live in
  `curriculum-progress.json`.
- Do not infer that the learner completed two pages on every calendar day.
  `usualPagesPerDay` is a pacing norm; `completedThroughPage` changes only when
  the user provides a new progress update.
- Summarize or cite lesson concepts in implementation notes and reviews. Do not
  paste long passages or reproduce workbook pages in generated artifacts.

## Learning Design Rules

- Keep football outcome/risk separate from instructional difficulty. Exciting
  play calls must not automatically force harder math.
- Distinguish computational difficulty from the size of a displayed number.
  Addition/subtraction fluency may remain within 10 or 20 while current place-
  value work legitimately reads, decomposes, compares, and moves through
  two-digit numbers up to 100.
- Use current and recently completed curriculum skills for graded questions.
  Upcoming or curriculum-only practice does not belong in a live snap. A future
  Coach Replay mode may provide pure curriculum practice without football
  stakes once that mode is designed explicitly.
- Every in-snap question must be derived from an immutable snapshot of the live
  football situation, including the selected calls and the exact proposed
  gain. The question gates that same frozen outcome; never substitute a random,
  merely football-themed, curriculum-only, or no-stakes snap question.
- Preserve the canonical football snapshot separately from every child-facing
  prompt, math model, and visualization. The snapshot and its independently
  projected transition are authoritative; presentation cannot change the play.
- Apply the same instructional profile and retry/support policy on offense and
  defense.

## Snap Integrity and Recovery

- Complete and freeze the football context before inspecting or constructing a
  question. On defense, this includes the player's defensive call, the hidden
  opponent call, their matchup, and the exact opponent snapshot shown before
  the selection.
- If a valid context has no eligible family or contextual question construction
  fails, bypass instruction and commit the already-proposed snap
  deterministically. Log a diagnostic and a bypass telemetry record, but do not
  create learning attempts or mastery changes.
- If the football context, proposal, or projected transition is invalid, commit
  nothing. Return to the same call phase; on defense, preserve the exact
  pre-snap opponent snapshot rather than rolling a new call or tendency.
- Resolve a snap atomically. A correct answer or final retry freezes one pending
  transition; Continue applies only that transition, once. Learning, football
  statistics, and result events must not double-count if a control is tapped
  repeatedly.

## Determinism, Identity, and Privacy

- Keep football, instructional scheduling, and question presentation on
  separate RNG streams. Visual-only randomness must not affect any of those
  streams. A presentation change must never change the opponent call, proposed
  gain, selected question family, or football result.
- Carry stable `familyId`, `contextId`, and `questionInstanceId` values through
  question state, learning events, football telemetry, diagnostics, and result
  events. Telemetry may record bound numeric facts and IDs, but not prompt text,
  answer text, or unnecessary child data.
- Preserve opponent privacy. Before a defensive selection, UI and general game
  state may expose only the visible opponent look/tendency; the planned call is
  restricted to the private frozen snapshot and narrow test seams.
