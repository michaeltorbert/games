# Home Screen Install (vendored)

`shared/home-screen-install/` holds a vendored copy of the classic script from
[michaeltorbert/home-screen-install](https://github.com/michaeltorbert/home-screen-install).
One copy serves Football, Place by Place and Kayak.

Football loads and mounts the pinned classic component on its start screen.
Its native guide participates in the start screen focus and overlay lifecycle;
visibility uses only the component’s current standalone-mode signals and stores
no installation flag. Other games have not adopted it. Integration and native
iPhone/iPad acceptance are tracked separately:

- Football: #193
- Place by Place: #194
- Kayak: #195

## Files

| File | Purpose |
| --- | --- |
| `home-screen-install.js` | Classic script (global `HomeScreenInstall`) from the pinned release |
| `SHA256SUMS` | The release's checksums for both formats; only the classic entry is used here |
| `home-screen-install.lock.json` | Pin: version, tag, full source commit, format and script SHA-256 |

Do not edit these files by hand. Check them offline with:

```sh
npm run check:home-screen-install
```

The same check runs on every pull request and push to `main` in
`.github/workflows/home-screen-install.yml`. It verifies only the vendored
files; it is not a game test.

## Updates

A local daily job proposes newer stable releases as pull requests titled
“Update home-screen-install to vX.Y.Z”. Each one changes only the three files
above, through the Claude GitHub App. The job never merges or deploys. It runs
only while the maintainer's configured Mac is on and logged in, so an update
can arrive late or not at all while that Mac is unavailable. See the source
repository's `automation/README.md`.

After a game adopts the button, treat merging an update as a release of that
game, following this repository's version, cache-key and registry rules.

The source repository has no license; the package is not published to any registry.
