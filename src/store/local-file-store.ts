import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
 * Development/test adapter: one JSON document per member under a directory.
 * Never used in production — Vercel Functions have an ephemeral filesystem.
 */
export class LocalFileMemberStore implements MemberStore {
  constructor(private readonly root: string) {}

  private filePath(memberNo: string): string {
    return path.join(this.root, `${memberNo}.json`);
  }

  private etag(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  async get(memberNo: string): Promise<StoredMember | null> {
    try {
      const content = await readFile(this.filePath(memberNo), 'utf8');
      return { member: Member.fromSnapshot(JSON.parse(content)), etag: this.etag(content) };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async list(options: ListOptions = {}): Promise<ListResult> {
    const limit = clampLimit(options.limit);
    await mkdir(this.root, { recursive: true });

    const files = (await readdir(this.root)).filter((file) => file.endsWith('.json')).sort();

    const all: StoredMember[] = [];
    for (const file of files) {
      const memberNo = file.slice(0, -'.json'.length);
      const stored = await this.get(memberNo);
      if (!stored) continue;
      if (options.q && !matchesQuery(stored.member, options.q)) continue;
      all.push(stored);
    }

    const remaining = options.cursor
      ? all.filter((item) => item.member.memberNo > options.cursor!)
      : all;
    const items = remaining.slice(0, limit);
    const last = items.at(-1);

    return {
      items,
      cursor: remaining.length > limit && last ? last.member.memberNo : undefined,
    };
  }

  async insert(member: Member): Promise<StoredMember> {
    await mkdir(this.root, { recursive: true });
    const content = JSON.stringify(member.toJSON(), null, 2);

    try {
      await writeFile(this.filePath(member.memberNo), content, { flag: 'wx' });
    } catch (error) {
      if (isAlreadyExists(error)) {
        throw new StoreConflictError(`Member ${member.memberNo} already exists`);
      }
      throw error;
    }

    return { member, etag: this.etag(content) };
  }

  async replace(member: Member, ifMatch?: string): Promise<StoredMember> {
    const current = await this.get(member.memberNo);
    if (!current) throw new StoreNotFoundError(`Member ${member.memberNo} was not found`);
    if (ifMatch && ifMatch !== current.etag) {
      throw new StoreConflictError(`Member ${member.memberNo} was modified by another request`);
    }

    const content = JSON.stringify(member.toJSON(), null, 2);
    await writeFile(this.filePath(member.memberNo), content);
    return { member, etag: this.etag(content) };
  }

  async delete(memberNo: string): Promise<boolean> {
    try {
      await unlink(this.filePath(memberNo));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }
}

function clampLimit(limit?: number): number {
  const value = limit ?? 50;
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST';
}
