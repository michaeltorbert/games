Original prompt: Sydney doesn't like the bonus levels. Can you change it so that it just keeps doing the 12 over and over? after 12 it starts back at 1

- Updated progression to loop level 12 back to level 1 and removed bonus-level branching.
- Verification in progress: launching local server and browser automation to confirm wrapped progression in the running game.
- Found and fixed a load-order bug during verification: `kayak.js` was using `LEVELS.length` before `levels.js` loaded, so level normalization now happens inside `initLevel()`.
- Verified in Chromium against `http://127.0.0.1:8000/kayak/` by forcing saved level 12, opening the completion overlay, and clicking Next.
- Verified result:
- Before completion: `Level 12 · Rio Douro`
- Completion overlay button: `Next: Parque Jaime Duque →`
- After clicking Next: `Level 1 · Parque Jaime Duque`
