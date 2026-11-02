import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Member } from '../../src/domain/member.js';
import { LocalFileMemberStore } from '../../src/store/local-file-store.js';
import { StoreConflictError, StoreNotFoundError } from '../../src/store/member-store.js';

function buildMember(memberNo: string, firstName = 'Ama'): Member {
  return Member.create({ memberNo, firstName, lastName: 'Mensah' });
}

describe('LocalFileMemberStore', () => {
  let root: string;
  let store: LocalFileMemberStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'member-store-'));
    store = new LocalFileMemberStore(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns null for an unknown member', async () => {
    await expect(store.get('M-404')).resolves.toBeNull();
  });

  it('inserts and reads a member with a stable ETag', async () => {
    const member = buildMember('M-1');
    const inserted = await store.insert(member);
    const loaded = await store.get('M-1');

    expect(inserted.etag).toMatch(/^[a-f0-9]{64}$/);
    expect(loaded?.member.toJSON()).toEqual(member.toJSON());
    expect(loaded?.etag).toBe(inserted.etag);
  });

  it('rejects a duplicate insert', async () => {
    await store.insert(buildMember('M-1'));
    await expect(store.insert(buildMember('M-1', 'Other'))).rejects.toThrow(StoreConflictError);
  });

  it('replaces only when the ETag matches', async () => {
    const inserted = await store.insert(buildMember('M-1'));

    await expect(store.replace(buildMember('M-1', 'Nina'), 'stale')).rejects.toThrow(
      StoreConflictError,
    );

    const replaced = await store.replace(buildMember('M-1', 'Nina'), inserted.etag);
    expect(replaced.etag).not.toBe(inserted.etag);
    await expect(store.get('M-1')).resolves.toMatchObject({
      member: expect.objectContaining({ firstName: 'Nina' }),
    });
  });

  it('throws when replacing a member that does not exist', async () => {
    await expect(store.replace(buildMember('M-404'))).rejects.toThrow(StoreNotFoundError);
  });

  it('deletes members idempotently', async () => {
    await store.insert(buildMember('M-1'));

    await expect(store.delete('M-1')).resolves.toBe(true);
    await expect(store.delete('M-1')).resolves.toBe(false);
  });

  it('pages members by member number and filters with q', async () => {
    await store.insert(buildMember('M-1', 'Ama'));
    await store.insert(buildMember('M-2', 'Nina'));
    await store.insert(buildMember('M-3', 'Kofi'));

    const first = await store.list({ limit: 2 });
    expect(first.items.map((item) => item.member.memberNo)).toEqual(['M-1', 'M-2']);
    expect(first.cursor).toBe('M-2');

    const second = await store.list({ limit: 2, cursor: first.cursor });
    expect(second.items.map((item) => item.member.memberNo)).toEqual(['M-3']);
    expect(second.cursor).toBeUndefined();

    const filtered = await store.list({ q: 'kofi' });
    expect(filtered.items.map((item) => item.member.memberNo)).toEqual(['M-3']);
  });
});
