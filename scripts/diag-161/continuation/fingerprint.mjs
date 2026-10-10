// Issue #161 continuation: print the deterministic source/runtime fingerprint
// that run-arm.mjs and run-batch.mjs require via --expect-fingerprint.
//   node scripts/diag-161/continuation/fingerprint.mjs [--out <new-file.json>]
// The hash covers content-only entries for scripts/, tests/, football/,
// shared/ (excluding artifacts*), the root config/package/lock/version.json,
// the named installed Playwright files, the WebKit executable and Node version.
import path from 'node:path';
import { args, fingerprint, writeJson } from './lib.mjs';

const opt = args(process.argv.slice(2), { out: 'value' });
const fp = fingerprint();
const candidate = fp.entries.filter(e => e.path.startsWith('scripts/diag-161/continuation/'));
if (opt.out) writeJson(path.resolve(opt.out), fp);
console.log(JSON.stringify({ sha256: fp.sha256, entryCount: fp.entryCount, head: fp.head, node: fp.node, webkit: fp.webkit, porcelainZ: fp.porcelainZ, candidate }, null, 2));
