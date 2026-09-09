# Basic arithmetic goals: complete design handoff

## Status and scope

This is an idea archive and future design issue, not an approved implementation specification. The user requested preservation of the ideas and all six mockups before closing the conversation. No concept, scoring system, penalty rule, or implementation has been selected by the user. Do not infer permission to build every option or to introduce harder mathematics.

The current need is unassisted recall of basic single-digit addition and matching subtraction, including 7−5. The discussion followed a return to arithmetic in Grade 1-B Chapter 8 after measurements/shapes; that context is not a claim of completed curriculum or mastery. The user specifically objected to two-digit + two-digit questions being presented as current practice. Place by Place 1.4.1 (PR #121, merge 131b16b1dd79daf577d93819b0abbe4066b631fb) made Basic + and − the Arithmetic default and moved broad arithmetic behind For later: larger numbers. Preserve this boundary. Related work: #107, #113, #120, #121.

The game currently uses five- or ten-question sessions, a keypad, Check, Next, optional Show me, automatic support after two misses, and entry of the shown answer to finish an item. It distinguishes first-try/unassisted, corrected-after-miss, and shown/helped outcomes; delayed exact-prompt evidence is separate. Basic arithmetic, broad arithmetic, and Place Value have isolated browser-local progress. This proposal is a reward wrapper around basic practice, not a rebuild of the separate Football simulation.

## User's starting ideas

- Make practice feel like a goal, not just a succession of questions.
- A meter could increase with every unassisted correct answer and possibly decrease with wrong answers or hint use.
- A player could advance down a football field toward a touchdown after a hundred questions.
- Other ideas were explicitly invited, with an independent Claude Fable 5.1 Low idea-generation pass.

## Codex's three original directions

1. **Touchdown drive:** a player advances along a 100-yard field, with yard-marker milestones, a short touchdown celebration, and a saved scoreboard. The drive resumes between five- or ten-question sessions.
2. **Build something:** earn parts for a stadium, rocket, or robot. Sessions add a visible piece such as stands, lights, or a scoreboard; finished creations remain in a collection. This gives a lasting payoff rather than simply resetting a bar. The mockup chooses a stadium as one example, not a mandatory theme.
3. **Rocket fuel and exploration:** answers fill a fuel tank, full tanks launch a rocket, and successive launches visit planets. Launch is the short-term goal; exploration is the longer-term goal.

## Fable's six independently generated directions

The full, unedited substantive answer is archived separately in `fable-ideas.md`. These are Fable proposals, not validated requirements:

1. **Meter with checkpoints:** +2 unassisted, +1 corrected, +0 shown. Optional decreasing variant: −1 wrong or hint, floored at the last quarter mark. Completed bars accumulate stars. Low complexity; abstract and potentially confusing checkpoint rules.
2. **Football drive:** +5 yards unassisted, +2 corrected, +0 shown, optional −2 on first miss with a first-down floor every 10 yards. Fable ultimately preferred launching with losses disabled and contemplated a parent-facing penalty toggle. It proposed a touchdown tally and later restarting at the 20-yard line. Medium complexity; score and reset details need reconciliation before building.
3. **Cumulative collection:** bookshelf, garden, or team roster; one token unassisted, half a token corrected, zero shown; ten tokens unlock a collectible. Low complexity; learners relying on help could see little movement.
4. **Session goal card:** e.g. four unassisted answers out of five earns a stamp; five stamps earn a badge. Very low complexity, but an early miss can make the target unattainable.
5. **Streak with a shield:** unassisted success adds one; a mistake consumes a shield, a subsequent unprotected mistake resets the streak, and three unassisted successes recharge the shield. Best streak persists. Fable counted hints as misses in this variant. Low complexity but the greatest reset/pressure risk.
6. **Fact map:** visited facts remain dim, first-try success lights them partially, and delayed independent success changes their appearance again. No dimming of earned lights. Medium complexity, potentially crowded on phones, and an initially mostly-dark map may emphasize gaps.

Fable's first choice was the football drive with losses initially off; its second was the fact map. It also suggested collection-first, minimal mission cards, field plus map, or a parent-run paper sticker chart. These alternatives are preserved rather than silently discarded.

## The six visual concepts actually shown

1. `01-touchdown.png`: Touchdown drive. Player at 40/100 yards; next milestone 50; proposed +5 first try / +1 after help.
2. `02-build.png`: Build a stadium. Six of ten pieces; scoreboard next; completed-stadium collection; illustrative two pieces first try / one after help.
3. `03-rocket.png`: Rocket launch. Fuel six of ten; Moon next, Mars later; illustrative +2 first try / +1 after help.
4. `04-constellation.png`: Fact constellation. A friendlier illustrated version of Fable's fact grid, with Visited, First-try success, and Spaced success states. This is practice progress, not a mastery declaration.
5. `05-mission.png`: Mission cards. Four first-try stars earn a mission reward; two currently earned; progress carries over. Carryover is a Codex refinement to avoid an early mistake making the mission impossible, and differs from Fable's literal four-out-of-five session proposal.
6. `06-streak.png`: Streak with a shield. Three in a row, best seven, shield ready; a stepping-stone path makes the streak visible.

All are built-in image-generation concept mockups, not screenshots of implemented behavior. They use the same 7−5 exercise to compare the reward layer. Exact prompts are in `prompts.md`. Art, counters, slogans, decorative characters, button positions, and score thresholds are illustrative; they are not approved copy or a functional specification. Generated art should be checked before reuse: the stadium image uses a soccer-style pitch despite the earlier football wording. Preserve the concept, not incidental generated details. Artwork does not establish accessible contrast, touch sizing, responsiveness, or a tested layout.

## Codex's recommended first prototype (proposal only)

Use a saved football drive, frequent smaller milestones, a touchdown celebration, and the existing short sessions. Do not add a timer or increase arithmetic difficulty.

| Completed-question outcome | Proposed yardage |
| --- | ---: |
| Correct first try without help | +5 |
| Eventually correct after a miss or a hint | +1 |
| Wrong answer or opening help, before completion | No immediate gain or loss |

Award once when a question is completed, not on every tap. Starting at zero, twenty unassisted correct completions reach 100 yards. With the +1 support rule, one hundred entirely supported completions would reach it too. Mixed outcomes fall between those cases. This distinguishes a 100-yard field from a requirement to do 100 questions before any big payoff. A 100-unassisted-answer season trophy could be a longer-term goal, with touchdowns along the way. These are game-design starting numbers, not research-backed educational thresholds or mastery criteria.

Independent answers receive the largest gain, but working through a correction is not a dead end. Earned progress persists between sessions. Keep scoring separate from the underlying learning report, timing validity, spaced evidence, and scheduler. A game reward for an unassisted answer must not fabricate independent spaced evidence or a recall/mastery claim.

Codex advised starting with no loss of earned yards: differential rewards already favor independent work. Charging for hints might discourage useful support or promote guessing, but there is no evidence yet about this learner's response. If setbacks are later considered, bounded checkpoint losses are an option, not an approved requirement. Codex's least-favorite first prototype is streak-reset scoring because one hard question can erase visible achievement.

After seeing the mockups, Codex's visual favorites were touchdown drive, stadium builder, and rocket launch. The rocket has the clearest immediate fill-and-launch goal; stadium building and the constellation make accumulated progress particularly visible. The user has not selected a favorite.

## Important reconciliation and caveats

- Agreement on a promising football prototype was independent ideation, not formal committee consensus or educational validation.
- Fable's football scoring is internally ambiguous about hints: it says shown answers earn zero while also saying hints become corrected. Codex's proposed +1 for any completed supported answer is an explicit simplification, not a claim that both models specified identical scoring.
- Fable's estimate of 20–40 items is not guaranteed by its own +5/+2/+0 scheme: even +2-only progress requires 50 items from zero, and zero-reward shown answers can extend it indefinitely. Use actual chosen scoring to describe pacing. Starting later drives at the 20-yard line also changes their length and should not be silently adopted.
- Fable's claim that framing four-out-of-five as “at least” solves an early impossible goal is insufficient. Carryover/cumulative mission progress, as shown in the mockup, avoids that failure mode.
- Interest in the field or next milestone does not by itself justify switching on penalties. Watch whether any trial improves engagement without hint avoidance, rapid guessing, or distress; keep penalties off if those appear. If the field is ignored, try the simpler mission or collection route.
- Do not treat “one award per item per session” or “only later sessions count” as established implementation rules. Use exact presentation/completion identity to prevent reload/double-tap replay awards, while allowing legitimate scheduled later retries. Existing learning spacing, not a session boundary alone, decides whether evidence is independent.
- Fable called the collection a “zero-risk” alternative; treat that as informal wording, not a factual guarantee. Every design needs observation.
- A large dark fact map could emphasize deficits. A small constellation/scene that grows is an option. Never expose answers to unrelated upcoming facts or turn a pretty map into a false mastery indicator.

## Suggested implementation checks after a design is selected

- Define exact scoring for first correct, corrected, voluntary help, automatic help, and displayed-answer entry; show/hide/report/reload actions must not accidentally earn points.
- Commit reward and completion exactly once, with safe browser-local persistence and appropriate stale-tab/lock handling. Repeated Check/Next, reload, restart, and abandonment must not duplicate rewards or undo recorded penalties if penalties are ever adopted.
- Do not break legitimate spaced retries to prevent farming. Preserve the existing basic catalog, scheduler, support behavior, and all other lanes' saved bytes.
- Define touchdown overflow, post-touchdown position, checkpoint rules, collection thresholds, reset behavior, and what happens when storage is unavailable or cleared. Do not promise durability beyond the current browser-local store.
- Keep five/ten-question sessions and permit stopping without losing the drive. Define celebration pacing so it does not interrupt every answer or demand long sessions.
- Verify touch targets and exercise visibility on phone and tablet, keyboard/screen-reader access, text equivalents for progress, and reduced-motion behavior. These checks were not performed on the raster mockups.
- Observe willingness to return, understanding of the next goal, appropriate use of Show me, frustration, and guessing. Do not equate points or streaks with learning improvement; use the existing learning evidence separately.

## Decisions still needed

Choose one first prototype; choose initial reward values and milestone spacing; decide whether penalties should exist at all; decide how later independent retries contribute to rewards; choose cross-session collection/trophy goals; and confirm visual direction. The user requested this archive, not implementation.

## Provenance

Codex generated its ideas independently and then synthesized the result. Claude was a prompt-only planning consultation using Claude Code CLI 2.1.263, requested and runtime-confirmed `claude-fable-5-1` at low effort on 2026-09-09. Session `95ff8394-be88-4f76-96d9-776770c0c684`; successful `end_turn`; 2,605 Fable output tokens versus 15 ancillary `claude-haiku-4-5-20251001` output tokens, satisfying strict primary-model dominance. No subscription usage meter was exposed. The preserved response is ideation, not a repository inspection, independent code review, or implementation approval. Full telemetry with API-equivalent cost fields is intentionally not published. No additional Claude call was needed to archive the already completed consultation.
