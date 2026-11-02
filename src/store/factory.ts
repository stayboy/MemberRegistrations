import type { Env } from '../config/env.js';
import { BlobMemberStore } from './blob-store.js';
import { LocalFileMemberStore } from './local-file-store.js';
import type { MemberStore } from './member-store.js';

export function createMemberStore(env: Env): MemberStore {
  return env.STORE_DRIVER === 'blob'
    ? new BlobMemberStore()
    : new LocalFileMemberStore(env.MEMBER_STORE_ROOT);
}
