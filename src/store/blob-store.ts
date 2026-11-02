import { del, get as getBlob, head, list as listBlobs, put } from '@vercel/blob';
import { Member } from '../domain/member.js';
import {
  type ListOptions,
  type ListResult,
  type MemberStore,
  type StoredMember,
  StoreConflictError,
  StoreNotFoundError,
  matchesQuery,
} from './member-store.js';

/**
 * Production adapter: private Vercel Blob store, one JSON document per member.
 * Reads bypass the CDN cache so a read-after-write in the same request cannot
 * observe a stale document. Writes use the current ETag (`ifMatch`) so two
 * concurrent updates cannot silently overwrite each other.
 */
export class BlobMemberStore implements MemberStore {
  constructor(private readonly prefix = 'members/') {}

  private pathname(memberNo: string): string {
    return `${this.prefix}${memberNo}.json`;
  }

  async get(memberNo: string): Promise<StoredMember | null> {
    try {
      const result = await getBlob(this.pathname(memberNo), {
        access: 'private',
        useCache: false,
      });
      if (result === null || result.statusCode !== 200) return null;

      const content = await new Response(result.stream).text();
      return { member: Member.fromSnapshot(JSON.parse(content)), etag: result.blob.etag };
    } catch (error) {
      if (isBlobNotFound(error)) return null;
      throw error;
    }
  }

  async list(options: ListOptions = {}): Promise<ListResult> {
    const limit = clampLimit(options.limit);
    const collected: StoredMember[] = [];
    let cursor = options.cursor;

    for (;;) {
      const page = await listBlobs({
        prefix: this.prefix,
        cursor,
        limit: Math.min(Math.max(limit * 2, 100), 1000),
      });

      for (const blob of page.blobs) {
        const memberNo = blob.pathname.slice(this.prefix.length, -'.json'.length);
        const stored = await this.get(memberNo);
        if (!stored) continue;
        if (options.q && !matchesQuery(stored.member, options.q)) continue;
        collected.push(stored);
        if (collected.length >= limit) break;
      }

      if (collected.length >= limit) {
        return {
          items: collected,
          cursor: page.hasMore && page.cursor ? page.cursor : undefined,
        };
      }

      if (!page.hasMore || !page.cursor) return { items: collected };
      cursor = page.cursor;
    }
  }

  async insert(member: Member): Promise<StoredMember> {
    if (await this.exists(member.memberNo)) {
      throw new StoreConflictError(`Member ${member.memberNo} already exists`);
    }

    const content = JSON.stringify(member.toJSON(), null, 2);
    try {
      await put(this.pathname(member.memberNo), content, {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
      });
    } catch (error) {
      if (isConflict(error)) {
        throw new StoreConflictError(`Member ${member.memberNo} already exists`);
      }
      throw error;
    }

    const metadata = await head(this.pathname(member.memberNo));
    return { member, etag: metadata.etag };
  }

  async replace(member: Member, ifMatch?: string): Promise<StoredMember> {
    const current = await this.get(member.memberNo);
    if (!current) throw new StoreNotFoundError(`Member ${member.memberNo} was not found`);
    if (ifMatch && ifMatch !== current.etag) {
      throw new StoreConflictError(`Member ${member.memberNo} was modified by another request`);
    }

    const content = JSON.stringify(member.toJSON(), null, 2);
    try {
      await put(this.pathname(member.memberNo), content, {
        access: 'private',
        contentType: 'application/json',
        allowOverwrite: true,
        ifMatch: current.etag,
      });
    } catch (error) {
      if (isPreconditionFailed(error) || isConflict(error)) {
        throw new StoreConflictError(`Member ${member.memberNo} was modified by another request`);
      }
      throw error;
    }

    const metadata = await head(this.pathname(member.memberNo));
    return { member, etag: metadata.etag };
  }

  async delete(memberNo: string): Promise<boolean> {
    if (!(await this.exists(memberNo))) return false;
    await del(this.pathname(memberNo));
    return true;
  }

  private async exists(memberNo: string): Promise<boolean> {
    try {
      await head(this.pathname(memberNo));
      return true;
    } catch (error) {
      if (isBlobNotFound(error)) return false;
      throw error;
    }
  }
}

function clampLimit(limit?: number): number {
  const value = limit ?? 50;
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function isBlobNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === 'BlobNotFoundError';
}

function isPreconditionFailed(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'BlobPreconditionFailedError' ||
    (error as Error & { status?: number }).status === 412
  );
}

function isConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { status?: number }).status;
  return (
    status === 409 ||
    /already exists|blob.*exists/i.test(error.message) ||
    error.name === 'BlobPreconditionFailedError'
  );
}
