Original prompt: Finish Football issue #36. Use subagents as needed, have Codex 5.6 Sol Ultra implement the code, have Claude Fable 5 review it, and manage the full branch, PR, review, and completion process.

## Current scope

- Complete the repository-owned Playwright verification matrix for Football.
- Exercise production transition paths, not only direct overlay render helpers.
- Preserve screenshots for every required state across all six target projects.
- Fail on missing states and browser errors.
- Update the repository documentation so the supported commands and artifact paths are accurate.

## Work log

- Verified `michaeltorbert/games`, issue #36, and live `main` at `d5b7a1e`.
- Created `codex/issue-36-finish-harness` from `origin/main`.
- Corrected the repository-local Git author to `codex-michaeltorbert[bot]`.
- Started independent read-only audits for transition coverage, artifact retention, and issue acceptance.
- Confirmed the remaining gaps were production-path fidelity, five missing state screenshots, artifact lifecycle coupling, and stale documentation.
- Reworked the release matrix to drive both touchdowns and possession changes through live game flow, and all period boundaries through `finishPossession()`.
- Isolated Playwright scratch output from the canonical matrix and added exact pre-clean/post-verify artifact gates.
- Updated the Football verification manual with the complete release command, coverage, failure policy, and artifact paths.
- Passed the connected matrix on the primary iPad 11 landscape target.
- Passed the full Football release suite: 90/90 tests and 90/90 required artifacts across all six projects.
- Visually inspected representative phone, tablet portrait, and tablet landscape screenshots; no blocker found.
- Completed the skill-required browser-client smoke with a valid offense-call `render_game_to_text()` snapshot and no browser errors.

## Review outcome

- Published Codex-authored draft PR #68 through `codex-bot-mt[bot]`.
- Claude Fable 5 reviewed the committed PR through `claude-bot-mt[bot]` and approved it with no material issues.
- Classified the review notes; retained the intentional fail-closed behaviors and closed this session log so it is not stale on merge.

---

Original prompt: Complete Football issue #54 using the committed Math Mammoth Grade 1-A curriculum reference, with Codex implementing, Claude Fable 5 reviewing, and subagents assisting with curriculum, architecture, and verification.

## Issue #54 scope

- Use the explicit page-143 progress marker; never advance it from the usual two-pages-per-day pace.
- Separate football play choice from learning difficulty on offense and defense.
- Keep unstructured arithmetic within 10 while allowing completed place-value displays through 100.
- Treat pages 144+ comparison work as supported/no-stakes until progress is explicitly updated.
- Give one coached retry; after a second miss, show a worked explanation and require Continue before a modest fixed football setback.
- Keep visual math state separate from the real ball, yard line, down, and score.

## Issue #54 work log

- Added the licensed curriculum PDF, scoped Football agent guidance, and machine-readable page progress in commit `182c25d`.
- Consulted independent curriculum, architecture, and verification subagents.
- Consulted Claude Fable 5 before implementation and adopted its fixed retry/setback and session-only adaptation recommendations; rejected its seven-file rewrite as too broad for the current plain-global codebase.
- Added `learning.js` with curriculum purpose weights, three-question recency, per-skill support adaptation, bounded session events, and injected game-logic randomness.
- Replaced call-rating math selection with one shared scheduler for every offense and defense call and removed math-difficulty copy from call cards.
- Added completed-material question families for missing parts, differences, addition/subtraction within 10, fact families, teen decomposition, two-digit place value, plus/minus 10, and hundred-chart small moves.
- Added two-digit comparison as a page-144 supported/no-stakes preview.
- Added independent gap/hops, parts, base-ten, and comparison renderers over the field without mutating football coordinates.
- Added first-miss hint/retry, retry-correct full success, second-miss blocking explanation/Continue, offense no-gain setback, capped three-yard defense setback, and no-stakes neutral resolution.
- Extended `render_game_to_text()` and a narrow `window.__footballTest` surface with curriculum, attempt, math, commitment, and learning state.
- Added deterministic learning/property tests and extended the production release matrix with offense retry, defense retry, and explanation screenshots.
- Bumped Football and its cache-busting assets to v1.18.0.
- Passed the focused scheduler/flow suite and the primary iPad release matrix.
- Generated and verified all 108 required release screenshots across the six target projects; visually inspected retry and explanation states on the primary iPad and both phone widths.
- The first full release run had one transient external-resource `ERR_CONNECTION_CLOSED` in the iPad Pro call-layout test; the exact failed project rerun passed, and all 108 canonical artifacts verified.
- Completed the skill-required browser-client smoke with a live question snapshot and no browser error artifact.
- Claude Fable 5 reviewed draft PR #69 through `claude-bot-mt[bot]`, found no blockers, and left several non-blocking hardening notes.
- Addressed the actionable review notes by enforcing completed-page gates in the runtime scheduler, making bounded telemetry sequence IDs monotonic, removing a hidden dead highlight, simplifying the fixed James profile, and restoring test-only global state with `try/finally`.
- Re-ran the primary flow and the complete release gate after review fixes: 95 passed, 25 intentionally skipped, and 108/108 screenshots verified.

---

Original prompt: ok do the agreeded on recommendation from you + claude fable 5. spin up subagents as needed. use your skills and workflows needed, including your two collab skills

## Football learning and strategy foundation

- Verified `michaeltorbert/games` and started one integrated release branch from live `origin/main` at `30f35bf`.
- Consulted Claude Fable 5 in a repository-aware, read-only planning pass and used independent subagents for persistence, opponent behavior, mastery/reporting, pre-snap hints, integration, and review.
- Added privacy-conscious local play history with bounded recent rows, stable aggregates, exact-once resolution logging, safe malformed-data recovery, and fail-closed future-schema handling.
- Added situation-aware opponent play tendencies while preserving the existing coverage matchup model and deterministic seeded tests.
- Added explicit question concepts, persistent mastery summaries, a modest history-informed learning bias, and a compact current-game coach report on the existing final overlay.
- Added one truthful defensive pre-snap look and qualitative tendency per snap; the opponent's planned call is sampled once and never exposed before the player's choice.
- Added focused Playwright coverage for stats, opponent tendencies, mastery/reporting, and pre-snap hints, and included every new contract in the complete Football release command.
- Updated the manual verification checklist for the defensive read and final coach report.
- An independent integrated review caught the opponent's exact planned call in `render_game_to_text()`; sanitized the public semantic state to player-visible look/lean fields and retained exact-plan assertions behind the narrow test hook.
- Bumped Football and all cache-busting/version surfaces to v1.19.0.
- Passed the combined primary-target suite: 24/24 tests.
- Passed the complete six-device release gate: 144 passed, 60 intentional project skips, and 108/108 required screenshots verified.
- Visually inspected the defensive read and final coach report on all six targets; call grids, coach rows, and replay controls remain visible without clipping.
- Completed the browser-client defensive-call smoke with sanitized semantic state and no browser-error artifact.
- Opened draft PR #70 through `codex-bot-mt[bot]` with all four issues linked for closure.
- The first focused Claude review attempt stopped before posting when the organization hit its monthly spend limit. After access was restored, Claude Fable 5 reviewed the full untruncated PR diff at `9e8a49d` through `claude-bot-mt[bot]`, approved it with no material issues, and left five non-blocking future-hardening notes.
- Classified the review notes as cosmetic/schema clarification or future-feature/layout considerations; no current acceptance, correctness, privacy, or release blocker remains.

---

Original prompt: Make issue #54's football math genuinely arise from the live game situation, using Codex subagents as needed and conserving Claude usage until more capacity is available.

## Contextual Football math correction

- Reopened issue #54 and completed a multi-round Codex/Fable planning loop; the final issue plan has current-run Codex-Claude consensus.
- Created `codex/issue-54-contextual-football` from v1.19 at `3152fbb`, then rebased onto the workflow-only `origin/main` update at `9958827` before publication while preserving the merged learning-history, opponent-tendency, and coach-report work.
- Split non-overlapping pure-domain and contextual-question modules across Codex subagents while keeping the v1.19 game integration with the lead agent.
- Started the schema-version-2 learning-event and positive-recency scheduler migration; Claude implementation review is intentionally deferred while the user's current Claude session is near its limit.
- Added a recursively frozen, DOM-free football domain that normalizes canonical field coordinates and independently projects or reprojects every touchdown, first down, fourth-down turnover, and ordinary advance.
- Added a DOM-free contextual question seam with page-143 curriculum gates, closed operations, dereferenceable context/rule bindings, structured stable choices, staged accessible visuals, and exhaustive two-direction property coverage.
- Rewired offense and defense so the full call/matchup and proposed transition are frozen before scheduling; valid question subsystem failures now bypass instruction and commit the exact verified play, while invalid context/projection commits nothing and preserves the defensive pre-snap read.
- Split football, scheduler, and presentation randomness into independent seeded streams; IDs and telemetry consume no logical RNG draws.
- Replaced flattened resolution authority with `activeSnap`, `questionInstance`, `pendingResolution`, and mutable `questionUi`; second-miss learning resolves before Continue, while the football reducer commits only the already frozen zero-yard/capped transition and ignores duplicate Continue.
- Upgraded learning events and persisted football stats links to schema 2 with family/context/question-instance IDs, plus v1 stats migration and explicit presented/bypassed rows.
- Added focused production-handler integration coverage for grounding, both possession resolution tables, exact-once commits, fault injection, telemetry privacy, and RNG isolation; the initial combined domain/context and learning/integration run passed 40/40 checks.
- Bumped Football and every cache-busting/version surface to v1.20.0. Claude implementation review remains deferred to preserve the user's near-limit session.
- Removed the unreachable legacy random-question bank so the only runtime instructional path is the snap-grounded contextual system.
- Independent Codex review caught and closed four edge contracts before publication: guided support can never reveal a worked answer after the first miss; late UI preparation rolls back and rethrows instead of masquerading as a bypass; every diagnostic carries the stable three-ID linkage shape; and each completed defensive snap privately owns the exact frozen pre-snap opponent plan.
- Added invalid-projection, preparation-rollback, private-snapshot privacy, guided-retry, and Replay session regressions.
- Passed the final complete six-device release gate: 25/25 Node checks, 160 Playwright tests passed, 140 intentional project skips, and 108/108 canonical screenshots verified.
- Visually inspected offense question/retry and defense question/explanation states across representative iPad and phone targets; the live situation, answer controls, support, and Continue action remain readable and reachable.
- Completed the prescribed browser-client smoke on a live offense question; `render_game_to_text()` exposed the sanitized snap-grounded contracts and no console/page-error artifact was produced.
- Used no additional Claude capacity during implementation or verification; the implementation review remains intentionally deferred until the user's quota refreshes.

---

Original prompt: Expand Football question content through the end of Math Mammoth Grade 1-A while keeping every question relevant to the live game situation and conserving Claude usage.

## Full-book question ceiling refinement

- Audited the licensed 179-page workbook directly. Printed and PDF page numbers match; page 143 remains the last actually completed page, while page 179 is now the user-approved Football question ceiling.
- Separated `completedThroughPage: 143` from `includedThroughPage: 179` so authorization does not falsely claim completion. Material introduced after page 143 begins with visible guided support.
- Kept general computation within 10 while raising the honest display band to 120.
- Added grounded families for proposed gain versus yards needed, real cumulative team yards crossing 100 through 120, and the current play's ordinal place in its drive.
- Audited every family against the workbook: workbook-derived metadata now records the exact earliest source page, football-only literacy is marked separately, and the play-versus-need comparison stays in its genuine page-39 band through 16 instead of masquerading as the later page-145 place-value lesson.
- Kept optional skip-counting unscheduled except where the existing whole-ten field-distance work already follows real 10-yard movement; inventing equal “jumps” inside a play would not describe the snap truthfully.
- Added authoritative player/opponent cumulative-yard totals to the frozen snap, exact-once reducer, stats context, test seeding, and semantic state.
- Kept workbook clock, AM/PM, and calendar topics authorized but unscheduled: Football has no truthful live-snap clock or date fact, so injecting them would recreate the unrelated-math problem from issue #54.
- Added explicit visual renderers, accessible comparison labels, specific Coach Report labels, and visible guided-first hints for included-but-not-completed content.
- Passed the complete six-device release gate after the full-book refinement: 26/26 Node checks, 161 Playwright tests passed, 145 intentional project skips, and 108/108 canonical screenshots verified. A final strengthened source/support assertion also passed 7/7 on the primary iPad project.
- Used no Claude capacity for this refinement; independent Codex curriculum and code audits supplied the second-agent review.

---

Original prompt: btw we just completed through 145 today

## Curriculum progress update

- Advanced factual Math Mammoth Grade 1-A completion from page 143 to page 145 as of 2026-07-14, based on the user's explicit update rather than inferred pacing.
- Kept the separately approved Football question ceiling at page 179.
- Moved the completed comparison work from pages 144-145 into the review band; pages 146-179 remain included but not yet recorded as completed and therefore open with guided support when a truthful live-snap family exists.
- Passed the focused update checks (26/26 Node contracts and 22/22 primary-iPad learning/integration tests), then passed the complete release gate again: 161 Playwright tests, 145 intentional project skips, and 108/108 canonical screenshots across six targets.
- Completed the browser-client smoke on a live question, inspected the rendered gameplay state, and found no browser-error artifact.

---

Original prompt: Fix the three validated post-review findings, add focused regression tests, use Opus 4.8 for the main review, and reserve one Fable 5 pass for the final audit.

## Post-review hardening

- Added failing-first regressions for rejected-commit stats cleanup, the lean awaiting-answer contract, and correct-versus-missed/bypassed defensive fourth-down audio.
- Cleared the abandoned in-memory stats draft whenever an invalid snap is rolled back.
- Restored the positive cue only for correct defensive turnover-on-downs resolutions; second misses and question-subsystem bypasses remain silent.
- Removed the unused precomputed awaiting-answer resolution table; chosen transitions continue through independent validation before commit.
- Confirmed the focused regressions fail against the old behavior, then pass 27/27 on the primary iPad project after the three production fixes.
- Completed the browser-client smoke on a live offense question with linked snap/question IDs, truthful semantic state, and no browser-error artifact.
- Passed the complete release gate: 26/26 Node checks, 168 Playwright tests passed, 150 intentional project skips, and 108/108 canonical screenshots across all six targets.
- Visually inspected offense-question, defense-question, and defense-feedback screenshots on the primary iPad and both phone widths; controls and feedback remain readable and reachable.

---

Original prompt: Execute the agreed two-release Football plan from current live main: first fix the validated commit-integrity defects in v1.20.1, then add the approved adaptive refreshers and grounded question families in v1.21.0, using subagents and independent model review before each release.

## Football v1.20.1 integrity patch

- Fetched and verified live `origin/main` at Football v1.20.0, archived the older adaptive WIP on a local-only branch, and created `codex/football-v1201-integrity` directly from the live commit.
- Replaced candidate-authorized transition reprojection with an explicit expected-gain domain contract and a frozen-snap policy table covering correct, retry, second-miss, and question-bypass outcomes on offense and defense.
- Delayed second-miss learning and stats resolution until the canonical football transition commits successfully; rejected and duplicate Continue paths now leave mastery and rate denominators unchanged.
- Restored late defensive failures only from the completed snap's private frozen opponent snapshot, never from the mutable UI mirror.
- Triaged newly filed issues #74 and #75 into the patch: removed the pre-answer tens/ones decomposition leak, kept the requested place count hidden through initial and guided stages, fixed singular labels, and replaced child-facing implementation jargon with plain football language.
- Added failing-first domain and production regressions for exact policy authorization, near-goal clipping, rejected/idempotent second misses, both late defensive rejection branches, answer-hidden initial/guided visuals, and plain-language copy.
- Closed final independent-review copy findings with shared singular-unit grammar, explicit tens/ones-digit prompts, and regression tables for one-yard/one-space boundaries.
- Passed the focused production integrity suite, including every policy mapping, unknown-policy fail-closed recovery, duplicate Continue idempotency, both defensive rollback branches, and the four answer-leak distances.
- Isolated the first run's single iPad Pro particle-timing failure; the exact rerun passed, and the subsequent complete gate passed cleanly with 30/30 Node checks, 177 Playwright passes, 195 intentional project skips, and 108/108 canonical screenshots verified across all six targets.
- Visually inspected primary-iPad offense/defense questions, the phone question layout, and the large-iPad final report; child-facing copy, answer controls, and above-the-fold layout remain readable without exposing a hidden answer.
- Completed the prescribed browser-client smoke on a live offense question; `render_game_to_text()` reported a linked, uncommitted question state and no browser-error artifact was produced.
- Published Codex-authored draft PR #76 through `codex-bot-mt[bot]`; Opus 4.8's full-diff pass confirmed the commit/rollback/answer-withholding invariants and identified one theoretical 100-yard place-value boundary.
- Made the two-digit family contract explicitly 10 through 99 and added a maximum-legal-distance plus malformed-100-yard regression; focused unit and browser checks pass.
- Follow-up Opus review, merge, and live deployment verification remain TODO.

### v1.20.1 release closure

- Opus 4.8 independently approved the exact final patch through `claude-bot-mt[bot]` after the 100-yard place-value boundary was made explicitly ineligible.
- Squash-merged PR #76 through `codex-bot-mt[bot]` as main commit `76fca1920a01a57b23b60c69e12273b1b4feb185`.
- Verified the exact merged commit's successful Pages deployment and uncached live Football v1.20.1 assets; issues #74 and #75 closed with the merge while the broader tracking issue #72 remains open.

---

Original prompt: Continue the agreed two-release plan from freshly deployed v1.20.1, implementing adaptive mastered refreshers and the approved football-native quarter/half, teen-score, and whole-ten practice with Codex as author, subagent review, Opus as the main reviewer, and one minimal Fable final pass.

## Football v1.21 adaptive refreshers

- Created `codex/football-v121-adaptive-refreshers` directly from deployed main commit `76fca192` and kept the archived pre-v1.20 attempt local-only as design evidence rather than copying obsolete code.
- Added failing-first persistence contracts: historical missing or malformed timestamps are no longer converted to the current time, schema-1 reads no longer write, and normalized schema-2 data persists only with the next real completed play.
- Added a read-only learning snapshot that returns per-concept mastery and the newest valid graded resolution while skipping bypassed, no-stakes, and invalid-date evidence.
- Added per-concept mastery thresholds (four resolutions, at least 80 percent first-try, at most 10 percent second-miss), a nonzero 0.25 fresh refresher multiplier, linear 30-day restoration, and a 1.25 rebound after supported work.
- Tracked the latest current-session resolution separately so struggle raises practice immediately but a later first-try success can refresh the same mastered concept instead of leaving the struggle boost sticky.
- Added a low-weight `half-read` question to the ordinary per-snap pool for all four quarters; it uses only the frozen quarter and is not restricted to period breaks.
- Added graded tens/ones questions for actual committed scoreboard values from 10 through 19, including 14, with the requested decomposition hidden until worked support and no invented touchdown arithmetic.
- Kept the existing exact whole-ten movement families and added bidirectional regressions proving 10/20-yard moves qualify while 5/15/25-yard moves do not; no by-5 family was added.
- Kept defense, four-quarter game length, page-145 completion, page-179 question ceiling, and the v2/localStorage key contract unchanged.
- Bumped Football and all 13 cache-busting/version surfaces to v1.21.0.
- The first full matrix exposed a cross-feature contract: binary half choices made a distinct second miss impossible after the first wrong choice was disabled. Replaced them with four truthful game-stage choices and added the minimum-two-wrong-choice regression; all six device projects now exercise the second-miss path.
- Independent Codex implementation and test-gap reviewers found no blockers. Adopted their useful hardening for mastered-family scheduler reachability, exact below-threshold multipliers, both teen-score place families on a reverse/defensive snap, and every release-version/cache surface.
- The first full run's particle and mocked-clock failures passed exact isolated reruns and were confirmed as timing-only. A later matrix run caught the real binary-choice issue above.
- Passed the final clean release gate: 32/32 Node contracts, 180 Playwright passes, 210 intentional cross-project skips, and 108/108 canonical screenshots verified across all six device targets.
- Visually inspected coherent v1.21 teen-score and Q3-half questions on the primary iPad layout plus representative phone explanation and ordinary-question frames; the source facts, hidden answers, four touch targets, and Continue action remain readable and reachable.
- Completed the prescribed browser-client smoke on a live offense question; `render_game_to_text()` reported one linked, uncommitted, answer-hidden question and produced no console/page-error artifact.

---

Original prompt: For football, find what to work on next, use concurrent issues where safe, and orchestrate independent multi-model planning, implementation, and review rounds through consensus.

## Football v1.21.1 issue #72 hardening

- Verified live `origin/main`, the open Football backlog, and the absence of an active PR before selecting work.
- Selected issue #72 as the next coherent patch. Deferred the subjective field-image issue because it needs a separate visual direction and approval path rather than sharing this correctness release.
- Reconciled independent Opus 4.8, Grok 4.5, GPT-5.6 Sol Ultra, Claude, and Fable 5 planning passes around five narrow contracts: distinct Coach Report concepts, documented call semantics, safe missing-snapshot recovery, signed historical actual yards, and explicit compact-overlay coverage.
- Bumped Football to v1.21.1 and added the production fixes, contract documentation, focused regressions, and the `1180x740` compatibility artifact. Implementation and review verification are in progress.
- Passed all 32 domain/property checks and 37 focused primary-iPad browser contracts. Visually inspected the compact final-overlay artifact with the longest fallback copy, then completed the prescribed live browser-client question smoke with truthful linked state and no console/page-error artifact.
- Passed the complete release gate: 32/32 Node contracts, 184 Playwright tests passed, 230 intentional project skips, and 108/108 canonical screenshots verified across all six targets. Visually inspected every device's final overlay plus the compact compatibility artifact; Coach Report rows and replay controls remain readable and fully in frame.
- Closed the Sol Ultra/Opus implementation loop with Opus approval, then completed the broader Grok 4.5, Gemini 3.1 Pro High, fresh Sol Ultra, and fresh Opus 4.8 review round with unanimous satisfaction. Explicitly rejected two behavior-neutral observations (a defensive Coach Report fallback and an ignored `return false`) as no-value churn; the finite-number concern was stale because `safeNumber` already requires `Number.isFinite`.
- Completed a fresh repository-aware Fable 5 audit after expanding its read budget; it inspected the relevant Football state machine, domain, persistence, privacy, UI, tests, and release surfaces and found no actionable or user-call issue. Four new reviewers—Opus 4.8, GPT-5.6 Sol Ultra, Gemini 3.1 Pro High, and Grok 4.5—then reviewed Fable's findings and unanimously accepted them with no action, closing final consensus without another implementation cycle.

## Football v1.22.0 issue #26 negative-play outcomes

- Added deterministic play-family setbacks after the coached retry: stuffs, incompletions, sacks, and risky-call fumble/interception turnovers.
- Added signed negative-yard projection with own-1 clipping, football-legal long distance-to-go contexts, signed history totals, and exact-once turnover possession handoff.
- Added domain, question-pool, stats, and browser regressions covering both field directions, 2nd-and-13 continuation, negative cumulative totals, fourth-down precedence, and turnover idempotency.

---

Original prompt: Implement michaeltorbert/games issue #79 using Codex subagents, with Grok and Gemini/Antigravity participating in round-robin planning and code review; do not use Claude.

## Football issue #79 natural down questions

- Verified the live issue, current `origin/main`, and a clean checkout before creating `codex/issue-79-natural-down-questions`.
- Confirmed the baseline contextual-question suite passes 18/18.
- Started independent Codex code-archaeology, test-strategy, and child-facing pedagogy planning passes.
- Reconciled two planning rounds across Codex, Grok 4.5, and Gemini 3.1 Pro High: replace `down-read`, retire `drive-play-ordinal`, keep `quarter-read` and `half-read`, and use the frozen proposal for both ordinary progression and non-tautological first-down resets.
- Agreed that the new modeled visual shows the live down, distance, and proposed gain while keeping the next down hidden until worked support.
- Replaced `down-read` with frozen-proposal `next-down`, retired `drive-play-ordinal`, marked the low-value ordinal conversion unscheduled, and bumped Football to v1.22.1.
- Added forward/reverse progression, first-down reset, exclusion, grounding, copy, nonempty-pool, production commit, and six-device layout regressions.
- Passed 44/44 focused domain/context contracts plus the primary production-path and six-device next-down browser checks; visually inspected the phone, tablet portrait, and primary landscape artifacts.
- Completed the prescribed browser-client smoke on a live question with linked semantic state and no console/page-error artifact.
- Passed the complete release gate: 44/44 Node contracts, 196 Playwright tests passed, 260 intentional project skips, and 108/108 canonical screenshots verified across all six required device projects.
- Completed independent final-diff reviews with Grok 4.5 and Gemini 3.1 Pro High. Gemini's initial negative-gain concern was rejected as stale after validating that snap proposals are non-negative at both the domain and contextual-question boundaries; negative outcomes exist only in post-question reprojection. Both reviewers accepted that disposition and closed the round robin with consensus to accept the unchanged patch.

---

Original prompt: Implement Football issue #25 with multi-model planning, implementation, review, release, and cleanup.

## Football v1.23.0 selected-call question affinity

- Added possession-scoped question-family affinity keyed to the player's selected offensive play or defensive coverage, never the private opponent plan.
- Kept truthful contextual eligibility, curriculum bounds, adaptive need, mastery, recency, and independent RNG streams authoritative; affinity only applies a bounded positive scheduling preference.
- Added immutable, privacy-safe selection provenance and deterministic coverage for call-registry completeness, neutral behavior, defensive privacy, and scheduler draw counts.
- Measured representative standard-drive pools at 3.12% generic quarter/half scheduling without affinity and 2.37% with affinity, a 24.04% relative reduction while both families remain reachable.
- Passed the complete release gate: 46/46 Node checks, 199 Playwright tests passed, 275 intentional project skips, and 108/108 canonical screenshots verified across all six device projects.
- Completed Sol Ultra implementation and review loops plus independent Opus, Grok, and Gemini review with no unresolved findings. The single prepared Fable audit reached inference but exhausted its hard 12-turn cap without producing findings and was not retried.
- Bumped Football and all release/cache surfaces to v1.23.0.

---

Original prompt: Implement the next Football issue with GPT-5.6 Sol Ultra writing, Opus 4.8 reviewing, Grok and Gemini/Antigravity in the planning and broad-review round robins, and one quota-guarded Fable 5 planning pass for the other agents to consider.

## Football v1.24.0 issue #31 rival teams

- Verified live issue #31, `origin/main` at `a5797b0`, bot attribution, and the existing opponent/privacy architecture before creating `codex/issue-31-rival-teams`.
- Passed the focused baseline opponent-tendency and pre-snap privacy suite: 8/8 checks on the primary iPad target.
- Ran independent planning passes with Opus 4.8, Grok 4.5, Gemini 3.1 Pro High, and GPT-5.6 Sol Ultra. The one explicitly approved Fable 5 planning call reached inference but exhausted its hard 12-turn cap without findings; it was not retried and no Fable position was inferred.
- Reconciled and unanimously approved one implementation contract across all four normal lanes: three selectable opponents total (UNC balanced/default, NC State power run, Wake Forest quick/spread pass), a frozen identity catalog separate from behavior profiles, and a public match descriptor carried through the authoritative snap lifecycle.
- Locked the privacy and determinism rules: rival selection consumes no gameplay RNG; every defensive plan is sampled once; the private opponent ID/profile/call must match the frozen public match context; public state exposes only identity plus qualitative look/lean; learning and stats schemas remain unchanged.
- Visual thesis: one stable Duke broadcast with each visiting rival expressed through a concise name, scouting style, and controlled away-color accent rather than a full reskin. The start interaction previews a rival, Start commits it for the match, and Play Again returns to the picker with the last rival selected.
- Planned verification covers frozen registry/profile invariants, default UNC/RNG compatibility, full match and recovery lifetime, cross-rival domain rejection, every dynamic label/question/ARIA surface, accessible 44px picker controls, all six device targets, non-default rival screenshots, the focused suite, and the complete release gate.
- Corrected the release-blocking iPad portrait Wake Forest wrap with a tablet-portrait-only one-column picker; both required iPad portrait screenshots keep the selected name and Start CTA cleanly above the fold.
- Added a rendered-line regression at Wake selection and passed the focused picker plus full matrix path on all six release projects (12/12), followed by a browser-client start-state smoke with no browser errors.
- Completed the Sol Ultra/Opus implementation loop, including focus-trap, rival-query fallback, contrast, and public-profile privacy corrections. Public match/read/render projections now expose no opponent profile key, while private opponent ID/profile/planned-call mismatches still fail closed.
- Passed the final complete release gate: 48/48 Node contracts, 217 Playwright checks passed, 305 intentional cross-project skips, and 120/120 canonical screenshots verified across all six required device projects. One unrelated fixed-timer particle check missed once under the parallel load, then passed 10/10 in isolation and the unchanged complete gate passed on rerun.
- Visually inspected the Wake Forest start and defensive-read artifacts across the release matrix, including both corrected iPad portrait layouts; names, selected state, touch targets, and Start CTA remain readable and fully in frame.
- Closed the final review round with Grok 4.5, Gemini 3.1 Pro High, and GPT-5.6 Sol Ultra approval. The Opus 4.8 lane's only requested change claimed `render_game_to_text()` was undefined; this was rejected as wrong because `football.js` explicitly exports it and the full browser matrix invokes it successfully. No valid P0-P2 or durable follow-up remains.

---

Original prompt: Implement Football issue #23 through the reconciled six-point touchdown, conversion, fourth-down decision, special-teams placement, and stats schema-v3 contract, then release the completed work as v1.25.0 with complete verification.

## Football v1.25.0 issue #23 scoring and special teams

- Reconciled the implementation contract around a tagged `activePlay` authority for scrimmage, punt, field goal, and conversion plays, with closed type-specific contexts and independently validated projections.
- Changed touchdowns to six points and made the PAT/two-point conversion a distinct instructional play with its own IDs, stats row, commit guard, and possession-closing lifecycle.
- Added pre-snap fourth-down go/punt/legal-field-goal decisions, deterministic private opponent decisions, direction-aware kick placement, and explicit restart reasons carried through quarter and halftime routing.
- Migrated the inner play-history schema to v3 while retaining `footballMathStats:v1`, preserving read-only v1/v2 normalization, future-schema fail-closed behavior, privacy-safe telemetry, typed special-team metrics, and exactly-once rows.
- Added separate accessible two/three-card decision UI, TRY scorebug semantics, non-color live result text, and release artifacts for player/opponent decision, conversion, punt, and field-goal states without changing the exact five/four normal call grids.
- Bumped `GAME_VERSION`, all 13 Football asset cache keys, the portal registry, and the version manifest together to v1.25.0. The final `npm run test:football:release` passed: 64 DOM-free checks passed with 0 failures; Playwright recorded 253 passed, 365 intentional project-scope skips, and 0 failures; posttest verified all 228 Football release screenshots across all six projects.
- Follow-up browser repairs made decision-grid focus synchronous, validated ordinary terminal misses from their policy intent instead of feeding derived result kinds back as forced outcomes, removed the stale `activeSnap` compatibility authority from pending resolution, and preserved canonical active-play references in the derived scrimmage view.
- Strengthened tagged-play policy and canonical-reference regressions without removing the existing focus, privacy, transition, or accuracy assertions. Earlier targeted checks also passed: primary integration 44/44, primary release matrix 4/4, and six-device focused call layout 18/18.
- The final phone-only repair added a `<=420px` fourth-down action-panel spacing correction after the focus and authority fixes. Its formerly failing iPhone 15 test passed, and visual inspection confirmed all three cards fully in frame; the complete browser release gate is green.

---

Original prompt: Repair the validated Football issue #23 release blockers and lower-priority contract/accessibility gaps in the existing v1.25.0 checkout without committing or changing release/cache surfaces.

## Football v1.25.0 issue #23 contract-repair pass

- Corrected receiver-favorable punt precedence so every goal-line crossing is a touchback in both directions, while non-crossing favorable punts retain the receiving-own-20 cap.
- Split special recovery identity policy: an unchanged, fully frozen rejected play may retain its IDs, while invalid-context creation failures and commit-time live drift retain diagnostic links but allocate fresh play/context IDs for rebuilt facts. Retries still preserve the action, conversion attempt type, opponent decision, and frozen punt draw.
- Closed initial special-play, public match/team, context-ID, and scrimmage call-key contracts at both domain and contextual-question boundaries.
- Restricted special instructional bindings and runtime learning events to an explicit outcome-independent allowlist; removed unused special Coach Report labels.
- Added synchronous keyboard focus transfer, one visible polite feedback source, and rendered-action-aware normal/recovery copy for fourth down and conversions.
- Added direct domain/context, recovery, keyboard, live-region, telemetry, punt touchback, and 24-case special audio-policy regressions.
- Passed 67/67 DOM-free domain/context/stats contracts, 48/48 primary contextual integration checks, 5/5 primary audio checks, and 12/12 primary stats/release-matrix checks.
- Ran the prescribed browser-client smoke on a live offense question; the rendered question/answers matched `render_game_to_text()` and no console/page-error artifact was produced.
- Passed the broad six-project `npm run test:football` layout suite (18/18) and the focused primary copy/accessibility/learning/coach checks (19/19).
- Closed the 57/58-yard recovery boundary so a field goal that becomes illegal under changed live facts reopens the currently legal player choice or deterministic opponent decision instead of trapping the game on an unusable retry card.
- The orchestrator's final `npm run test:football:release` gate passed: 67 DOM-free checks, 259 Playwright passes, 395 intentional project-scope skips, and all 228 canonical screenshots verified across all six required device projects.
- Hardened schema-v3 persistence around the permanent `footballMathStats:v1:central-write` Web Lock: rows stage synchronously for live views, merge against a fresh lock-time read, never fall back to an unlocked write, preserve future schemas byte-for-byte, and deduplicate stable plays across tabs.
- Added a compact private `archivedPlayIndex` so replay protection survives the 200-row journal cap, plus private `lastResolvedByConcept` evidence so a delayed older row cannot replace newer learning evidence even when the journal cap displaces that newer row. Deterministic regressions cover concurrent tabs, stale tabs, cap eviction, transitional archive migration, exact fallback IDs, and permanently retired production sequence gaps.
- Closed the final review delta with fresh Sol Ultra and three independent specialist/broad reviewers all reporting no P0-P3 findings; the archive test specialist explicitly confirmed its prior P3 coverage debt resolved. Opus hit its monthly-spend 429, Gemini authentication expired, Grok reached its turn cap, and the single quota-controlled Fable planning call had already exhausted its hard turn cap, so no unsupported five-model final consensus is claimed.
- The superseding complete `npm run test:football:release` gate passed: 82/82 DOM-free checks, 263 Playwright passes, 415 intentional project-scope skips, and all 228 canonical screenshots verified across all six required device projects.

---

## Football v1.25.0 issue #23 release-record correction

This append-only correction supersedes only the final reviewer-availability and
release-gate bullets in the preceding contract-repair pass. Earlier counts
remain a truthful record of intermediate runs.

- The final PR #85 head `94b5cf766db7ccf2eba4b472105a31f2d6153096` passed
  `npm run test:football:release`: 84/84 DOM-free, 265 Playwright, 425
  intentional skips, and 228/228 screenshots across all six projects.
- The current-session review ledger records Opus 4.8, GPT-5.6 Sol Ultra,
  Gemini 3.1 Pro (High) through Antigravity, and Grok 4.5 approving the same
  post-Fable corrected implementation working tree with no unresolved P0-P3
  findings. It was then cleanly rebased onto Place by Place main; the exact
  rebased PR head passed the full release gate and received separate exact-head
  Opus approval.
- The single authorized Fable 5 audit found a real observer-delivery problem.
  It was fixed and reviewed by the normal lanes, but Fable did not re-review,
  so no five-model consensus is claimed.
- Exact-head approval and bot attribution are recorded in the bot-attributed PR
  record; merge and Pages-deployment evidence is recorded in GitHub PR metadata
  and Actions; the current live version is externally verifiable but is not
  recorded in a bot-attributed PR/issue comment. None of those earlier
  implementation reviewers approved this later documentation/test safeguard
  patch.

---

## Football workflow documentation/test safeguard verification

- Added concurrent-release/worktree rules and a two-test registry, manifest,
  and folder-parity gate. The folder scan uses Git ignore classification so
  generated ignored index folders do not masquerade as games, while tracked and
  untracked non-ignored folders remain visible. The preserved prototypes are
  explicit; Place by Place remains v1.1.0, and all runtime and version surfaces
  remain unchanged.
- Orchestrator-run focused evidence: `npm run test:registry` passed 2/2; a
  physical ignored `playwright-report/index.html` mutation remained excluded
  and passed 2/2; a physical non-ignored unexpected top-level index folder
  failed the exact folder-parity assertion as intended.
- The orchestrator-run complete gate on this safeguard implementation passed:
  `npm run test:football:release` recorded 86/86 DOM-free checks, 265 Playwright
  passes, 425 intentional project-scope skips, and 228/228 verified screenshots
  across six projects.
- Those commands were run by the orchestrator, not by the earlier issue #23
  implementation reviewers. None of those reviewers approved this later
  safeguard patch; Fable did not re-review, and no five-model consensus is
  claimed.

---

## Football registry exact-base preservation safeguard

- Closed PRJ-001 by resolving `REGISTRY_RELEASE_BASE` once to an exact commit
  (default `origin/main`) and limiting baseline changes to
  `REGISTRY_RELEASE_TARGET` (default `football`). Every baseline game must
  remain; each non-target registry descriptor and manifest version must match
  exactly, while target-only changes and genuinely new games remain allowed.
- Added deterministic baseline regressions proving coordinated
  registry/manifest removal, synchronized non-target descriptor/version drift,
  and a stale checkout missing a baseline game all fail. Separate
  current-registry, manifest, folder-parity, preserved-prototype, and Git-ignore
  checks remain.
- The real comparison resolved `origin/main` to
  `d591a6c87a0820126313327723091e62dd3cf539`; Place by Place remains v1.1.0,
  and all runtime, registry, manifest, and cache/version surfaces remain
  unchanged.
- Final authoritative-worktree verification passed after this entry:
  `npm run test:registry` passed 4/4, and `npm run test:football:release` passed
  88/88 DOM-free checks, 265 Playwright passes, 425 intentional project-scope
  skips, and 228/228 verified screenshots across six projects.
- These checks belong to this later documentation/test safeguard patch, not the
  earlier issue #23 implementation review. No other model or Fable re-reviewed
  this patch, and no five-model consensus is claimed.

---

Original prompt: Implement Football issue #30 as v1.26.0 with one browser-local fixed three-game UNC, NC State, and Wake Forest season ladder; preserve Quick Game; make season persistence locked, strict, retryable, and concurrency-safe; settle only from the authoritative final production play; add child-facing start/final recovery UI; and ship complete domain, browser, six-device, release, architecture, and progress coverage without committing or publishing.

## Football v1.26.0 issue #30 three-game season ladder

- Added the DOM-free frozen `season.js` authority after `opponent.js`. It owns
  strict inner-schema-1 validation and derivation for one fixed three-rival
  season, callback-time fresh reads under a dedicated exclusive Web Lock,
  first-writer rung semantics, in-tab serialization, one immutable pending
  mutation, storage-event conflict refresh, and read-only malformed/future
  recovery behavior. It consumes no football, scheduler, or presentation RNG.
- Kept the live scheduled-game binding outside canonical game, learning, stats,
  opponent, and football-domain state. Quick Game remains the existing rival
  picker and never writes, replaces, or clears season bytes. Abandoned games
  leave the durable rung open and receive a new live game ID after reload.
- Reused the start and final overlays for accessible 44pt Quick Game / 3-Game
  Season controls, the compact three-rung schedule and worded W-L-T record,
  public next-rival and save status, explicit fresh/new flows, and the degraded
  Retry Saving / Play Quick Game final. Hidden panels leave keyboard order and
  all six required device states remain above the fold.
- Season settlement originates only after `commitPendingResolution()` newly
  finalizes the last Q4 possession, after stats and result-event work and before
  delayed presentation. A touchdown and its overlay store nothing; its later
  conversion settles once. Terminal punts and field goals use the same path,
  while final overlays, routing helpers, legacy seams, boot modes, and repeated
  presentation calls settle nothing.
- Added sanitized semantic season diagnostics containing only mode, game
  number, rung statuses, W-L-T, next public rival ID, completion, and save
  state. Raw storage/errors, season IDs, pending payloads, prompts/answers,
  private opponent plans, and hidden scheduler state remain excluded.
- Added 12 DOM-free season/store checks and 6 primary production-browser checks
  covering every W-L-T ordering, strict/future data, exact byte preservation,
  lock absence/failure, same-tab queues, concurrent starts/slots, one pending
  create/result, reload, retry/conflict, Quick Game byte isolation, scheduled
  rivals, abandoned games, completed/new/fresh UI, privacy, focus, and exact
  touchdown-conversion and terminal-punt settlement timing.
- Added four release artifacts—Season start, saved final, completed, and
  pending—to every configured device project and extended the artifact gate to
  252 PNGs. The prescribed browser client separately rendered the Season start
  and ordinary gameplay states with matching `render_game_to_text()` output and
  no console/page errors; visual inspection caught and closed its 1280x720
  short-landscape CTA clipping before the final gate.
- Synchronized `GAME_VERSION`, all 14 Football cache/icon URLs, the portal
  registry, version manifest, load-order/settlement documentation, tests, and
  artifact manifest at v1.26.0.
- Writer verification passed: `node --test --test-timeout=5000
  tests/football-season-domain.spec.mjs` (12/12), the primary new browser suite
  (6/6), all six new release-state cases (6/6), `npm run test:registry` (4/4),
  and `npm run test:football` (18/18). The final authoritative
  `npm run test:football:release` passed 100/100 DOM-free checks, 277 Playwright
  passes, 455 intentional project-scope skips, and 252/252 verified screenshots
  across all six projects.
- No implementation TODO remains. Independent Opus review and all commit,
  push, PR, merge, deployment, and live-version work remain orchestrator-owned;
  this writer made no GitHub write and claims no model consensus.

---

## Football v1.26.0 issue #30 review-finding closure

This append-only entry supersedes the season-test counts and completion claim
in the preceding issue #30 entry. It records the exact fixes made after the
first independent Opus review; release and cache surfaces remain v1.26.0.

- Tightened season timestamps to exact canonical `Date#toISOString()` strings.
  Parser-permissive values such as `"1"` and normalized impossible dates now
  remain corrupt and byte-for-byte untouched until an explicit Fresh Season.
- Added locked two-tab Fresh Season and New Season races. The first durable
  reset wins, the other tab resumes it, and exactly one replacement write is
  made. Added cross-rung game-ID reuse and stale-season binding conflicts with
  exact durable-byte, write-count, and rung-state assertions.
- Covered degraded `getItem()` behavior and pending results that encounter
  malformed or future storage. Season play stays disabled without a write,
  Quick Game remains usable, and incompatible bytes plus the immutable pending
  result stay intact across storage refresh and Retry Saving.
- Added child-facing incompatible-save explanations, a pending-only compact
  final layout, a guarded single retry action, and keyboard focus-loop coverage
  for Retry Saving and Play Quick Game. The first browser pass exposed the
  longer message pushing the retry control below the iPad landscape viewport;
  concise honest copy and the scoped compact layout closed that issue.
- Replaced the Quick Game presentation-only byte check with a real terminal
  punt through production handlers. Added final-game player PAT/two-point and
  opponent PAT/two-point touchdown-conversion paths with exact final scores,
  no pre-conversion settlement, one result write, and repeated-presentation
  idempotence retained.
- Corrected the manual release-artifact statement from the stale 228-image
  count to the current 252-image gate.
- Final writer evidence: 17/17 season domain checks; 9/9 primary season
  lifecycle checks; 15/15 primary accessibility, copy, and rival checks; and a
  fresh `npm run test:football:release` with 105/105 DOM-free checks, 280
  Playwright passes, 470 intentional project-scope skips, and 252/252 verified
  screenshots across all six projects. The iPad 11 landscape pending-final,
  iPhone 15 portrait pending-final, and iPad 11 landscape completed-season
  artifacts were visually inspected with both recovery controls and all season
  content fully in frame.
- A fresh exact-artifact Opus re-review, plus every commit, push, PR, merge,
  deployment, and live-version action, remains orchestrator-owned. This writer
  performed no GitHub write and claims no consensus.

---

## Football v1.26.0 issue #30 second review-finding closure

This append-only entry supersedes only the browser-test count and final-review
readiness claim in the preceding review-finding closure. Release and cache
surfaces remain v1.26.0.

- Revalidated live session authority after every awaited Season create, Fresh
  Season, or New Season lock callback. If a child starts Quick Game while the
  Season callback is queued, the durable Season write may finish, but the
  queued request can no longer replace the active Quick Game.
- Replaced invented `Game 1` progress for malformed, future, or unreadable
  Season data with the neutral `Season unavailable` heading. Known missing and
  retryable creation states continue to say `Game 1 of 3`.
- Added a production-browser race using the real Web Locks API: it holds the
  Season lock, queues Start Season, starts Quick Game, releases the lock, drives
  a real terminal Quick Game punt, and proves both Quick Game authority and
  exact Season-byte isolation. Pending incompatible finals now also prove that
  Play Quick Game preserves the immutable pending result until the child
  returns to Season recovery.
- The prescribed browser client rendered a clean Season start with semantic
  state matching the visual (`Game 1`, `next/open/open`, UNC next, saved) and no
  console/page error artifact. The canonical iPad 11 landscape and iPhone 15
  portrait Season-start frames were visually inspected with every rung and the
  Start Season control fully in frame.
- Final writer evidence: 17/17 Season domain checks; 4/4 targeted R2 browser
  scenarios; 18/18 primary Season, accessibility, and copy checks; and a fresh
  `npm run test:football:release` with 105/105 DOM-free checks, 281 Playwright
  passes, 475 intentional project-scope skips, and 252/252 verified screenshots
  across all six projects.
- The existing explicit Retry Saving then Play Game flow remains intentionally
  two-step, and the existing real terminal-punt regression already proves
  Game 1 advances to Game 2. Exact-artifact independent re-review, plus every
  commit, push, PR, merge, deployment, and live-version action, remains
  orchestrator-owned. This writer performed no GitHub write and claims no
  consensus.

---

## Football v1.26.0 issue #30 final Fable follow-up

- Added the read-only boolean `hasExactSavedResult()` Season authority. It
  validates the supported durable store against the exact season, slot, rival,
  live game ID, and both final scores without writing, consuming RNG, changing
  pending state, or exposing private persistence facts.
- Final-overlay success copy now requires that exact durable attestation,
  including the completed-season branch. Pending and live-conflict recovery
  remain unchanged; a binding mismatch, invalid/blocked settlement, competing
  result, or retired conflict notice instead says that this game’s result could
  not be confirmed and returns the child to the authoritative saved Season.
- Added DOM-free rejection coverage for different games, scores, rivals,
  seasons, slots, open/missing storage, malformed/future data, and unavailable
  reads with exact byte, zero-write, and zero-RNG assertions. Production browser
  coverage closes a real terminal Q4 punt with a mismatched live game ID and
  proves a competing Game 3 result cannot attest the local final after its
  conflict notice clears; presentation-only helpers still settle nothing.
- Recorded the durable migration boundary: changing rival IDs,
  `FOOTBALL_OPPONENT.RIVAL_ORDER`, or the three-game schedule requires an
  intentional schema/format migration decision and must never silently remap or
  invalidate saved seasons.
- Added the unconfirmed-final release artifact to all six device projects and
  raised the exact gate to 258 PNGs. The regenerated iPad 11 landscape and
  iPhone 15 portrait frames were visually inspected with honest copy, complete
  stats, and the Continue Season action fully in frame. The prescribed browser
  client also rendered ordinary Quick Game play with matching semantic state
  and no console/page error artifact.
- Final writer evidence: 18/18 Season domain checks; 11/11 primary Season
  lifecycle checks; 13/13 directly affected release, accessibility, and copy
  checks; and `npm run test:football:release` with 106/106 DOM-free checks, 282
  Playwright passes, 480 intentional project-scope skips, and 258/258 verified
  screenshots across all six projects.
- Pinned Opus review and the four-seat current-artifact reconciliation remain
  orchestrator-owned. This writer made no GitHub write and claims no consensus.

---

## Football v1.26.0 issue #30 Opus copy-precision follow-up

- Replaced the ambiguous unconfirmed-final sentence with the exact causal copy:
  `This game’s Season result could not be confirmed. This device’s saved Season
  is unchanged by this game.` Pending, conflict, exact-saved, completion,
  action, focus, privacy, and no-write behavior remain unchanged.
- Extended the real competing-Game-3 browser regression through the harder
  replacement case. A second tab now saves the competing final, starts a new
  Season while the local final overlay remains open, and creates the new
  durable Game 1. The local overlay never claims its Game 3 was saved or the
  Season was completed; Continue Season returns to that new Game 1 without
  overwriting it or resurrecting the completed Season.
- Tightened the binding-mismatch, competing-tab, and release assertions to the
  exact causal sentence. Regenerated all six canonical
  `29-season-unconfirmed` artifacts and visually inspected iPad 11 landscape
  and iPhone 15 portrait; the longer copy and Continue Season action remain
  fully in frame.
- The prescribed browser client rendered ordinary Quick Game play with
  matching semantic state and no console/page error artifact. Final writer
  evidence remains 18/18 Season domain checks, 11/11 primary Season lifecycle
  checks, 13/13 directly affected release/accessibility/copy checks, the
  additional iPhone 15 release scenario, and a fresh
  `npm run test:football:release` with 106/106 DOM-free checks, 282 Playwright
  passes, 480 intentional project-scope skips, and 258/258 verified screenshots
  across all six projects.
- Exact-artifact independent review and reconciliation remain
  orchestrator-owned. This writer made no GitHub write and claims no consensus.

---

## Football v1.26.0 issue #30 SOL-FINAL-01 phone recovery closure

- Added a pending-result-only compact final-overlay layout for phone widths.
  The final heading stays on one line, spacing and type scale down without
  removing content, and Retry Saving plus Play Quick Game share the action row
  as two independently focusable touch targets of at least `44x44`. Normal
  finals and every non-phone layout remain unchanged.
- Added production-shaped iPhone 15 and iPhone 17 Pro Max coverage that starts
  a real Season game, drives a terminal fourth-down punt through its correct
  instructional answer, blocks the result write, then installs corrupt and
  future-version durable bytes through storage events. Both states retain the
  exact warning and recovery copy, the immutable pending result, and both
  actions while asserting viewport, overlay-card, internal-content, and touch
  target bounds.
- Added canonical `30-season-pending-corrupt` and
  `31-season-pending-future` screenshots to both phone projects. The artifact
  verifier and manual now describe the heterogeneous 262-image gate: 43 shared
  states across six projects plus two recovery states on two phones.
- Visually inspected all four regenerated recovery frames at `393x852` and
  `440x956`; every line of truthful copy, all stats and Coach Report content,
  and both recovery controls are visible without clipping. The prescribed
  browser client also rendered ordinary production play with matching semantic
  state and no console/page error artifact.
- Final writer evidence: 2/2 focused phone recovery scenarios; 12/12 complete
  phone release-matrix scenarios; and `npm run test:football:release` with
  106/106 DOM-free checks, 284 Playwright passes, 484 intentional project-scope
  skips, and 262/262 verified screenshots across all six projects.
- Exact-artifact independent review and reconciliation remain
  orchestrator-owned. This writer made no GitHub write and claims no consensus.

---

## Football v1.27.0 issue #24 Film Room Coach Replay

- Preserved the persistent guided first retry and required second-miss Continue
  gate. A terminal miss now focuses a concise Film Room summary and offers an
  optional, non-modal Coach Replay inside the existing explanation desk; Learn
  why, Back, and Escape are presentation-only, while Continue remains the sole
  committing control in collapsed and expanded states.
- Raised only the contextual-question contract to schema 2. Every one of the
  27 registered families now builds a required, recursively frozen,
  family-authored `workedReview` with a child-facing goal, two grounded coached
  steps, and the football meaning linked to the canonical bindings and answer.
  Runtime validation rejects mismatched versions, missing authoring, mutable
  review data, and broken family, concept, binding, answer, or step identity
  before an attempt begins.
- Kept the existing worked field model authoritative and the answer buttons
  hidden during explanation. Expanded lessons are assembled off-DOM before
  presentation; an injected render failure atomically hides and disables the
  optional lesson, emits only fixed identifiers, focuses Continue, and retains
  the frozen pending play and concise correction without committing or leaking
  instructional prose.
- Added deterministic focus, keyboard, no-RNG, authority-preservation,
  privacy, duplicate-Continue, failure, and all-family grounding coverage.
  The release matrix now captures ordinary and special-team Coach Replay on
  every target, bringing the complete artifact contract to 274 PNGs. Expanded
  phone lessons use normal page flow with no nested scroll region, horizontal
  overflow, or sub-44-point controls.
- Visually inspected regenerated iPad 11 landscape and iPhone 15 frames with
  the worked field model, concise summary, complete two-step review, and Back
  plus Continue reachable. The prescribed browser client also rendered a real
  production question with schema-2 review identity in semantic state and no
  console or page-error artifact.
- Focused writer evidence: 32/32 contextual-question checks; 71/71 primary
  context, learning, and accessibility checks; 2/2 copy/version checks; 6/6
  complete deterministic state-sequence checks across the configured device
  projects; and 4/4 registry checks. The standalone artifact verifier remains
  intentionally incomplete after these focused runs because the unchanged
  non-target screenshots were not regenerated; the full writeful Football
  release gate, exact-artifact reviews, commit, push, PR, merge, deployment,
  and live-version verification remain orchestrator-owned. This writer made no
  GitHub write and claims no consensus.
- Round-one non-blocking review observations were dispositioned without
  speculative churn. N1 is retained intentionally: step 1 supplies the guided
  method, while step 2 repeats the canonical concise equation or conclusion as
  the stable check; the family-authored goal and football meaning provide the
  additional lesson context without creating a second numeric authority. N2
  does not broaden the shared diagnostic helper: this feature passes only its
  fixed code and three stable IDs, and its exact event test rejects prose or
  extra data; changing every diagnostic caller is outside issue #24. N3 leaves
  the registry test's `1.26.0` values unchanged because they are a deliberately
  synthetic exact-base fixture proving target-only drift, not a current-release
  version source. These dispositions do not claim a final exact-artifact
  review of the resulting tree.
- N4 is recorded as informational with no runtime change. The terminal
  correction continues through the established polite `#feedback` status,
  while focus on the labelled Film Room summary supplies the new navigation
  target and its local description. Whether an assistive technology voices
  both is timing- and implementation-dependent; the DOM and focused tests show
  no deterministic duplicate event, regression, or disclosure. Removing
  either path without a reproduced screen-reader defect could instead drop the
  established status announcement or the required focused-summary context.

---

## Football issue #24 required Coach Replay and assisted retry gain

- Follow-up prompt: make Learn why / Coach Replay required before Continue
  after a second miss, and make a successful offensive retry credit half of the
  positive scrimmage gain instead of the full result.
- After a second miss, the concise Film Room summary still appears first, but
  Continue is hidden, disabled, and blocked in `continueAfterExplanation()`
  until Coach Replay opens. Opening Coach Replay marks the review satisfied and
  reveals Continue; review-render failure deliberately fails open to the
  existing concise frozen Continue path with a fixed diagnostic.
- Retry-correct assist is scoped to player-offense scrimmage plays with a
  positive applied gain. Credited gain is `Math.max(1, Math.floor(raw / 2))`
  and the play transition is reprojected from that credited gain, so first down,
  touchdown, down-distance, field position, and stats settle from the reduced
  result. Defense, opponent/special-team plays, first-try success, failed
  answers, zero gains, and losses keep their existing policies.
- Added render-state and result-event assist metadata for diagnostics/tests
  without changing question schemas or learning-event payloads. Preserved the
  existing guided first-try behavior: guidance alone does not halve a successful
  first try.
- Verification evidence from this pass: `node --check football/football.js`;
  `git diff --check`; `npm run test:registry` 4/4; focused football
  verification with learning, context integration, audio, and call-layout on
  iPad 11 landscape 74/74; the configured `npm run test:football` call-layout
  suite 18/18 across the device projects; targeted accessibility rerun 9/9;
  `npm run test:football:release` DOM-free checks 107/107; the first full
  release Playwright pass had one iPad Pro 13 landscape release-matrix timeout
  after 286 passes and 499 expected skips, and that timed-out scenario then
  passed by itself in 19.8s; the lower-concurrency release Playwright matrix
  completed cleanly with 287 passes and 499 expected skips. Exact-artifact
  independent review, commit, push, PR, merge, deployment, and live-version
  verification remain orchestrator-owned.

---

## Football v1.27.1 issue #93 evidence classification correction

- Raised the contextual-question contract to schema 3 and assigned every one
  of the 27 families an immutable `literacy` or `independent` evidence class.
  The exact 13/14 family map is pinned. Source-visible answers are literacy,
  while all independent initial and guided visuals retain
  `revealsAnswer: false` and `result: null`. The guided `half-read` copy now
  teaches the four-quarters/two-equal-groups method without naming either half.
- Raised learning profiles, sessions, and events to schema 3. Current and
  historical concept/skill mastery plus recency are partitioned by evidence
  class, and adaptive weighting, support, mastery suppression, and freshness
  consult only the candidate's matching class. Legacy flat evidence migrates
  to inert `unclassified` history. Event class and resolution values are
  validated before current-game learning state changes.
- Kept the `footballMathStats:v1` key and raised only its inner schema to 4.
  Schema 1 through 3 rows, mastery, and recency migrate in memory to
  `unclassified` without a read write; the next canonical completion writes
  schema 4. Typed-play strictness remains anchored at schema 3, current rows
  accept only authored literacy/independent classes, and missing or unknown
  schema-4 classes cannot grant mastery or recency credit.
- Updated Coach Report to prefer independent first-try strength, then
  independent need, literacy reading success, and literacy need, with at most
  two distinct concepts. Retry evidence participates only in need ranking;
  unclassified and retry-only evidence can never produce **Strong today**.
- Added deterministic contracts for the exact family map, independent answer
  hiding, half guidance, zero/repeated place-value digits, runtime
  contradictions, class-isolated scheduling/support/freshness, legacy
  migration, malformed current rows, two-tab opposite-class writes,
  same-play race deduplication, season-byte isolation, and mixed Coach Report
  ordering. Synchronized the runtime, all 14 Football asset URLs, registry, and
  version manifest to v1.27.1.
- Writer verification passed 112/112 DOM-free release contracts; 82/82 serial
  primary-iPad context, learning, stats, Coach Report, and copy contracts;
  11/11 serial primary-iPad Season contracts; 18/18 call-layout checks across
  all six configured device projects; syntax checks for all four changed
  runtime files; and `git diff --check`. A broad parallel rerun exposed the
  literacy-only Coach fallback wrapping below the 820-point final viewport;
  shortening that fallback restored the exact Season scenario and the compact
  740-point overlay remained visually complete. A later high-concurrency pass
  was discarded after the local Chromium/display stack stalled and reported
  offline resource errors; the affected changed suites then passed serially.
- The prescribed browser client loaded every v1.27.1 asset, produced semantic
  state with no console/page-error artifact, and its ordinary production frame
  was visually inspected. The freshly attached 1180x740 final-overlay frame was
  also inspected with both report rows and the full CTA visible. The writeful
  six-device release-artifact matrix, exact-artifact review, commit, push, PR,
  merge, deployment, and live-version verification remain orchestrator-owned.
  This writer made no GitHub write and claims no review or consensus.

---

Original prompt: Decide what Football issue to do next with a current four-model round robin, compare that consensus with an independent Fable 5 plan, then have GPT-5.6 Sol Ultra implement while Opus 4.8 and the named review roster iterate to consensus without wasting Fable quota.

## Football issues #92 and #96 field-clarity work log

- Implemented the agreed combined scope for issues #92 and #96 from the exact
  clean `origin/main` base on the dedicated Football field-clarity branch,
  without changing the football domain, learning, stats, opponent, or Season
  authorities.
- Added one strict, recursively frozen field-position copy authority. Canonical
  integer coordinates remain internal while scorebug, prompt, accessible,
  semantic-render, punt, conversion, and missed/blocked field-goal surfaces use
  team field language for UNC, NC State, and Wake Forest.
- Retired only `goal-distance-read` from the live family registry, call
  affinities, and Coach Replay specs while preserving historical learning rows
  and every other distance/literacy family. Source-visible reads now begin under
  an honest **Field Reading** desk header.
- Added a bounded field-position choice-presentation hook for punt landing and
  conversion placement. Numeric answer/choice values, binding paths, operand
  IDs, correct-choice logic, and stable IDs remain unchanged; visible and ARIA
  labels are formatter-derived and uniquely asserted.
- Made punt questions visibly and accessibly previews. One frozen presentation
  built from the real proposal, independently validated committed transition,
  resolution policy, public match, and field formatter now supplies both the
  immediate result and the next-possession dialog. It compares only visible
  travel, placement, touchback/result, and restart facts, distinguishes a
  matching preview, and never calls an offensive second miss a correct-answer
  benefit.
- Corrected score-difference visuals and ARIA to show the larger committed score
  minus the smaller committed score, retaining hidden initial/guided results and
  independent evidence classification.
- Added DOM-free contracts for strict coordinate/match validation, every public
  rival, exact 26-family/evidence maps, build-every-family coverage, source-copy
  non-restatement, formatted numeric-choice preservation, and answer hiding.
  Added primary-iPad integration coverage for the exact UNC punt from absolute
  80, unchanged normal punts, second-miss causality, touchbacks, special-outcome
  non-leakage, persistent result copy, field-goal placement, and score-gap math.
- Writer verification on the final runtime included 36/36 DOM-free contextual
  contracts, the serial primary-iPad context/learning/copy/accessibility suite,
  focused post-copy punt and no-leak reruns, `npm run test:registry` (4/4), syntax
  checks for every changed JavaScript runtime, and `git diff --check`. The
  writeful full release matrix remains orchestrator-owned.
- The installed web-game client reached a real post-start question, captured
  `render_game_to_text()`, and produced no console/page-error artifact. Fresh
  1180x820 visual captures of Field Reading, punt preview/result/dialog, and
  committed score difference were inspected; compacting the tight punt header
  resolved the only presentation issue found.
- Opus 4.8's first exact-artifact review found no material defect and identified
  three low cleanup items. The `yards-to-go-read` prompt now leaves its number
  in the accessible down-and-distance graphic while guided/worked teaching stays
  intact, committed punt copy uses one owner-aware territory name throughout,
  and the retired goal-distance renderer branch has been removed.
- Opus 4.8's second exact-artifact review approved those fixes and identified
  two low header/documentation cleanups. Generic Field Reading now says **Read
  the game graphic.** so field and scoreboard sources are both described
  truthfully, while the special-teams-specific header remains unchanged; the
  verified DOM-free count at that review reflected 35/35.
- Four-seat code-review reconciliation required two material presentation
  fixes. Touchback travel now shows the named goal/end zone, possible touchback,
  and receiving own-20 restart as three distinct facts without changing the
  numeric answer or bindings. The already-frozen committed special-result
  semantic now survives transition, quarter, halftime, and final overlay
  blanking while active instructional state still clears, then is cleared at
  the existing next-drive, conversion, and new-game boundaries. Production
  rival boundary facts, generic Field Reading routing, defense-second-miss punt
  copy, overlay text-state persistence, and all three score-gap orderings have
  focused contracts. Final reconciliation verification passed 36/36 DOM-free
  contextual contracts and 66/66 affected primary-iPad browser contracts.
  Fresh iPad 11 landscape and iPhone 15 portrait touchback captures were
  visually inspected with the full named-end-zone, possible-touchback, restart,
  and travel presentation visible, no page overflow, and no console/page error.
- A post-approval independent audit found a test-only lifecycle coverage gap.
  Added production-path regressions proving the frozen committed special result
  and matching outcome message survive an offense-owned defense transition,
  halftime, and the final overlay, then clear through the real Continue,
  next-quarter/start-drive, restart, and next-game paths. The final-Season case
  also proves settlement starts synchronously from the production commit while
  presentation remains in feedback, before the delayed final presentation,
  then becomes durable in the Season store. No runtime defect or runtime edit
  was needed.
- The four-model v2 reconciliation required three narrow corrections. The final
  dialog now presents the exact frozen special-result message in its own
  visibly and accessibly described element before the existing generic game
  detail, while final games with no special result keep the prior behavior.
  Quarter reading now asks exactly which quarter the scoreboard shows without
  repeating its source numeral, and changed second-miss punts that happen to
  retain the same receiving spot use neutral causality instead of claiming a
  more favorable result. Exact contracts cover Q3 source separation, the
  normal-touchback-to-ordinary-punt same-yard case, the final production path,
  and no-special cleanup.
- The first production-browser final-dialog pass exposed the new long result
  pushing the iPad action below the fold. A final-special-only compact layout
  fixed that regression without changing ordinary final dialogs. Fresh iPad 11
  landscape and iPhone 15 portrait captures show the full exact result,
  generic detail, stats, Coach Report, and action button with no internal card
  overflow or browser errors. Final verification passed 37/37 DOM-free
  contextual contracts, 3/3 focused primary-iPad production scenarios, 18/18
  configured-device call-layout checks, the 4/4 registry gate, syntax checks,
  and `git diff --check`. The writeful release matrix remains orchestrator-owned.
- A follow-up geometry audit caught the compact iPhone final action at
  `39.234375` points, below Football's 44-point minimum. The phone-only
  final-special rule now restores `min-height: 44px`. A fresh 393x852
  production capture measures the action at exactly 44 points, keeps the card
  fully inside the viewport with `clientHeight == scrollHeight` (529/529),
  preserves the exact result-first accessible description, and reports no
  browser errors. The focused final production scenario also passes unchanged.
- The four-model v3 reconciliation reproduced one instructional-copy defect:
  receiver-favorable punts can travel beyond the receiving own-20 cap, while
  the old sentence attached the canonical travel distance to the separate
  capped restart spot. Non-touchback capped results now state the formatter-
  derived raw travel destination and restart as two explicit facts. Touchback
  and ordinary uncapped result copy remain byte-for-byte unchanged. Real
  production assertions cover offense `+1` raw 90 / restart 80, defense `-1`
  raw 15 / restart 20, and an uncapped ordinary control with exact `actual` and
  complete frozen messages.
- The longer final message required no further layout change. Fresh 1180x820
  and 393x852 last-Q4 captures were visually inspected; visible, semantic, and
  result-first accessible messages agree exactly, card client and scroll
  dimensions match on both axes, both 44-point actions remain inside the
  viewport, horizontal document overflow is zero, and browser errors are
  empty. Final writer checks passed 4/4 affected production/lifecycle cases,
  37/37 contextual contracts, 18/18 configured-device layout checks, the 4/4
  registry gate, syntax checks, and `git diff --check`. The writeful release
  matrix and independent exact-artifact review remain orchestrator-owned.

## Football v1.28.0 superseding field-position and reading release

- Football v1.28.0 supersedes v1.27.1 for child-facing field-position clarity,
  honest source-visible reading framing, committed punt-result explanation, and
  high-minus-low score-gap presentation.
- `GAME_VERSION`, all 14 Football asset query strings, the portal registry, and
  `version.json` are synchronized to `1.28.0`. The
  `footballMathStats:v1` and `footballMathSeason:v1` storage keys are unchanged.
- The first full matrix attempt passed 116/116 Node tests but exposed two stale
  release-matrix copy expectations across all six projects. The matrix now
  expects team-relative `UNC 2` and verifies the frozen punt semantic against
  the exact visible feedback. That alignment let the preserved viewport gate
  expose long feedback stretching the answer grid; one feedback-only
  `grid-auto-rows: max-content` rule fixed it without changing question phase
  or 44px target minimums. The isolated special-teams matrix now passes 6/6 and
  the normal layout suite passes 18/18; representative answer bottoms are
  712.594/820 on iPad 11 landscape and 840.828/852 on iPhone 15. The full
  matrix rerun remains orchestrator-owned.
- Review found that `render_game_to_text` converted every semantic choice to a
  display label while leaving ordinary numeric `correct` values numeric. It now
  preserves the canonical `state.choices` value types for ordinary questions
  and uses owner-aware labels only for field-position presentations. A focused
  production-path regression locks both sides of that contract. This writer's
  fresh checks passed the focused regression 1/1, the complete affected iPad 11
  landscape accessibility file 7/7, the contextual-plus-registry Node baseline
  41/41, syntax checks for the changed runtime and browser test, and
  `git diff --check`.
- Exact-artifact independent review, commit, push, PR, full release artifact
  generation, merge, deployment, and live-version verification remain with the
  orchestrator. This writer made no GitHub write and claims no review consensus.
