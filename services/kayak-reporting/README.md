# Kayak reporting migration (#142)

Cloudflare Worker replacement for the Kayak Pipedream webhook. It receives the
existing JSON beacon, appends one row to the existing Google spreadsheet, then
sends a Gmail notification. No custom domain or paid Worker plan is required for
normal low-volume usage. The free allowance is shared with the account's other
Workers; deployment and actual usage must be checked before cutover.

**Prepared, not cut over.** The game still uses Pipedream. This Worker defaults to
`REPORTING_ENABLED=false`; it cannot deliver until Google credentials are supplied
and reporting is explicitly enabled. Existing game versions remain unchanged.

## Local verification

Node 22 or newer:

```sh
npm ci
npm run types
npm run check
npm test
npm run test:runtime
npm run build
```

The tests use synthetic requests and mocked Google responses. `test:runtime`
executes the enabled handler in local workerd with real local D1 and rate-limit
bindings, including concurrent quota reservations and the 25-second timeout. All
Worker outbound requests are intercepted locally. These checks do not send email
or modify the real spreadsheet; live delivery and Free-plan CPU usage still need
verification. The build is a Wrangler dry run. Keep the direct Miniflare pin aligned
with the version used by Wrangler and rerun this suite when updating either.

## Google setup

1. In Google Cloud, create a dedicated project and enable Gmail API and Google
   Sheets API. Configure Google Auth Platform for External personal use.
2. Publish the app-information and privacy pages under `kayak/reporting/` on the existing game host with approval. Set the Google branding homepage and privacy-policy URLs to those live pages and add the host as an authorized domain. Google currently blocks leaving Testing when those links are absent. Then set publishing status to **In production** before final authorization. Testing
   refresh tokens with these scopes expire after seven days. Personal-use apps
   have a verification exception; an unverified-app warning can remain.
3. Create a Desktop OAuth client and download its credentials outside the repo.
4. Follow [the local authorization helper instructions](scripts/README.md).
   The requested scopes are `spreadsheets` and `gmail.send`. The former grants
   access to all authorized-account spreadsheets, although this service fixes
   one destination. The latter permits sending without reading the inbox.
   `drive.file` needs explicit file selection and a separate consent flow; simply
   substituting it would not authorize the existing spreadsheet.
5. The helper writes an owner-readable secrets JSON file outside the repository.
   Never copy credentials into source, issues, logs, or chat. Import the five
   values using `npx wrangler secret bulk /absolute/private/path/secrets.json`
   only when deployment is authorized. Remove the local credential file once
   verified and safely stored. Never place secrets under the static game root.

Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
`SPREADSHEET_ID`, `NOTIFICATION_EMAIL`. Credentials do not belong in `wrangler.jsonc`. The recipient must be the owner's Gmail address; it is fixed
server-side and is never accepted from a game payload.

## Delivery contract

- POST `/events`, with the game's existing `text/plain` JSON body and its allowed
  browser origin. `game_start`, `level_start`, and `level_complete` are accepted.
- Uses Cloudflare's `CF-Connecting-IP`, never client-posted IP fields.
- Preserves A:N: ip, timestamp, event, level, levelName, score, version,
  deviceType, screen, lang, **tz**, platform, ua, referrer. The old workflow
  accidentally duplicated platform into tz. Historical rows are not rewritten.
- Sheets uses `RAW`, so client strings cannot execute as spreadsheet formulas.
- Email subject: `kayak played by IP <ip>`. Plain-text body:
  `kayak played by IP <ip> check out the google sheet`.
  Gmail changes the sender from Pipedream to the authorized Gmail account.
- Email starts only after Sheets confirms one appended row. HTTP 200 means both
  Google APIs confirmed success; inbox receipt still needs a separate check.
- HTTP 202 means the row was recorded but the configured daily email cap was reached (or email notifications were disabled). No delayed notification is queued.
- HTTP 502 means delivery failed or is uncertain. A row may exist without email;
  a timed-out request may have succeeded upstream. There is deliberately no
  automatic retry that could duplicate rows or mail. This retains the existing
  best-effort reporting model, not durable or exactly-once delivery.
- D1 reserves each Gmail attempt atomically across all Worker instances. The hard maximum is 100 attempts per UTC day; `EMAIL_DAILY_LIMIT` may lower that to 0–100 (0 disables email). This uses the database date, never the event timestamp. Failed or uncertain Gmail sends consume their slot. Quota errors fail closed for email after retaining the spreadsheet row. The counter stores only a date and count, not player details. A UTC-day cap can allow twice that number across a midnight boundary and does not cap the owner's other email use or Sheets requests.
- A 25-second deadline bounds all Google calls together. `waitUntil` keeps the
  same delivery promise alive after a beacon disconnect, within Workers limits.
- Bodies are capped at 8 KiB. Per-IP limit: 30 valid events/minute per Cloudflare
  location. This may throttle users sharing an IP. Origin filtering and rate
  limiting reduce casual abuse; the public game cannot keep an API secret, and
  forged non-browser requests remain possible. This is not a global quota cap.
- Logs contain only service, event type, outcome, stage and numeric upstream
  status (and receiver rejection status). No tokens, message bodies, IPs or device details are logged.
- GET `/health` has no side effects; its enabled flag is not a Google connectivity
  test. Never probe POST endpoints casually: enabled ones create rows and email.

## Authorized deployment and cutover checklist

1. Retain the Pipedream workflow export privately before retirement. The
   [sanitized inspection record](pipedream-v48.md) is a reconstruction, not a
   native export. Pipedream stays enabled through verification.
2. Confirm the configured Cloudflare account, Workers Free plan and actual
   `workers.dev` subdomain. Check that the rate-limit namespace is unused by
   existing Workers. Verify the production game origin matches `ALLOWED_ORIGIN`.
3. Create a dedicated D1 database named `kayak-reporting-quota`, replace the all-zero local placeholder `database_id` in `wrangler.jsonc` with its returned ID, and run `npx wrangler d1 migrations apply kayak-reporting-quota --remote` to apply the migration with tracking. Keep the shared database and its counters when redeploying or rolling back; deleting/resetting it would reset the protection. Then deploy this independent Worker with reporting disabled. Import credentials,
   then enable reporting for an explicitly authorized delivery test. Do not
   enable local dev against real credentials unless real writes are intended.
4. Submit one labeled test for each of the three event types. Confirm the live tab is named `Sheet1` with the expected A:N headers and compare historical numeric/text cell types for timestamp, level and score. Verify exactly one
   A:N row and one received email per event, correct timezone/IP, and order.
   Check Workers CPU usage under the Free plan; network wait is not CPU time.
   Revoke or break a test credential to verify failure visibility without
   interfering with production reporting. Restore it before proceeding.
5. Verify a small test email cap with concurrent synthetic events against isolated local D1 storage: spreadsheet rows continue, Gmail attempts stop at the cap, failures consume reservations, and a database error never permits mail. Only after delivery verification, change `PHONE_HOME_URL` to the deployed
   `/events` endpoint. Bump Kayak `GAME_VERSION`, every Kayak HTML cache key,
   Kayak's `games.js` version, and `version.json` together. Preserve other games.
   Run the registry test with an exact base SHA and `REGISTRY_RELEASE_TARGET=kayak`.
6. Release with approval; verify production game events, spreadsheet and inbox.
   Disable old Pipedream workflow only after that check. Review Pipedream execution-history retention separately: disabling the workflow does not delete its saved history. Retain/export history or request owner-approved deletion as appropriate, and update the public pages to describe the final provider and retention state. Keep rollback details.
   To roll back, restore the old endpoint while its workflow is still available;
   do not replay already-submitted events blindly.

## Sources

- [Pipedream retirement and export](https://pipedream.com/docs/workflows)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Rate limiting and per-location semantics](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Google native OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Refresh token expiration](https://developers.google.com/identity/protocols/oauth2)
- [Personal-use verification exception](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes)
- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)

D1 configuration currently contains an all-zero placeholder for local testing. This branch is not deployment-ready until a real, verified database is provisioned. Do not enable reporting with the placeholder.
