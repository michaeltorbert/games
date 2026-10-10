// Execution coverage for diagnostic Playwright runs, checked by the canonical
// release validator (`validate` exported by scripts/run-football-release.mjs;
// importing it does not start that runner). Against a `--list` enumeration of
// the unchanged canonical selection, every enumerated case and project must run
// exactly once and pass first time, or skip with a reason already present in
// the canonical spec; no missing, duplicate, extra, retried, fixme or
// expected-fail cases. Keys keep the full describe ancestry. A generated copy
// is renamed to its canonical file first, so its keys and skip-reason source
// are the canonical ones. The run report is split per file because validate
// checks each case against its own file's partition.
import path from 'node:path';
import { validate } from '../run-football-release.mjs';

export function coverage(enumReport, report, { files, projects, generated = null }) {
  const rootDir = enumReport.config.rootDir;
  const relative = file => path.relative(rootDir, file);
  const from = generated && relative(generated.file);
  const to = generated && relative(generated.canonical);
  const rename = file => (generated && file === from ? to : file);
  const renameSuite = suite => ({
    ...suite,
    ...('file' in suite && { file: rename(suite.file) }),
    specs: (suite.specs ?? []).map(spec => ({ ...spec, file: rename(spec.file) })),
    suites: (suite.suites ?? []).map(renameSuite),
  });
  const suites = (report.suites ?? []).map(renameSuite);
  const wanted = files.map(relative);
  const parts = wanted.map(file => ({ file, report: { ...report, suites: suites.filter(s => s.file === file) } }));
  const result = validate(enumReport, parts, projects);
  // Cases from files outside the selection would otherwise be dropped unseen.
  result.issues.strayFiles = suites.map(s => s.file).filter(file => !wanted.includes(file));
  result.issues.rootDirDiffers = report.config?.rootDir === rootDir ? [] : [String(report.config?.rootDir)];
  result.ok = result.ok && result.issues.strayFiles.length === 0 && result.issues.rootDirDiffers.length === 0;
  return result;
}
