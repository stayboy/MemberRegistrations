import { sql } from 'drizzle-orm';
import { ministries } from '../db/schema.js';
import type { OrmClient } from '../db/sql.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';

export interface MinistryDto {
  code: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface MinistryInput {
  code: string;
  name: string;
  description?: string | null;
}

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,15}$/;

function assertCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!CODE_PATTERN.test(normalized)) {
    throw new ValidationError(
      'code must be 2-16 characters: an uppercase letter followed by A-Z, 0-9 or _',
    );
  }
  return normalized;
}

const columns = {
  code: ministries.code,
  name: ministries.name,
  description: ministries.description,
  active: ministries.active,
};

export class MinistryRepository {
  constructor(private readonly db: OrmClient) {}

  async list(): Promise<MinistryDto[]> {
    return this.db.orm.select(columns).from(ministries).orderBy(ministries.code);
  }

  async get(code: string): Promise<MinistryDto | null> {
    const [row] = await this.db.orm
      .select(columns)
      .from(ministries)
      .where(sql`lower(${ministries.code}) = lower(${code})`)
      .limit(1);
    return row ?? null;
  }

  async create(input: MinistryInput): Promise<MinistryDto> {
    const code = assertCode(input.code);
    try {
      const [row] = await this.db.orm
        .insert(ministries)
        .values({ code, name: input.name.trim(), description: input.description ?? null })
        .returning(columns);
      return row!;
    } catch (error) {
      if (sqlState(error) === '23505') throw new ConflictError(`Ministry ${code} already exists`);
      throw error;
    }
  }

  async update(
    code: string,
    input: { name?: string; description?: string | null; active?: boolean },
  ): Promise<MinistryDto> {
    const existing = await this.get(code);
    if (!existing) throw new NotFoundError(`Ministry ${code} was not found`);

    const [row] = await this.db.orm
      .update(ministries)
      .set({
        name: input.name?.trim() || existing.name,
        description: input.description === undefined ? existing.description : input.description,
        active: input.active ?? existing.active,
        updatedAt: sql`now()`,
      })
      .where(sql`lower(${ministries.code}) = lower(${existing.code})`)
      .returning(columns);
    return row!;
  }

  async remove(code: string): Promise<void> {
    const existing = await this.get(code);
    if (!existing) throw new NotFoundError(`Ministry ${code} was not found`);

    try {
      await this.db.orm
        .delete(ministries)
        .where(sql`lower(${ministries.code}) = lower(${existing.code})`);
    } catch (error) {
      // The database, not a pre-count, is the authority on references.
      if (sqlState(error) === '23503') {
        throw new ConflictError(
          `Ministry ${existing.code} is referenced by members or series; deactivate it instead`,
        );
      }
      throw error;
    }
  }
}
