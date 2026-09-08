import fs from 'node:fs/promises';
import path from 'node:path';

const matrixDir = path.join(process.cwd(), 'tests', 'artifacts', 'release-matrix');
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
