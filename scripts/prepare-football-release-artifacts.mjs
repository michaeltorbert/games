import fs from 'node:fs/promises';
import path from 'node:path';

const matrixDir = path.join(process.cwd(), 'tests', 'artifacts', 'release-matrix');

await fs.rm(matrixDir, { recursive: true, force: true });
await fs.mkdir(matrixDir, { recursive: true });
