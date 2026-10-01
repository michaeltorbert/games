# Google authorization helper

This helper prepares local credentials for the Kayak reporting Worker. It does
not deploy a Worker, change the game endpoint, write spreadsheet rows, or send
email. Node.js 22 or newer, Git, and a macOS/Linux system browser are required.

## Prepare Google

1. In a dedicated Google Cloud project, enable Google Sheets API and Gmail API.
2. Configure Google Auth Platform for the account owner. For an ordinary personal
   Google account, use the External audience. Declare `spreadsheets` and
   `gmail.send` scopes. The Sheets permission grants access to all the owner's
   spreadsheets, although the Worker uses only its configured spreadsheet ID.
   Gmail send permission does not read the inbox.
3. Set publishing status to **In production before obtaining the final token**.
   External apps in Testing receive refresh tokens that expire after seven days
   for these scopes. Google's personal-use verification exception permits this
   owner-only app without a verification review; an unverified-app warning can
   still appear. The owner should verify the project/client before proceeding.
4. Create an OAuth client with application type **Desktop app** and download its
   JSON to a private location outside this repository. Do not paste its contents
   or any authorization codes into chat, issues, or terminal arguments.

Official references: [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes),
[Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[personal-use verification exception](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification),
[token expiration](https://developers.google.com/identity/protocols/oauth2), and
[desktop authorization](https://developers.google.com/identity/protocols/oauth2/native-app).

## Authorize locally

Choose an absolute output path in a private directory outside **all Git
checkouts**. Create the directory with mode 0700 and use its canonical path
without symbolic links. The downloaded client JSON must also be outside Git
checkouts and must be a regular file without symbolic links. For example, create
a temporary private directory with `mkdir -m 700 /private/tmp/kayak-google-credentials`.
Do not use a web-served directory.

From `services/kayak-reporting`, after project preparation:

```sh
node scripts/authorize-google.mjs \
  --client /private/path/google-desktop-client.json \
  --email owner@example.com \
  --spreadsheet EXISTING_SPREADSHEET_ID \
  --output /private/tmp/kayak-google-credentials/secrets.json
```

Use the actual owner notification address and existing spreadsheet ID. The
helper binds a random port on `127.0.0.1` before opening Google in the system
browser. The owner chooses the correct Google account and approves both scopes.
Google redirects directly to the listener; no copying of authorization codes is
required. The listener has a five-minute deadline. State validation and S256 PKCE
bind the response to this attempt. Missing/partial consent, missing refresh
credentials, and token-exchange failure all stop without saving credentials.

A successful run saves a JSON object to the required `--output` path with mode
0600 containing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REFRESH_TOKEN`, `NOTIFICATION_EMAIL`, and `SPREADSHEET_ID`. There is no
in-repository output or default credential path. Preflight runs before opening
consent and again before writing. Atomic publication refuses to overwrite an
existing file or symlink. The parent directory must be owned by the current user
with mode 0700. The helper prints no token, authorization code, client secret,
or token endpoint response. Its mode-0600 temporary file is created in that
same private external directory and removed on normal success/failure.

After reviewing the target Worker/account, upload the JSON through Wrangler
secret storage from the service directory:

```sh
npx wrangler secret bulk /private/tmp/kayak-google-credentials/secrets.json
```

This command changes the Worker's secrets and should be run as part of the
approved deployment setup. Keep the JSON private and remove local credential
copies when no longer needed. Never copy them into the game checkout or static
hosting directory. Git ignore rules are defense in depth; they do not prevent a
file server from exposing secrets. The helper therefore refuses credential
inputs and outputs anywhere in a Git checkout.

If an output already exists, choose a new private output path. The helper never
merges or replaces existing secrets. It supports macOS `open` and Linux
`xdg-open`; Windows is not supported. Use the system browser because Google may
reject embedded browser consent.

The success message confirms only that Google issued the requested authorization
and credentials were saved to the external file. Google account selection, Sheet access, actual
spreadsheet writes, received notifications, and Worker deployment still require
verification. A token can later be revoked or invalidated; In production removes
the seven-day Testing limit but is not a promise that credentials never expire.

## Tests

```sh
node --test test/oauth.test.mjs
```

Tests use synthetic client credentials and a real loopback listener with a fake
Google token endpoint function. They do not contact Google or Cloudflare, launch
a browser, use a real authorization code, or send an email. Temporary private directories and Git repositories verify external-path checks,
private directory/file modes, and refusing to replace existing files and
symlinks. All test credential values are synthetic.
