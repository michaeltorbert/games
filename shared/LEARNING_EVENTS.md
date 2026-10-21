# Learning-event outbox (#199)

`shared/learning-outbox.js` defines the plain global `LEARNING_OUTBOX`. It keeps
a browser-local, privacy-safe outbox of learning events for Football and Place by
Place Number facts. It sends nothing over the network. Enrollment, upload,
acknowledgment and the parent report belong to #200. This file is the contract
#200 consumes.

Recording is **off by default**. `shared/learning-outbox.js` itself has no enrollment
writer, installer or network code; #200 adds them separately in
`shared/learning-sync.js` (see "#200 enrollment and sync" below), and they stay inert
while `shared/learning-reporting/config.js` has no service origin, as shipped. Until a
valid enrollment hint exists,
each observer call does one `localStorage.getItem` of the hint key and nothing
else. One accepted action can make several observer calls, for example an
attempt and the help it causes. There is no UUID, no IndexedDB open (so no
database is created), no lock, no write, no new key and no request.

## Domain write versus outbox write (documented before coding)

No transaction across the game's domain storage and the outbox is claimed for
either game. The outbox append is always a separate, later, asynchronous
IndexedDB transaction, and a failure never blocks, delays or changes play.

The storage protocol changed after the WebKit evidence. Under the original Web
Lock plus `localStorage` protocol, two Playwright WebKit pages lost accepted
batches: a stale lock-time read, and a later write lost to an earlier one
(`output/issue-199/repeat-webkit-1`, 14 of 30). The Chromium control passed 30
of 30. Those runs are stress evidence, not a Safari or production-frequency
claim.

Both planners then agreed on IndexedDB as the only authority, in line with the
normative transaction ordering in the IndexedDB specification.

| | Football | Number facts |
|---|---|---|
| Where an attempt becomes domain-accepted | `handleAnswer` (`football/football.js`) after its guards (phase `question`, enabled visible button, known choice) and after `FOOTBALL_LEARNING.recordAttempt` plus `FOOTBALL_STATS.recordAttempt` return. | `change()` (`place-value-practice/fact-practice.js`) inside the existing `place-value-practice:facts:v1` lock callback, after `refresh()` passes and the action (`api.answer`, `api.show`, `api.restart`, `api.next`, `api.reportOpened`) returns true. |
| What is persisted at that point | Nothing. Attempts, help and resolution live in memory (`learningSession`, `pendingStatsPlay`). The only durable domain write is the finalized stats row, written later by `FOOTBALL_STATS` under `footballMathStats:v1:central-write`. No in-progress question is ever persisted. | The whole domain model, including the in-progress `attempt`, in one synchronous `setItem` immediately after the action. In memory mode (future-schema save, failed save, or no Web Locks) nothing is persisted. |
| Order relative to the outbox append | The observer copies primitives synchronously after the in-memory records and queues them. The outbox write runs later in a microtask-started IndexedDB transaction. The stats row (its own Web Lock and `localStorage`) and the outbox transaction are independent, so either can land first. | The observer copies primitives before the action and reads the result after the domain `setItem` (or memory fallback) inside `run()`. It queues without awaiting, so `busy`, render, focus and the domain write order are unchanged. The outbox transaction always starts after the domain write. |
| Help | Successful `prepareQuestion` with initial `support === 'guided'` (`help`, number 1, guided). First miss in `handleInstructionalMiss`, after the retry hint is shown (number 2, guided). Second miss, after the worked explanation is shown (number 2, worked). A faulted presentation emits nothing. | `api.show` (Help me) and the automatic help inside the second wrong `api.answer`. The order is `attempt`, then `help`. There is no terminal second miss: the question continues until the shown answer is entered. `api.reportOpened` emits nothing, because the report shows `= ?`, not an answer; its effect appears later as `eligibleCheck:false` and `timingMs:null`. |
| Resolution | `recordQuestionResolution`, which runs only from the accepted commit in `commitPendingResolution`. A second miss resolves only when Continue commits it, never when the worked explanation is shown. | The answer that completes the attempt. The fields are copied from the just-written `history.at(-1)` row. |
| Observed leave (`leftUnfinished`) | `discardPendingStatsPlay` reached through `handleInvalidSnap`, `handleInvalidSpecialPlay` or `handleInvalidCommittedPlay` while a successfully presented question is unresolved. | An accepted replacement of an incomplete linked attempt: `api.restart` returning true, or `api.repair` replacing the attempt during load, refresh or activation. A durable-tab repair is reported only once the repaired model is actually saved by the next accepted action. |
| Reload or close mid-question | Pending/unknown. Question links live in memory only; no marker is persisted. | The domain resumes the same attempt. The same `questionInstanceId` is resumed only by the strict durable-link rule below; otherwise the old question stays pending/unknown and later events get a new ID with no backfill. |

### Recorded, counted or undetectable

| Window | Classification |
|---|---|
| The transaction's `oncomplete` fires | **Recorded.** Event, `seq` and status are in the same transaction. A successful `put` request alone is not "recorded". |
| The transaction aborts (quota, error, or an abort after `put`) | **Counted.** Every change rolls back, so no event and no `seq` survive. A separate status-only transaction bumps `writeFailures` (never `seq`) when the consent and a supported envelope exist; otherwise the count waits in memory. |
| The status-only transaction also aborts, or no envelope exists yet | **Counted in memory.** Persisted with the next completed transaction in this document; lost if the document closes first. |
| Open error, failed `transaction()`, or a connection closed by `versionchange` | **Counted in memory**, as above. No automatic retry and no `localStorage` fallback. |
| `indexedDB` or `crypto.randomUUID` unavailable | **Undetectable.** `capture()` refuses; nothing is recorded or counted. Play is unchanged. |
| Hint present but the database or the consent record is missing | **Intentionally dropped.** There is no consent. A database that is not listed is never opened. Without listing support, the fallback open aborts its upgrade: no store or record is created, though an engine may keep an empty name-only entry (see Storage). |
| Page closes between domain acceptance and `oncomplete` | **Undetectable.** Nothing local survives to count it. |
| Committed, then lost to power or OS failure before the browser flushes to disk | **Undetectable.** Default durability; no disk-flush promise. |
| Newer or unsupported database version or layout; newer or malformed consent or envelope; envelope of another generation; a legacy `localStorage` outbox key | **Paused.** Bytes are preserved untouched; nothing is appended or counted. |
| Consent removed or replaced, or the profile unassigned, before the transaction | **Intentionally dropped.** This is a stop or revocation, not a failure. |
| Site-data clearing, browser eviction, device loss | **Undetectable.** Counters go with the events. |

## Storage

IndexedDB database `learningReporting`, version 1, holds exactly one object store,
`records`, with out-of-line keys. Two records are owned, and both are strings:

- `enrollment`: the **authoritative consent**,
  `{"schemaVersion":1,"generation":"<uuid>","deviceId":"<uuid>","profileIds":["<uuid>", …]}`,
  with 1–8 unique profile UUIDs and no profile selection;
- `outbox`: the envelope below, serialized exactly as before.

The status record is a separate, separately versioned logical record inside the
envelope, so an event and its `seq` always commit in one transaction.

```json
{
  "schemaVersion": 1,
  "generation": "<enrollment generation UUID>",
  "status": {"schemaVersion": 1, "deviceId": "…", "epochId": "…", "highestSeq": 0, "droppedLocal": 0, "writeFailures": 0},
  "events": [],
  "links": {"facts": null, "factsRetired": null}
}
```

- **Mutations are transactions.** Append, acknowledge, reject-deleted, new epoch,
  the link update, the overflow drop and the status-only failure count are each
  one `readwrite` transaction over `records`. Each reads `enrollment` and
  `outbox`, validates them, and puts at most one new `outbox` string.
  - All decision logic runs synchronously inside the read's success handler,
    with no `await` while the transaction is live.
  - IndexedDB orders overlapping read-write transactions across tabs. A later
    transaction sees every earlier committed one, and an abort undoes the whole
    transaction.
  - There is no outbox Web Lock. The games' own domain locks are unchanged.
- **The recorder never creates a store, a consent or any record, and never
  migrates or bootstraps from the hint.** Schema and consent come only from
  #200's explicit enrollment (and from test fixtures). The exact storage
  behavior depends on the state:
  - **Default off (no valid hint):** no IndexedDB API is called at all; there is
    no `open` and no `databases()`. This is what #199 production always runs,
    because nothing in it writes a hint.
  - **Valid hint, `indexedDB.databases()` supported:** a metadata-only listing
    runs first. A database that is not listed (or is listed at version 0) is
    never opened. A newer version is classified as future without opening it.
    The tested engines (Chromium and WebKit in this repository's Playwright
    gate) take this path.
  - **Valid hint, but `databases()` unsupported, failing, or racing a deletion:**
    the recorder falls back to opening at version 1 and aborts the upgrade, so
    no store, consent or record can exist. Some engines may still keep an
    empty, name-only database entry after an aborted first open; Playwright
    WebKit did so before the preflight was added. This combination needs a
    hint, which only an enrollment writes, and is not covered by the
    real-browser absence check (that check requires `databases()` support).
    It is a documented residual, not a proven metadata-free result.
  - **Stop's probe** follows the same rules: a missing database is never opened
    where it can be listed.
- **Pauses:** a newer version or an unsupported layout (any other store set)
  closes the connection and pauses. Every connection closes on `versionchange`.
- **Legacy key:** the never-released `localStorage` key
  `learningReporting:outbox:v1` is read only after a valid hint. If present, it
  is preserved untouched and recording pauses; only `stop()` removes it. Nothing
  is migrated.
- **Bounds:** at most 500 events, and at most 262,144 UTF-16 code units in
  `JSON.stringify(envelope)`. That count is not a portable byte charge and not a
  quota guarantee. On overflow the oldest events are dropped and
  `droppedLocal` grows in the same write; the newest events are kept.
- **Links:** only the single Facts link below is persisted. Football links stay in
  memory.

## Enrollment interface (written by #200, read here)

#200 writes two things together: the authoritative consent record above, and
the synchronous `localStorage` **hint** `learningReporting:enrollment:v1`:

```json
{"schemaVersion": 1, "generation": "<uuid>", "deviceId": "<uuid>", "profileIds": ["<uuid>"], "activeProfileId": "<uuid>|null"}
```

- **The hint is admission only, never authority.**
  - `activeProfileId` must be one of the 1–8 unique profile UUIDs, or null.
  - With one profile and a null selection, that profile is used. With several
    and a null selection, nothing is recorded.
  - A missing, malformed or future hint means recording is off.
  - This build never writes either record; only `stop()` removes them.
- **Capture and the consent check.** `generation`, `deviceId` and `profileId`
  are captured from the hint synchronously, when the domain accepts the action.
  Inside the transaction the item is recorded only if all of these hold:
  - the authoritative consent exists and is supported;
  - its `generation` and `deviceId` equal the captured values;
  - it lists the captured `profileId`;
  - this document has not stopped that generation.

  Otherwise the item is dropped. A stale hint therefore never records once the
  consent is gone.
- A normal `activeProfileId` change never re-attributes queued or captured
  events. #200 must update the hint and the consent's `profileIds` together.
- An envelope whose `generation` or `deviceId` differs from the consent pauses
  recording and is preserved. #200 must stop before re-enrolling, and must not
  re-enroll while `deletionPending()` is true.

## Event contract, `schemaVersion: 1`

Every event has exactly these common fields:

`schemaVersion, eventId, deviceId, epochId, seq, profileId, game, gameVersion, recordedAt, kind, questionInstanceId`

- `eventId`, `deviceId`, `epochId`, `profileId`, `questionInstanceId`: lowercase
  UUIDs from `crypto.randomUUID`. `eventId` is generated once per logical event
  and never regenerated on replay, restore or acknowledgment.
- `seq`: an integer from 1, strictly increasing within `epochId`.
- `game`: `football` or `facts`. `gameVersion`: `x.y.z`. `recordedAt`: ISO 8601
  UTC wall clock at domain acceptance, informational only.
- `kind`: `attempt`, `help`, `resolution` or `leftUnfinished`.

Per-kind fields. Keys not listed are **forbidden**, not null.

| Game | Kind | Fields |
|---|---|---|
| football | attempt | `familyId, concept, purpose, tier, grading, evidenceClass, number (1–2), correct, support`: number 1 `initial` or `guided`; number 2 `guided` |
| football | help | metadata, `number`, `support`: number 1 guided; number 2 guided or worked |
| football | resolution | metadata, `resolution` (`firstTryCorrect`/`retryCorrect`/`secondMiss`) |
| football | leftUnfinished | metadata only |
| facts | attempt | `factId, family, number, correct, helped` |
| facts | help | `factId, family, number, helped: true` |
| facts | resolution | `factId, family, outcome, eligibleCheck, timingMs, helped` |
| facts | leftUnfinished | `factId, family` |

- **Football has no timing key on any kind.** Its local `elapsedMs` is never read.
- Football `support` uses the live stage names unchanged (`normalizeSupport` in
  `contextual-questions.js`, `nextSupport` in `learning.js`): `initial` is the
  unsupported first try, `guided` is guided-first or the retry, and `worked` is
  the explanation after a second miss (a `help` event only). The legacy local
  `none` value is never produced by the live adapter and is rejected.
- **Facts timing** appears only on `resolution`: `timingMs` is the completed
  history row's guarded `ms` (300–60000, a multiple of 100) or null. Null means
  not timed. `eligibleCheck` is that row's `eligible`. `outcome` is `shown` exactly
  when `helped`; a shown answer has null timing and is never an eligible check.
- Facts `number` is the attempt the event belongs to (`misses + 1` when accepted).
  The domain caps `misses` at 99, so every later accepted answer is `number: 100`;
  the controller marks accepted answers explicitly so none is lost at the cap.
  `attempt.helped` is the help state before any automatic help that answer caused.
- Football metadata must exactly equal the shared catalog entry for `familyId`,
  and the live adapter also checks it against `FOOTBALL_CONTEXTUAL_QUESTIONS`
  before recording. Facts `factId`/`family` must match the catalog, and the live
  adapter checks `PLACE_FACTS.byId`. Any mismatch records nothing.
- Never recorded: prompt or answer text, choice IDs, submitted values, bindings,
  private opponent plans, names, free text, IP, location, play IDs, or any field
  not listed.

### Evidence outcomes stay distinct

Independent first-try success, correct after a retry, second miss, help shown,
literacy checks and no-stakes questions are separate fields, never one score.
`grading` (`gate`/`noStakes`) and `evidenceClass` (`literacy`/`independent`) are
independent axes. Consumers must never count `grading: 'noStakes'` or
`evidenceClass: 'literacy'` as independent evidence. Legacy `unclassified`
evidence cannot be written (the enum excludes it) and nothing is backfilled.

No current Football family is `noStakes`, and Facts has no no-stakes concept, so
there is no live no-stakes producer. The contract supports it only where the
catalog says so; a synthetic catalog fixture in the domain tests covers it.

## Shared catalog and versioning

`LEARNING_OUTBOX.CATALOG` is a closed copy of the published metadata for both
sources, so any page can validate every stored event without loading the other
game. Parity tests bind it to the live `FAMILY_REGISTRY` and `PLACE_FACTS.catalog`.

- Any catalog change (a new, changed or retired Football family, or a Facts
  catalog change) must bump the event `schemaVersion` and the envelope version.
  A retired family stays as a historical entry so queued events stay valid.
- An older page that reads a newer envelope, status record or event
  `schemaVersion` pauses every automatic mutation and leaves the bytes untouched.
  A malformed current-schema envelope also pauses and is preserved. There is no
  repair and no permissive fallback.
- **Maintenance cost:** a catalog change is a coordinated change. It edits this
  shared file, which changes both games' cache keys, so both games release
  together (`REGISTRY_RELEASE_TARGET=football,place-value-practice`). Until both
  pages update, a stale page pauses recording; it never corrupts data.

## Identity, epochs and lifecycle

- A new envelope gets a fresh `epochId`, `highestSeq: 0`. `seq` is allocated
  inside the transaction from the `highestSeq` it read, so two tabs never share
  one.
- `eventId` is generated once, when `record`/`recordFacts` queues the
  observation. A logical event already in the envelope is skipped, so it is
  never stored twice. There is no automatic retry; an aborted transaction loses
  that event and its `seq` together.
- **Known rewind:** each document remembers, in memory, the highest `seq` it has
  written or observed (including through the read-only `snapshot()`) for up to
  16 recent epochs. A fresh read of a remembered epoch with a lower `highestSeq`
  starts a new epoch before allocating. `startNewEpoch()` does the same for a #200 `seq`
  conflict response. Old events keep their `eventId`, payload, `epochId` and
  `seq`. Detection of an erased or rewound tail is not guaranteed.
- `acknowledge(ids)` and `rejectDeleted(ids)` remove by exact `eventId` and never
  renumber.
- **`stop()`** runs these steps in order:
  1. Synchronously it invalidates this document's queued items, clears its
     links, and halts the hint's generation in memory.
  2. It closes its own connection and probes the database without a version.
     A missing database is never created (the upgrade is aborted), and the
     result is success.
  3. On a supported version-1 database, one `readwrite` transaction deletes
     `enrollment`, `outbox` and the #200 `credential`, `sync` and `binding` records
     without parsing them. **Success means `oncomplete`.**
  4. A newer version or unsupported layout is opaque owned data, so `stop()`
     calls `deleteDatabase('learningReporting')`. `onsuccess` is success and
     `onerror` is failure. `onblocked` returns `{ok:false, reason:'blocked',
     pending:true}`: the request stays live and cannot be cancelled. While it is
     pending, `deletionPending()` is true, `capture()` refuses, and `snapshot()`
     reports `stopping`. When it settles, the result is recorded; nothing
     recreates the database.
  5. Only after the authority is gone are the hint and the legacy key removed.
     If that `localStorage` removal throws, the result is
     `{ok: true, hintRemoved: false}`. The authority is gone, but the owned
     hint may remain; a leftover hint cannot authorize a write, because every
     transaction requires the deleted consent. #200 should surface it and retry
     the removal. A blocked deletion that settles later performs the same
     cleanup, including the in-memory failure count.

  There is no tombstone. Other tabs' queued transactions find no consent and
  drop their items, so a stale hint cannot revive anything. A failed stop stays
  halted in this document. A later enrollment is a new generation with a fresh
  epoch. An empty version-1 database (schema only, no records) may remain after
  a stop; it holds no reporting state.

### Facts durable link

`links.facts = {questionInstanceId, nonce, factId, serial, misses, helped, firstCorrect}`
exists only while a linked attempt is incomplete. An observation resumes that
`questionInstanceId` only when all hold:

- the tab is writable (not memory mode) and either this document wrote the link,
  or its current attempt came from a persisted save that normalized successfully
  (never a fresh `create()` model);
- `nonce`, `factId` and `serial` are equal;
- progress only moves forward from the link: `misses` does not decrease, `helped`
  does not return to false, `firstCorrect` does not return to null.

Otherwise the link is unknown, never left, and the next observation gets a new
UUID with no backfill. A resolution or leave retires the link and records its key
in `links.factsRetired`; a delayed observation of a retired key can neither
recreate nor resolve the link. Link updates run inside the transaction against
its fresh read, so out-of-order callbacks never move a link backwards. Memory-mode
documents keep their links in memory only and never read or replace
`links.facts`; a link shared with storage is not continued in memory mode.

## #200 enrollment and sync

`shared/learning-sync.js` (plain global `LEARNING_SYNC`) loads after the outbox and
`shared/learning-reporting/config.js` in both games and on the public device page
`shared/learning-reporting/index.html`. The service is `services/learning-reporting`.

- **Off unless configured.** With an empty `serviceUrl` nothing reads storage, opens
  IndexedDB, sets a timer or sends a request. With a service origin but no hint, it reads
  the hint once. The #199 consent-only test fixtures have no credential and never upload.
- **Records.** Three more strings in the same `records` store (no layout change):
  - `credential`: `{schemaVersion, generation, deviceId, serviceOrigin, token}`. The token
    is sent only as `Authorization: Bearer`.
  - `sync`: `{schemaVersion, generation, suppressed: [{eventId, reason}] (≤ 500), lastSuccessAt, notice}`.
  - `binding`: `{schemaVersion, generation, facts: {nonce, factId, serial, profileId} | null}`.
  Every #200 record names the consent's generation. `stop()` deletes all five records.
- **Install.** The device page exchanges a one-time code, then one IndexedDB
  transaction writes consent, credential and sync state (refusing if any owned record
  exists or a Stop deletion is pending); the hint is written last.
- **Profile attribution.** `capture(profileId)` pins a capture to a profile the hint lists
  (an unlisted pin refuses). The who-is-playing choice is per tab (sessionStorage
  `learningReporting:player:v1`) and shows only neutral slots (Player 1, Player 2); the
  hint's `activeProfileId` is never rewritten. Football pins each question to its first
  recorded profile in memory. A Facts question keeps the profile recorded for it first:
  this document's own link remembers it, and a durable link resumed by a reload or another
  tab takes it from `binding`, which changes only with `links.facts` in the same
  transaction and only in writable (durable) documents. A resumed link without a matching
  binding, or whose profile the consent no longer lists, records nothing for that
  question; play is unaffected. On a consent with several profiles, an unlinked question
  that already has accepted progress (a lost commit, a refused capture, or practice
  before enrollment) also records nothing: its first player is unknown, and the current
  choice must not be applied to it. With one profile the attribution is unambiguous and
  the #199 behavior is unchanged. Football likewise leaves a question unrecorded after
  any of its observations was refused.
- **Upload.** Envelopes `{schemaVersion: 1, status, events}` of at most 20 unsuppressed
  events / 64 KiB, in envelope order, on load, when online, soon after a resolution and
  every 60 s while visible, with 30 s to 15 min jittered backoff and a 20 s deadline. A
  Web Lock, where available, keeps one tab syncing at a time; without it, duplicate
  uploads are harmless.
- **Results are applied in one guarded transaction** (`applySync(expected, outcome)`):
  the consent and credential must still be exactly the enrollment that sent the request,
  removed IDs must be submitted and `accepted` or `deleted`, refused IDs are suppressed
  (kept, not resent), and a `seq-conflict` in the still-current epoch rotates it once. A
  response that does not name exactly the submitted events changes nothing.
- **Revocation.** Only a 403 `revoked` (the server's proof) runs
  `stopGeneration(expected)`. It halts that generation at once, then deletes every owned
  record in one transaction only if they still belong to it, and removes the hint only if
  it names that generation. A 401 keeps the queue and records a notice.

## #200-facing API (no production caller in #199)

- **Synchronous and never awaited by play:** `capture()`, `record()`,
  `recordFacts()`.
- **Asynchronous:** `acknowledge(ids)`, `rejectDeleted(ids)`,
  `startNewEpoch(reason)`, `stop()`, `snapshot()` and `idle()`.
  - `snapshot()` resolves a consistent view from one readonly transaction. It
    applies the same coherence rules as mutations, so it never returns `ok`
    for something #200 must not upload:
    - a legacy `localStorage` outbox key gives `legacy`;
    - a hint whose generation or device differs from the consent gives
      `revoked`;
    - an envelope of another generation or device gives `foreign`;
    - newer or malformed data gives `future` or `malformed`.
  - `idle()` waits for this document's transactions to complete or abort.
- **Status:** `deletionPending()`.
- **Validators and catalog:** `validateEvent()`, `validateStatus()`,
  `validateEnvelope()`, `validateCatalog()`, `CATALOG`.
- **Exported constants:** `DB_NAME`, `DB_VERSION`, `STORE`, `CONSENT_RECORD`,
  `OUTBOX_RECORD`, `ENROLLMENT_KEY`, `LEGACY_OUTBOX_KEY`. A future installer must
  use these.
