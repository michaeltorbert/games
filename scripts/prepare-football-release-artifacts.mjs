import fs from 'node:fs/promises';
import path from 'node:path';

// The artifact root ends in `.nosync` so iCloud Drive (which syncs ~/Documents)
// never tracks it. A synced root let the sync daemon resurrect the previous
// run's project directories after this script removed them, which then landed
// beside the fresh ones as empty ` 2`/` 3` conflict copies (issue #109).
const matrixDir = path.join(process.cwd(), 'tests', 'artifacts.nosync', 'release-matrix');
const projects = [
  'iphone-15-portrait',
  'iphone-17-pro-max-portrait',
  'ipad-11-portrait',
  'ipad-pro-13-portrait',
  'ipad-pro-13-landscape',
  'ipad-11-landscape',
];

await fs.rm(matrixDir, { recursive: true, force: true });
await fs.mkdir(matrixDir, { recursive: true });
await Promise.all(projects.map(project => (
  fs.mkdir(path.join(matrixDir, project), { recursive: true })
)));
