import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordMock } from '../../scripts/mock/record.mjs';

/** A temporary repo root with one mock set, so the recorder never touches `mockups/`. */
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'mock-record-'));
  const dir = join(root, 'mockups', 'fixture');
  mkdirSync(dir, { recursive: true });
  return { root, dir };
}

const paint = (bytes: string) => async (file: string) => {
  writeFileSync(file, Buffer.from(bytes));
};

const historyOf = (dir: string) => JSON.parse(readFileSync(join(dir, 'history.json'), 'utf8'));

describe('recordMock: one live image per state', () => {
  it('records a first capture as version 1 and names the live file', async () => {
    const { root, dir } = workspace();
    const result = await recordMock({
      root,
      set: 'fixture',
      state: 'live',
      note: 'first capture of the live state',
      capture: paint('one'),
    });

    expect(result.changed).toBe(true);
    expect(result.version).toBe(1);
    const history = historyOf(dir);
    expect(history.states.live.live).toBe('mockups/fixture/live.png');
    expect(history.states.live.versions).toHaveLength(1);
    expect(history.states.live.versions[0].change).toBe('first capture of the live state');
  });

  it('adds no version when the bytes did not move', async () => {
    const { root, dir } = workspace();
    const input = { root, set: 'fixture', state: 'live', note: 'unchanged re-capture' };
    await recordMock({ ...input, capture: paint('same') });
    const second = await recordMock({ ...input, capture: paint('same') });

    expect(second.changed).toBe(false);
    expect(historyOf(dir).states.live.versions).toHaveLength(1);
  });

  it('names a live image that history never saw, so prune cannot orphan it', async () => {
    const { root, dir } = workspace();
    // The image exists on disk but history is empty: the first sweep over a set looks like this.
    writeFileSync(join(dir, 'live.png'), Buffer.from('already here'));

    const result = await recordMock({
      root,
      set: 'fixture',
      state: 'live',
      note: 'unchanged capture of an image history did not know',
      capture: paint('already here'),
    });

    expect(result.changed).toBe(false);
    const history = historyOf(dir);
    expect(history.states.live.versions).toHaveLength(1);
    expect(history.states.live.versions[0].sha256).toHaveLength(64);
  });

  it('archives the image it replaces and marks that entry archived', async () => {
    const { root, dir } = workspace();
    await recordMock({
      root,
      set: 'fixture',
      state: 'live',
      note: 'first capture',
      capture: paint('v1'),
    });
    await recordMock({
      root,
      set: 'fixture',
      state: 'live',
      note: 'second capture',
      capture: paint('v2'),
    });

    const history = historyOf(dir);
    expect(history.states.live.versions).toHaveLength(2);
    expect(history.states.live.versions[0].archived).toBe('mockups/_archive/fixture/live-v1.png');
    expect(history.states.live.versions[1].archived).toBeUndefined();
  });

  it('refuses a capture with no change note', async () => {
    const { root } = workspace();
    await expect(
      recordMock({ root, set: 'fixture', state: 'live', note: '  ', capture: paint('x') }),
    ).rejects.toThrow('a change note is required');
  });
});
