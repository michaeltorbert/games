# Fable 5.1 Low — preserved independent ideation

This is the original substantive model response, preserved by Codex. It contains proposals and unresolved inconsistencies; see `design-notes.md` for the reconciled recommendation and caveats. It is not an implementation specification or a claim of consensus.

EVIDENCE INSPECTED

I had no tool access in this pass. The evidence is the supplied summary only. Relevant facts from it: single-digit addition and inverse subtraction catalog, five- or ten-question sessions, keypad with Check, Next, and optional Show me, automatic support after two misses, shown answers must still be entered, and a save model that distinguishes first-attempt unassisted, corrected-after-miss, and shown or helped, plus separate delayed-retry evidence. Saves are browser-local. There is no evidence about how this learner reacts to visible losses.

PLAN

Design principles I applied to every idea:

- The reward layer reads the existing attempt classification. It never redefines it, so the mastery distinctions survive.
- Each item can award progress at most once per session. Repeating a session or reloading cannot re-earn the same item.
- Support stays free to use. Hints may reduce the reward for that item, but never below zero and never retroactively.
- A delayed correct retry of a previously missed item earns the full unassisted reward when it is a first attempt in that later session.

Idea 1: Progress meter, the user's first suggestion, with a floor. The child sees a vertical bar that fills toward a star. Scoring per item: unassisted correct +2, corrected after one miss +1, shown +0, each extra miss after the first 0. The meter never drops below the last checkpoint, but the user's decreasing variant is implemented as a tunable option: wrong answer -1, hint -1, floor at the last quarter mark. Short-session payoff: the bar visibly moves every question. Cross-session payoff: the bar persists and full bars accumulate into a star count. Complexity: low, one persisted integer plus a checkpoint. Downside: an abstract bar has no story, and the decreasing variant with a floor may feel like a rule the child does not understand.

Idea 2: Football drive to a touchdown, the user's second suggestion, scaled to 100 yards rather than 100 questions. The child sees a field strip with a ball marker. Unassisted correct +5 yards, corrected +2 yards, shown +0 yards, a miss on the first attempt is a loss of 2 yards but never back past the last first-down line, which is set every 10 yards gained. Hint usage counts the item as corrected rather than unassisted. Touchdown at 100 yards, roughly 20 to 40 items, so two to four sessions, then reset to the 20-yard line with a touchdown tally. Short-session payoff: a first down almost every session. Cross-session payoff: touchdowns accumulate on a scoreboard. Complexity: medium, one yard counter, one first-down checkpoint, a small field graphic. Downside: the 100-question touchdown as literally proposed spans 10 to 20 sessions and the goal recedes for a learner who does five items a day. The yard-based scaling fixes that, but visible yard losses may frustrate this learner, which is unknown.

Idea 3: Cumulative collection, no losses. The child sees a bookshelf, garden, or team roster. Each unassisted correct earns one token, corrected earns half, shown earns nothing. Ten tokens unlock one collectible. Short-session payoff: tokens drop after each question. Cross-session payoff: the collection persists and is visible on the home screen. Complexity: low. Downside: no tension, and a learner who relies on Show me sees slow growth without a clear reason. Grinding risk is limited because each item awards once per session and the catalog is small.

Idea 4: Session goal card. Before the session, the child picks or is shown a small target such as "get 4 unassisted out of 5." Scoring is binary per item on the existing classification. Hitting the goal stamps a card. Five stamps make a badge. Short-session payoff: the whole session is one clear goal. Cross-session payoff: stamps and badges persist. Complexity: very low. Downside: a missed goal at question two can deflate the rest of the session unless the goal is framed as "at least."

Idea 5: Streak with a shield. The child sees a streak count and one shield icon. Unassisted correct +1 streak. A miss consumes the shield instead of resetting the streak, and the shield regenerates after three unassisted corrects. A second miss with no shield resets the streak to zero but the best streak is kept. Hints count as a miss for streak purposes. Short-session payoff: instant feedback. Cross-session payoff: a personal best streak on the home screen. Complexity: low. Downside: highest reset risk of all the ideas, and the shield rule needs a sentence of explanation.

Idea 6: Fact map. The child sees the actual grid of facts, addition and subtraction, lit as the learner earns them. An unassisted correct lights the cell at half brightness. A delayed unassisted correct in a later session lights it fully. Corrected or shown leaves the cell dim but marked as visited. Nothing ever dims. Short-session payoff: a few new lights per session. Cross-session payoff: the whole map filling in over weeks, which directly mirrors the existing delayed-evidence model. Complexity: medium for the grid layout on a phone. Downside: the grid exposes gaps, and for a learner who finds 7 minus 5 hard the map is mostly dark at first.

Preferred first prototype: Idea 2 with the yard-based scaling, but with the loss rule disabled at launch, so a miss is +0 yards and hints simply reduce the item to corrected. This gives the concrete goal the user asked for, matches the football theme already in the family of games, and pays off within two to four sessions. The loss rule ships behind a parent-facing toggle rather than being removed, because the evidence does not say losses hurt this learner. Second choice is Idea 6, because it is the most honest reflection of the existing evidence model.

Observation that changes the recommendation: if the parent observes the child hesitating to press Show me or guessing rapidly to avoid a loss, keep losses off permanently. If the child asks where the ball is or tries to reach the next first down, turn losses on and watch whether engagement rises. If the child ignores the field entirely, switch to Idea 4, which needs the least explanation.

RISKS

- Rewarding unassisted answers more than shown answers may discourage using Show me, which the existing design treats as legitimate support.
- Any loss rule can turn a hard fact like 7 minus 5 into a visible punishment across sessions.
- Restart exploit: quitting mid-session to avoid a loss. Mitigation: apply the loss only after Check, and persist yardage after every item, not at session end.
- Double-award: a shown answer entered on the keypad must not count as unassisted. The reward layer must read the classification, not the keypad event.
- Browser-local saves mean a cleared cache resets the touchdown count, which the child may experience as loss.

ALTERNATIVES

- Ship Idea 3 first as the zero-risk baseline and add the field later.
- Ship Idea 4 alone if the parent wants the smallest possible change.
- Combine Idea 2 and Idea 6: the field for short-term goal, the map for long-term truth.
- Do nothing to the game and let the parent run a paper sticker chart from the existing session summary.

UNKNOWNS

- Whether this learner responds to visible losses or to cumulative-only progress.
- Whether five-item sessions are the typical length, which sets the right yards-per-item.
- Whether the existing session summary already exposes counts the reward layer could reuse.
- Whether the separate Football game has a field graphic that could be reused.
- Screen size on the target phone for a field strip or fact grid.

FABLE_DELIVERABLE_COMPLETE

