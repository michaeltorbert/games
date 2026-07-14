import fs from 'node:fs/promises';
import path from 'node:path';

const projects = [
  'iphone-15-portrait',
  'iphone-17-pro-max-portrait',
  'ipad-11-portrait',
  'ipad-pro-13-portrait',
  'ipad-pro-13-landscape',
  'ipad-11-landscape',
];

const labels = [
  '01-start',
  '02-offense-call',
  '03-offense-question',
  '03b-offense-retry',
  '04-offense-feedback',
  '05-player-td',
  '06-defense-transition',
  '07-defense-call',
  '08-defense-question',
  '08b-defense-retry',
  '08c-defense-explanation',
  '09-defense-feedback',
  '10-opponent-td',
  '11-offense-transition',
  '12-quarter-end',
  '13-halftime',
  '14-final',
  '15-reduced-motion',
];

const matrixDir = path.join(process.cwd(), 'tests', 'artifacts', 'release-matrix');
const expectedProjects = projects.slice().sort();
const actualProjects = (await fs.readdir(matrixDir, { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

if (JSON.stringify(actualProjects) !== JSON.stringify(expectedProjects)) {
  throw new Error(`Release artifact projects differ. Expected ${expectedProjects.join(', ')}; got ${actualProjects.join(', ') || 'none'}.`);
}

const expectedFiles = labels.map(label => `${label}.png`).sort();
for (const project of projects) {
  const projectDir = path.join(matrixDir, project);
  const actualFiles = (await fs.readdir(projectDir, { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort();

  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`${project} artifacts differ. Expected ${expectedFiles.join(', ')}; got ${actualFiles.join(', ') || 'none'}.`);
  }

  for (const file of actualFiles) {
    const stats = await fs.stat(path.join(projectDir, file));
    if (stats.size === 0) throw new Error(`${project}/${file} is empty.`);
  }
}

console.log(`Verified ${projects.length * labels.length} Football release screenshots across ${projects.length} projects.`);
