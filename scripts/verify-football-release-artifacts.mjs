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
const phoneProjects = new Set(['iphone-15-portrait', 'iphone-17-pro-max-portrait']);

const labels = [
  '01-start',
  '02-offense-call',
  '03-offense-question',
  '03b-offense-retry',
  '04-offense-feedback',
  '05-player-td',
  '05a-player-conversion-decision',
  '05b-player-conversion-question',
  '05c-player-conversion-feedback',
  '06-defense-transition',
  '07-defense-call',
  '08-defense-question',
  '08b-defense-retry',
  '08c-defense-explanation',
  '08d-defense-coach-replay',
  '09-defense-feedback',
  '10-opponent-td',
  '10a-opponent-conversion-question',
  '10b-opponent-conversion-retry',
  '10c-opponent-conversion-explanation',
  '10d-opponent-conversion-coach-replay',
  '10e-opponent-conversion-feedback',
  '11-offense-transition',
  '12-quarter-end',
  '13-halftime',
  '14-final',
  '15-reduced-motion',
  '16-wake-forest-start',
  '17-wake-forest-read',
  '18-offense-fourth-down-decision',
  '19-offense-fourth-down-go-call',
  '20-offense-punt-question',
  '20a-offense-punt-feedback',
  '21-offense-field-goal-question',
  '21a-offense-field-goal-feedback',
  '22-defense-punt-question',
  '22a-defense-punt-feedback',
  '23-defense-field-goal-question',
  '23a-defense-field-goal-feedback',
  '24-defense-fourth-down-go-call',
  '25-season-start',
  '26-season-final',
  '27-season-complete',
  '28-season-pending',
  '29-season-unconfirmed',
];
const phoneLabels = [
  '30-season-pending-corrupt',
  '31-season-pending-future',
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

for (const project of projects) {
  const projectDir = path.join(matrixDir, project);
  const expectedFiles = [
    ...labels,
    ...(phoneProjects.has(project) ? phoneLabels : []),
  ].map(label => `${label}.png`).sort();
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

const expectedCount = projects.reduce(
  (count, project) => count + labels.length + (phoneProjects.has(project) ? phoneLabels.length : 0),
  0,
);
console.log(`Verified ${expectedCount} Football release screenshots across ${projects.length} projects.`);
