import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const GAMES_PATH = path.join(REPOSITORY_ROOT, 'games.js');
const VERSION_PATH = path.join(REPOSITORY_ROOT, 'version.json');
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMANTIC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const PRESERVED_UNREGISTERED_PROTOTYPES = Object.freeze([
  Object.freeze({
    id: 'place-value',
    reason: 'Preserved original place-value prototype; it is not a portal game.',
  }),
  Object.freeze({
    id: 'place-value-v5',
    reason: 'Preserved place-value version 5 prototype; it is not a portal game.',
  }),
  Object.freeze({
    id: 'place-value-v6',
    reason: 'Preserved place-value version 6 prototype; it is not a portal game.',
  }),
]);

async function loadGames() {
  const source = await readFile(GAMES_PATH, 'utf8');
  const serializedGames = vm.runInNewContext(
    `${source}\nJSON.stringify(GAMES);`,
    Object.create(null),
    { filename: GAMES_PATH, timeout: 100 },
  );

  assert.equal(
    typeof serializedGames,
    'string',
    '`games.js` must define a JSON-serializable global `GAMES` value.',
  );

  // Parse the serialized value in this realm before making prototype-sensitive assertions.
  return JSON.parse(serializedGames);
}

async function loadVersionManifest() {
  return JSON.parse(await readFile(VERSION_PATH, 'utf8'));
}

function gitClassifiesIndexPathAsIgnored(repositoryRelativeIndexPath) {
  const result = spawnSync(
    'git',
    ['check-ignore', '--quiet', '--', repositoryRelativeIndexPath],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      shell: false,
    },
  );
  const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
  const stderrContext = stderr ? JSON.stringify(stderr) : '<empty>';

  if (result.error) {
    const errorCode = result.error.code ? ` (${result.error.code})` : '';
    throw new Error(
      `Failed to spawn git check-ignore for "${repositoryRelativeIndexPath}"${errorCode}: `
      + `${result.error.message}; stderr: ${stderrContext}`,
    );
  }
  if (result.signal !== null) {
    throw new Error(
      `git check-ignore for "${repositoryRelativeIndexPath}" terminated with signal `
      + `${result.signal}; stderr: ${stderrContext}`,
    );
  }
  if (result.status === null) {
    throw new Error(
      `git check-ignore for "${repositoryRelativeIndexPath}" returned a null status `
      + `without a signal; stderr: ${stderrContext}`,
    );
  }
  if (result.status === 0) return true;
  if (result.status === 1) return false;

  throw new Error(
    `git check-ignore for "${repositoryRelativeIndexPath}" returned unexpected status `
    + `${result.status}; stderr: ${stderrContext}`,
  );
}

async function listTopLevelIndexFolders() {
  const entries = await readdir(REPOSITORY_ROOT, { withFileTypes: true });
  const folders = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      try {
        const indexStats = await stat(path.join(REPOSITORY_ROOT, entry.name, 'index.html'));
        if (!indexStats.isFile()) return null;

        const repositoryRelativeIndexPath = path.posix.join(entry.name, 'index.html');
        return gitClassifiesIndexPathAsIgnored(repositoryRelativeIndexPath)
          ? null
          : entry.name;
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    }));

  return folders.filter(Boolean).sort();
}

test('registered games have valid unique entries and exact manifest versions', async () => {
  const [games, versionManifest] = await Promise.all([
    loadGames(),
    loadVersionManifest(),
  ]);

  assert.ok(Array.isArray(games), '`games.js` must define `GAMES` as an array.');
  assert.ok(
    versionManifest && typeof versionManifest === 'object' && !Array.isArray(versionManifest),
    '`version.json` must contain an object keyed by game ID.',
  );

  const registryIds = games.map((game, index) => {
    assert.ok(
      game && typeof game === 'object' && !Array.isArray(game),
      `GAMES[${index}] must be an object.`,
    );
    assert.equal(typeof game.id, 'string', `GAMES[${index}].id must be a string.`);
    assert.match(
      game.id,
      SLUG_PATTERN,
      `GAMES[${index}].id must be a lowercase URL-safe slug.`,
    );
    assert.equal(
      game.url,
      `${game.id}/`,
      `Registered game "${game.id}" must use the exact URL "${game.id}/".`,
    );
    assert.equal(
      typeof game.version,
      'string',
      `Registered game "${game.id}" must have a string version.`,
    );
    assert.match(
      game.version,
      SEMANTIC_VERSION_PATTERN,
      `Registered game "${game.id}" must use an x.y.z semantic version.`,
    );
    return game.id;
  });

  const duplicateIds = registryIds.filter((id, index) => registryIds.indexOf(id) !== index);
  assert.deepEqual(
    [...new Set(duplicateIds)].sort(),
    [],
    `Registry game IDs must be unique; duplicates: ${duplicateIds.join(', ') || 'none'}.`,
  );

  const manifestIds = Object.keys(versionManifest).sort();
  assert.deepEqual(
    [...registryIds].sort(),
    manifestIds,
    '`games.js` IDs must exactly equal the keys in `version.json`.',
  );

  for (const game of games) {
    assert.equal(
      typeof versionManifest[game.id],
      'string',
      `version.json["${game.id}"] must be a string.`,
    );
    assert.match(
      versionManifest[game.id],
      SEMANTIC_VERSION_PATTERN,
      `version.json["${game.id}"] must use an x.y.z semantic version.`,
    );
    assert.equal(
      game.version,
      versionManifest[game.id],
      `Version mismatch for "${game.id}" between games.js and version.json.`,
    );

    const indexPath = path.join(REPOSITORY_ROOT, game.id, 'index.html');
    let indexStats;
    try {
      indexStats = await stat(indexPath);
    } catch (error) {
      assert.fail(
        `Registered game "${game.id}" must provide ${game.id}/index.html (${error.code || error.message}).`,
      );
    }
    assert.ok(
      indexStats.isFile(),
      `Registered game "${game.id}" must provide ${game.id}/index.html as a file.`,
    );
  }
});

test('top-level index folders equal registered games plus exact preserved prototypes', async () => {
  assert.equal(
    gitClassifiesIndexPathAsIgnored('output/index.html'),
    true,
    '`output/index.html` must be ignored by the existing `output/` rule.',
  );
  assert.equal(
    gitClassifiesIndexPathAsIgnored('playwright-report/index.html'),
    true,
    '`playwright-report/index.html` must be ignored by the existing `playwright-report/` rule.',
  );
  assert.equal(
    gitClassifiesIndexPathAsIgnored('test-results/index.html'),
    true,
    '`test-results/index.html` must be ignored by the existing `test-results/` rule.',
  );
  assert.equal(
    gitClassifiesIndexPathAsIgnored('football/index.html'),
    false,
    '`football/index.html` must remain a non-ignored registered game index.',
  );

  const [games, topLevelIndexFolders] = await Promise.all([
    loadGames(),
    listTopLevelIndexFolders(),
  ]);
  const registryIds = games.map((game) => game.id).sort();
  const excludedIds = new Set(PRESERVED_UNREGISTERED_PROTOTYPES.map(({ id }) => id));

  for (const { id, reason } of PRESERVED_UNREGISTERED_PROTOTYPES) {
    assert.match(reason, /\S/, `The explicit exclusion for "${id}" must include a reason.`);
    assert.ok(
      topLevelIndexFolders.includes(id),
      `Excluded prototype "${id}" must still exist with index.html. Reason: ${reason}`,
    );
    assert.ok(
      !registryIds.includes(id),
      `Excluded prototype "${id}" must not overlap a registered game ID. Reason: ${reason}`,
    );
  }

  const nonExcludedIndexFolders = topLevelIndexFolders
    .filter((folder) => !excludedIds.has(folder))
    .sort();
  assert.deepEqual(
    nonExcludedIndexFolders,
    registryIds,
    'Top-level index folders, minus the three exact preserved prototypes, must exactly equal registered game IDs.',
  );
});
