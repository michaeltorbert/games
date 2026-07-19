import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const GAMES_PATH = path.join(REPOSITORY_ROOT, 'games.js');
const VERSION_PATH = path.join(REPOSITORY_ROOT, 'version.json');
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMANTIC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DEFAULT_RELEASE_BASE = 'origin/main';
const DEFAULT_RELEASE_TARGET = 'football';

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

function evaluateGamesSource(source, sourceLabel) {
  let serializedGames;
  try {
    serializedGames = vm.runInNewContext(
      `${source}\nJSON.stringify(GAMES);`,
      Object.create(null),
      { filename: sourceLabel, timeout: 100 },
    );
  } catch (error) {
    throw new Error(`Failed to evaluate ${sourceLabel} in an empty VM: ${error.message}`);
  }

  assert.equal(
    typeof serializedGames,
    'string',
    `${sourceLabel} must define a JSON-serializable global GAMES value.`,
  );

  // Parse the serialized value in this realm before making prototype-sensitive assertions.
  try {
    return JSON.parse(serializedGames);
  } catch (error) {
    throw new Error(`Failed to JSON-clone GAMES from ${sourceLabel}: ${error.message}`);
  }
}

function parseVersionManifestSource(source, sourceLabel) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Failed to parse ${sourceLabel}: ${error.message}`);
  }
}

async function loadGames() {
  return evaluateGamesSource(await readFile(GAMES_PATH, 'utf8'), GAMES_PATH);
}

async function loadVersionManifest() {
  return parseVersionManifestSource(await readFile(VERSION_PATH, 'utf8'), VERSION_PATH);
}

function spawnGit(args, operation) {
  const result = spawnSync(
    'git',
    args,
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
      `Failed to spawn Git while trying to ${operation}${errorCode}: `
      + `${result.error.message}; stderr: ${stderrContext}`,
    );
  }
  if (result.signal !== null) {
    throw new Error(
      `Git terminated with signal while trying to ${operation}: `
      + `${result.signal}; stderr: ${stderrContext}`,
    );
  }
  if (result.status === null) {
    throw new Error(
      `Git returned a null status while trying to ${operation} `
      + `without a signal; stderr: ${stderrContext}`,
    );
  }

  return { ...result, stderrContext };
}

function gitClassifiesIndexPathAsIgnored(repositoryRelativeIndexPath) {
  const operation = `classify "${repositoryRelativeIndexPath}" with git check-ignore`;
  const result = spawnGit(
    ['check-ignore', '--quiet', '--', repositoryRelativeIndexPath],
    operation,
  );

  if (result.status === 0) return true;
  if (result.status === 1) return false;

  throw new Error(
    `git check-ignore for "${repositoryRelativeIndexPath}" returned unexpected status `
    + `${result.status}; stderr: ${result.stderrContext}`,
  );
}

function resolveExactReleaseBase(declaredBase) {
  assert.equal(
    typeof declaredBase,
    'string',
    'REGISTRY_RELEASE_BASE must be a string Git revision.',
  );
  assert.match(
    declaredBase,
    /\S/,
    'REGISTRY_RELEASE_BASE must name a non-empty Git revision.',
  );

  const result = spawnGit(
    ['rev-parse', '--verify', `${declaredBase}^{commit}`],
    `resolve release base "${declaredBase}" to an exact commit`,
  );
  if (result.status !== 0) {
    throw new Error(
      `Could not resolve REGISTRY_RELEASE_BASE "${declaredBase}" to a commit: `
      + `status ${result.status}; stderr: ${result.stderrContext}`,
    );
  }

  const exactCommit = result.stdout.trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(exactCommit)) {
    throw new Error(
      `Resolved REGISTRY_RELEASE_BASE "${declaredBase}" to malformed commit `
      + `${JSON.stringify(exactCommit)}.`,
    );
  }
  return exactCommit;
}

function loadFileFromExactCommit(exactCommit, repositoryRelativePath, declaredBase) {
  const result = spawnGit(
    ['show', `${exactCommit}:${repositoryRelativePath}`],
    `load ${repositoryRelativePath} from release base "${declaredBase}" (${exactCommit})`,
  );
  if (result.status !== 0) {
    throw new Error(
      `Could not load ${repositoryRelativePath} from REGISTRY_RELEASE_BASE `
      + `"${declaredBase}" (${exactCommit}): status ${result.status}; `
      + `stderr: ${result.stderrContext}`,
    );
  }
  return result.stdout;
}

function loadDeclaredReleaseBaseSnapshot() {
  const declaredBase = process.env.REGISTRY_RELEASE_BASE ?? DEFAULT_RELEASE_BASE;
  const targetId = process.env.REGISTRY_RELEASE_TARGET ?? DEFAULT_RELEASE_TARGET;
  const exactCommit = resolveExactReleaseBase(declaredBase);
  const gamesLabel = `${declaredBase}@${exactCommit}:games.js`;
  const versionLabel = `${declaredBase}@${exactCommit}:version.json`;

  return {
    declaredBase,
    exactCommit,
    targetId,
    games: evaluateGamesSource(
      loadFileFromExactCommit(exactCommit, 'games.js', declaredBase),
      gamesLabel,
    ),
    versionManifest: parseVersionManifestSource(
      loadFileFromExactCommit(exactCommit, 'version.json', declaredBase),
      versionLabel,
    ),
  };
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

function assertRegistryManifestConsistency(games, versionManifest, snapshotLabel) {
  assert.ok(Array.isArray(games), `${snapshotLabel} must define GAMES as an array.`);
  assert.ok(
    versionManifest && typeof versionManifest === 'object' && !Array.isArray(versionManifest),
    `${snapshotLabel} version.json must contain an object keyed by game ID.`,
  );

  const registryIds = games.map((game, index) => {
    assert.ok(
      game && typeof game === 'object' && !Array.isArray(game),
      `${snapshotLabel} GAMES[${index}] must be an object.`,
    );
    assert.equal(
      typeof game.id,
      'string',
      `${snapshotLabel} GAMES[${index}].id must be a string.`,
    );
    assert.match(
      game.id,
      SLUG_PATTERN,
      `${snapshotLabel} GAMES[${index}].id must be a lowercase URL-safe slug.`,
    );
    assert.equal(
      game.url,
      `${game.id}/`,
      `${snapshotLabel} game "${game.id}" must use the exact URL "${game.id}/".`,
    );
    assert.equal(
      typeof game.version,
      'string',
      `${snapshotLabel} game "${game.id}" must have a string version.`,
    );
    assert.match(
      game.version,
      SEMANTIC_VERSION_PATTERN,
      `${snapshotLabel} game "${game.id}" must use an x.y.z semantic version.`,
    );
    return game.id;
  });

  const duplicateIds = registryIds.filter((id, index) => registryIds.indexOf(id) !== index);
  assert.deepEqual(
    [...new Set(duplicateIds)].sort(),
    [],
    `${snapshotLabel} game IDs must be unique; duplicates: ${duplicateIds.join(', ') || 'none'}.`,
  );

  const manifestIds = Object.keys(versionManifest).sort();
  assert.deepEqual(
    [...registryIds].sort(),
    manifestIds,
    `${snapshotLabel} games.js IDs must exactly equal its version.json keys.`,
  );

  for (const game of games) {
    assert.equal(
      typeof versionManifest[game.id],
      'string',
      `${snapshotLabel} version.json["${game.id}"] must be a string.`,
    );
    assert.match(
      versionManifest[game.id],
      SEMANTIC_VERSION_PATTERN,
      `${snapshotLabel} version.json["${game.id}"] must use an x.y.z semantic version.`,
    );
    assert.equal(
      game.version,
      versionManifest[game.id],
      `${snapshotLabel} has a version mismatch for "${game.id}" between games.js and version.json.`,
    );
  }

  return registryIds;
}

function assertReleaseBasePreserved({
  baselineGames,
  baselineVersionManifest,
  currentGames,
  currentVersionManifest,
  targetId,
  baselineLabel,
}) {
  const baselineIds = assertRegistryManifestConsistency(
    baselineGames,
    baselineVersionManifest,
    baselineLabel,
  );
  assertRegistryManifestConsistency(
    currentGames,
    currentVersionManifest,
    'current checkout',
  );
  assert.equal(
    typeof targetId,
    'string',
    'REGISTRY_RELEASE_TARGET must be a string game ID.',
  );
  assert.match(
    targetId,
    SLUG_PATTERN,
    'REGISTRY_RELEASE_TARGET must be a lowercase URL-safe slug.',
  );

  const currentById = new Map(currentGames.map((game) => [game.id, game]));
  const violations = [];

  if (!currentById.has(targetId)) {
    violations.push(`release target "${targetId}" is missing from the current checkout`);
  }

  for (const baselineId of baselineIds) {
    const baselineGame = baselineGames.find((game) => game.id === baselineId);
    const currentGame = currentById.get(baselineId);
    if (!currentGame) {
      violations.push(
        `baseline game "${baselineId}" from ${baselineLabel} is missing from the current checkout`,
      );
      continue;
    }
    if (baselineId === targetId) continue;

    if (!isDeepStrictEqual(currentGame, baselineGame)) {
      violations.push(
        `non-target game "${baselineId}" changed its complete registry descriptor from ${baselineLabel}`,
      );
    }
    if (currentVersionManifest[baselineId] !== baselineVersionManifest[baselineId]) {
      violations.push(
        `non-target game "${baselineId}" changed its manifest version from `
        + `${JSON.stringify(baselineVersionManifest[baselineId])} to `
        + `${JSON.stringify(currentVersionManifest[baselineId])}`,
      );
    }
  }

  if (violations.length > 0) {
    assert.fail(`Release-base preservation failed:\n- ${violations.join('\n- ')}`);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('registered games have valid unique entries and exact manifest versions', async () => {
  const [games, versionManifest] = await Promise.all([
    loadGames(),
    loadVersionManifest(),
  ]);

  assertRegistryManifestConsistency(games, versionManifest, 'current checkout');

  for (const game of games) {
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

test('release-base comparison rejects deletion, non-target drift, and stale checkouts', () => {
  const baselineGames = [
    {
      id: 'football',
      title: 'Football Math',
      url: 'football/',
      version: '1.25.0',
    },
    {
      id: 'place-value-practice',
      title: 'Place by Place',
      subtitle: 'Read hundreds, tens, and ones',
      url: 'place-value-practice/',
      version: '1.1.0',
    },
  ];
  const baselineVersionManifest = {
    football: '1.25.0',
    'place-value-practice': '1.1.0',
  };
  const comparisonInput = {
    baselineGames,
    baselineVersionManifest,
    targetId: 'football',
    baselineLabel: 'synthetic exact release base',
  };

  assert.throws(
    () => assertReleaseBasePreserved({
      ...comparisonInput,
      currentGames: [cloneJson(baselineGames[0])],
      currentVersionManifest: { football: '1.25.0' },
    }),
    /baseline game "place-value-practice".*is missing from the current checkout/,
    'Coordinated registry and manifest removal must not evade baseline preservation.',
  );

  const driftedGames = cloneJson(baselineGames);
  const driftedPlaceByPlace = driftedGames.find((game) => game.id === 'place-value-practice');
  driftedPlaceByPlace.subtitle = 'Changed non-target description';
  driftedPlaceByPlace.version = '1.2.0';
  const driftedVersionManifest = cloneJson(baselineVersionManifest);
  driftedVersionManifest['place-value-practice'] = '1.2.0';
  assert.throws(
    () => assertReleaseBasePreserved({
      ...comparisonInput,
      currentGames: driftedGames,
      currentVersionManifest: driftedVersionManifest,
    }),
    (error) => {
      assert.match(error.message, /changed its complete registry descriptor/);
      assert.match(error.message, /changed its manifest version from "1\.1\.0" to "1\.2\.0"/);
      return true;
    },
    'Synchronized non-target descriptor and manifest drift must not evade preservation.',
  );

  const newerBaselineGames = [
    ...cloneJson(baselineGames),
    {
      id: 'newly-baselined-game',
      title: 'Newly Baselined Game',
      url: 'newly-baselined-game/',
      version: '1.0.0',
    },
  ];
  assert.throws(
    () => assertReleaseBasePreserved({
      baselineGames: newerBaselineGames,
      baselineVersionManifest: {
        ...cloneJson(baselineVersionManifest),
        'newly-baselined-game': '1.0.0',
      },
      currentGames: cloneJson(baselineGames),
      currentVersionManifest: cloneJson(baselineVersionManifest),
      targetId: 'football',
      baselineLabel: 'newer synthetic exact release base',
    }),
    /baseline game "newly-baselined-game".*is missing from the current checkout/,
    'A stale checkout must fail when the exact base contains a game it lacks.',
  );

  const allowedGames = cloneJson(baselineGames);
  const allowedFootball = allowedGames.find((game) => game.id === 'football');
  allowedFootball.title = 'Football Math Next';
  allowedFootball.version = '1.26.0';
  allowedGames.push({
    id: 'genuinely-new-game',
    title: 'Genuinely New Game',
    url: 'genuinely-new-game/',
    version: '1.0.0',
  });
  assert.doesNotThrow(
    () => assertReleaseBasePreserved({
      ...comparisonInput,
      currentGames: allowedGames,
      currentVersionManifest: {
        ...cloneJson(baselineVersionManifest),
        football: '1.26.0',
        'genuinely-new-game': '1.0.0',
      },
    }),
    'Only the target descriptor/version and genuinely new games should be permitted.',
  );
});

test('current checkout preserves the exact declared release base', async () => {
  const [currentGames, currentVersionManifest] = await Promise.all([
    loadGames(),
    loadVersionManifest(),
  ]);
  const releaseBase = loadDeclaredReleaseBaseSnapshot();

  assertReleaseBasePreserved({
    baselineGames: releaseBase.games,
    baselineVersionManifest: releaseBase.versionManifest,
    currentGames,
    currentVersionManifest,
    targetId: releaseBase.targetId,
    baselineLabel: `REGISTRY_RELEASE_BASE "${releaseBase.declaredBase}" (${releaseBase.exactCommit})`,
  });
});
