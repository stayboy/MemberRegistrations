// record - refresh a mock image in place and keep the version record.
//
// One live image per state, never a `-v2` sibling. The recorder captures to a temporary file, and:
//   - if the bytes match the live image, it deletes the temporary file and reports `unchanged`
//     (a capture nobody changed is not a new version);
//   - otherwise it archives the live image to `mockups/_archive/<set>/<state>-v<n>.png`, moves the new
//     capture over the live path, and appends `{ version, at, sha256, change }` to the set's
//     `history.json`.
//
// `mockups/` is git-ignored, so this module runs locally and the durable record is the signed catalogue
// entry plus the round doc. The change note is required: an entry that says nothing is not a record.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/**
 * Capture and record one mock state.
 *
 * @param {object} input
 * @param {string} input.set           mock set, e.g. `v2-imports`
 * @param {string} input.state         state name, matching `<state>.png`/`<state>.html`
 * @param {(file: string) => Promise<void>} input.capture writes the PNG to `file`
 * @param {string} input.note          what moved in this cut, recorded in `history.json`
 * @returns {Promise<{ changed: boolean, sha256: string, version: number | null }>}
 */
export async function recordMock({ set, state, capture, note }) {
  if (typeof note !== 'string' || note.trim().length < 10) {
    throw new Error(`recordMock: a change note is required for ${set}/${state}`);
  }

  const dir = join(repoRoot, 'mockups', set);
  const live = join(dir, `${state}.png`);
  const tmp = join(dir, `.${state}.tmp.png`);
  const archiveDir = join(repoRoot, 'mockups', '_archive', set);
  const historyPath = join(dir, 'history.json');

  const history = existsSync(historyPath)
    ? JSON.parse(readFileSync(historyPath, 'utf8'))
    : { set, states: {} };
  history.states ??= {};
  history.states[state] ??= { live: `mockups/${set}/${state}.png`, versions: [] };
  const versions = history.states[state].versions;

  await capture(tmp);

  const next = sha256(tmp);
  const current = existsSync(live) ? sha256(live) : null;
  if (next === current) {
    rmSync(tmp, { force: true });
    return { changed: false, sha256: next, version: null };
  }

  // Archive the image this capture replaces, and mark its entry so the record never implies a file
  // that is gone.
  if (current !== null) {
    mkdirSync(archiveDir, { recursive: true });
    const previous = versions.find((entry) => entry.sha256 === current);
    const previousVersion = previous ?? {
      version: versions.length + 1,
      sha256: current,
      change: 'unrecorded image found on disk',
    };
    const archivedName = `${state}-v${previousVersion.version}.png`;
    copyFileSync(live, join(archiveDir, archivedName));
    previousVersion.archived = `mockups/_archive/${set}/${archivedName}`;
    if (previous === undefined) versions.push({ ...previousVersion });
  }

  renameSync(tmp, live);
  const version = versions.length + 1;
  versions.push({
    version,
    at: new Date().toISOString().slice(0, 10),
    sha256: next,
    change: note.trim(),
  });
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);

  return { changed: true, sha256: next, version };
}
