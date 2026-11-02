import type { Member } from '../domain/member.js';

export interface StoredMember {
  member: Member;
  etag: string;
}

export interface ListOptions {
  limit?: number;
  cursor?: string;
  q?: string;
}

export interface ListResult {
  items: StoredMember[];
  cursor?: string;
}

export class StoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreConflictError';
  }
}

export class StoreNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreNotFoundError';
  }
}

/**
 * Persistence port. Both adapters (local FS for dev/tests, Vercel Blob for
 * production) must satisfy the same contract; the contract test suite runs
 * against both.
 */
export interface MemberStore {
  get(memberNo: string): Promise<StoredMember | null>;
  list(options?: ListOptions): Promise<ListResult>;
  insert(member: Member): Promise<StoredMember>;
  replace(member: Member, ifMatch?: string): Promise<StoredMember>;
  delete(memberNo: string): Promise<boolean>;
}

export function matchesQuery(member: Member, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [member.memberNo, member.firstName, member.lastName, member.otherNames, member.alias]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}
