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
- Keep factual completion separate from the user-approved Football question
  ceiling. `includedThroughPage` may authorize later concepts without claiming
  those workbook pages are complete. Material introduced after factual
  completion starts with visible guided support.
- Summarize or cite lesson concepts in implementation notes and reviews. Do not
  paste long passages or reproduce workbook pages in generated artifacts.

## Learning Design Rules

- Keep football outcome/risk separate from instructional difficulty. Exciting
  play calls must not automatically force harder math.
- Distinguish computational difficulty from the size of a displayed number.
  Addition/subtraction fluency may remain within 10 or 20 while current place-
  value work legitimately reads, decomposes, compares, and moves through
  two-digit numbers up to 100.
- Use completed or explicitly included curriculum skills for graded questions,
  but only when the concept is genuinely supplied by the live football state.
  Approval through the end of a book authorizes concepts; it does not justify a
  random worksheet question during a snap. Clock, AM/PM, and calendar work must
  remain unscheduled until Football has a truthful relevant source for it. A
  future Coach Replay mode may provide pure curriculum practice without
  football stakes once that mode is designed explicitly.
- Keep question-family source metadata auditable. Workbook-derived families
  must name their earliest relevant workbook page; football-only display or
  rule literacy must be labeled separately and must not claim a workbook page.
- Give every question family one immutable `evidenceClass`: `literacy` when the
  child is reading a supplied number, place, marker, or football rule/value,
  and `independent` when the child must derive the answer. Source-visible
  answers are always literacy. Independent initial and guided visuals must keep
  `revealsAnswer: false` and `result: null`; only the worked state may reveal
  the answer.
- Keep scheduling, support, current-game mastery, durable mastery, and recency
  partitioned by evidence class. Evidence from one class must not strengthen,
  suppress, guide, or refresh the other. Migrated `unclassified` history is
  display/preservation-only and remains inert for adaptation and Coach Report.
- Every in-play question must be derived from the immutable public facts of the
  live tagged play. Scrimmage questions include the selected calls and exact
  proposed gain; conversion, field-goal, and punt questions consume only their
  own closed special-team context. The question gates that same frozen outcome;
  never substitute a random, merely football-themed, curriculum-only, or
  no-stakes question.
- Preserve the canonical football snapshot separately from every child-facing
  prompt, math model, and visualization. The snapshot and its independently
  projected transition are authoritative; presentation cannot change the play.
- Apply the same instructional profile and retry/support policy on offense and
  defense.

## Play Integrity and Recovery

- Complete and freeze one tagged `activePlay` (`scrimmage`, `punt`, `fieldGoal`,
  or `conversion`) before inspecting or constructing a question. Allocate its
  game, possession, play, and context IDs plus its type-specific context and
  proposal first. `activeSnap` is a derived compatibility view for scrimmage
  only; special-team facts must never be pushed through scrimmage-only helpers.
- On defense, a scrimmage play includes the player's defensive call, the hidden
  opponent call, their matchup, and the exact opponent snapshot shown before
  the selection. A punt, field goal, or conversion exposes its action publicly
  only when that frozen action is announced; no private planned call may leak.
- If a valid context has no eligible family or contextual question construction
  fails, bypass instruction and commit the already-proposed play
  deterministically. Log a diagnostic and a bypass telemetry record, but do not
  create learning attempts or mastery changes.
- If the football context, proposal, or projected transition is invalid, commit
  nothing. Return to the originating ordinary-call, fourth-down-decision, or
  conversion-decision phase. Preserve the exact opponent decision and frozen
  punt travel rather than rolling a new action, call, tendency, or distance.
- Resolve a play atomically. A correct answer or final retry freezes one pending
  transition; Continue applies only that transition, once. Validate the live
  game, possession, play, and context IDs before commit. Learning, football
  statistics, possession finalization, and result events must not double-count
  if a control is tapped repeatedly.

## Scoring, Decisions, and Placement

- A touchdown is six points. Its overlay is presentation only; continuing opens
  a fresh conversion play and question. A PAT is one point and a two-point try
  is two. The conversion has its own IDs and completes before possession,
  quarter, halftime, or final routing; the touchdown and conversion must be
  recorded exactly once each while the possession closes exactly once.
- Before a fourth-down scrimmage snap, player offense chooses go, punt, or a
  legal field goal. “Go” re-enters the unchanged five-call offense grid. The
  opponent decision table is pure and frozen before presentation; an opponent
  “go” re-enters the unchanged four-call defense grid, while punt/field goal is
  announced before its question.
- A field goal is worth three points, uses yards-to-goal plus 17, and is legal
  through 57 yards. A missed or blocked field goal hands off at the original
  absolute line of scrimmage. A normal punt freezes one 35–50 yard travel draw;
  the receiver-favorable policy uses 20 yards and cannot pin the receiver inside
  its own 20. Goal-line punts become touchbacks.
- Every terminal play carries an explicit next possession, absolute start yard,
  and restart reason. Scores restart at the scheduled receiving side's own 20;
  failed fourth-down goes restart at the canonical end spot. Q1→Q2 and Q3→Q4
  retain pending placement, halftime replaces it with the prescribed opponent
  start at absolute 80, and the Q4 final creates no restart.

## Determinism, Identity, and Privacy

- Keep football, instructional scheduling, and question presentation on
  separate RNG streams. Visual-only randomness must not affect any of those
  streams. A presentation change must never change the opponent call, proposed
  gain, selected question family, or football result.
- Player “go” keeps the existing one football-RNG draw; opponent “go” keeps the
  existing two. A normal punt consumes exactly one football-RNG draw. Opponent
  fourth-down/conversion decisions, field goals, conversions, and instructional
  success/failure consume none. Choice shuffling may use presentation RNG only.
- Carry stable `familyId`, `contextId`, and `questionInstanceId` values through
  question state, learning events, football telemetry, diagnostics, and result
  events. Telemetry may record bound numeric facts and IDs, but not prompt text,
  answer text, or unnecessary child data.
- Preserve opponent privacy. Before a defensive selection, UI and general game
  state may expose only the visible opponent look/tendency; the planned call is
  restricted to the private frozen snapshot and narrow test seams.

## Three-Game Season

- `season.js` is the sole authority for `footballMathSeason:v1` (inner schema
  1). It snapshots the three public rivals in `FOOTBALL_OPPONENT.RIVAL_ORDER`
  and stores one current season plus only the contiguous raw score results.
  Outcome labels, record, next rival, and completion are derived views.
- Changing rival IDs, `FOOTBALL_OPPONENT.RIVAL_ORDER`, or the three-game Season
  schedule is a persistence migration. Make an intentional schema/format
  migration decision; never silently invalidate or remap existing saved
  seasons.
- Reads never initialize, repair, migrate, or otherwise write. Malformed
  supported data requires explicit **Start Fresh Season**; a numeric future
  schema remains byte-for-byte untouched and disables only Season play.
- Every create, reset, new-season, or result mutation serializes in-tab and
  acquires the dedicated origin-wide exclusive Web Lock. The lock callback
  freshly reads storage, applies first-writer slot semantics, and performs at
  most one synchronous `localStorage.setItem`. Never add an unlocked fallback.
- Retain at most one immutable in-memory pending mutation. Creation/reset must
  save before a scheduled game starts. A failed final result blocks the next
  season game and offers Retry Saving or Quick Game; reload intentionally loses
  that pending memory and reopens the durable rung with a new live game ID.
- Keep the frozen live binding `{seasonId, gameNumber, rivalId, gameId}` outside
  `createGameState()`, learning, stats, opponent planning, and football-domain
  state. Quick Games must never write, replace, or clear the season.
- Only `commitPendingResolution()` may originate settlement, after it newly
  closes the last Q4 possession, finalizes stats, and dispatches the result
  event, but before delayed final presentation. A touchdown waits for its
  separate conversion. `showGameOver()`, routing, legacy release seams, boot
  modes, and presentation-only test helpers settle nothing.
- Public semantic output may expose only play mode, game number, rung statuses,
  worded W-L-T counts, next public rival ID, completion, and save state. Do not
  expose season IDs, pending payloads, raw storage/errors, prompts/answers,
  private opponent plans, or scheduler state.

## Play-History Semantics

- Keep the storage key `footballMathStats:v1`, but write only inner schema 4.
  Normalize schema-1 through schema-3 question, mastery, and recency evidence
  into the preserved `unclassified` bucket without rewriting on read; persist
  schema 4 on the next completed play. Schema-1 and schema-2 retain their
  legacy scrimmage/identity fallbacks, while schema-3 and later rows must keep
  strict typed play and stable identity contracts. Never overwrite an unknown
  future schema.
- Every current or future central writer for `footballMathStats:v1`, regardless
  of inner schema version, must acquire the origin-wide exclusive Web Lock
  `footballMathStats:v1:central-write`. Fresh-read, stable-play deduplication,
  aggregate/mastery updates, recent-row capping, and the single synchronous
  `localStorage` write all happen while that lock is held. If Web Locks or
  storage are unavailable or fail, retain session-local staged rows and do not
  fall back to an unlocked central write.
- Deduplicate completed rows by stable game/play ID for the lifetime of the
  central store. Keep `recentPlays` capped at 200. The internal
  `archivedPlayIndex` compacts production `${gameId}-play-${sequence}` identities
  to one monotonic watermark per game and retains an exact per-game fallback
  only for non-production IDs; do not expose that index through public history.
  Production allocates play sequences once and in order, and abandoned recovery
  IDs are never reused. A touchdown scrimmage and its conversion have separate
  rows; repeated answer/Continue/overlay controls cannot append another row or
  aggregate the same possession twice.
- Select adaptive-learning recency by valid `completedAt`, never journal order.
  Preserve the newest graded resolution per curriculum concept and evidence
  class in the internal `lastResolvedByConcept` index so a delayed write cannot
  become authoritative or displace newer same-class evidence when
  `recentPlays` is capped. Public history does not expose this persistence
  index.
- Conversion, field-goal, and punt rows use typed outcomes and metrics. Attempt
  value, kick distance, punt travel, and landing position must stay out of
  scrimmage `offeredYards`, `actualYards`, team offense, and drive-yard totals.
- Persist only privacy-safe public facts and stable IDs. Opponent decision and
  planned-call snapshots remain private and must not appear in history,
  diagnostics, result telemetry, or `render_game_to_text()`.

- `calls.offense` is the call made by the team with possession. During player
  defense, it is therefore the opponent's offensive call and intentionally
  matches the backward-compatible `calls.opponent` alias. `calls.defense` is
  the player's coverage choice.
- `offeredYards` remains non-negative. `actualYards` is signed net yardage from
  the team-with-possession perspective; sacks and losses are negative for that
  offense in either possession mode. Negative resolutions clip at the offense's
  own 1-yard line, and `driveTotal` is signed in the offense's direction.
- Every graded snap keeps the same coached retry and worked explanation. A
  second offensive miss resolves deterministically by frozen call family:
  short run -1 (stuff), short pass 0 (incompletion), medium pass -3 (sack),
  long run -2 plus fumble, and long pass 0 plus interception. Only the two long
  calls can turn the ball over. A second defensive miss remains a bounded
  opponent gain and never manufactures an opponent turnover.
