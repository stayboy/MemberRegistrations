import { ConflictError, NotFoundError, ValidationError } from '../errors/domain-errors.js';
import type { Db } from '../db/sql.js';

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

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505';
}

export class MinistryRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<MinistryDto[]> {
    const rows = await this.db.query<{
      code: string;
      name: string;
      description: string | null;
      active: boolean;
    }>('select code, name, description, active from ministries order by code');
    return rows;
  }

  async get(code: string): Promise<MinistryDto | null> {
    const [row] = await this.db.query<{
      code: string;
      name: string;
      description: string | null;
      active: boolean;
    }>('select code, name, description, active from ministries where lower(code) = lower($1)', [
      code,
    ]);
    return row ?? null;
  }

  async create(input: MinistryInput): Promise<MinistryDto> {
    const code = assertCode(input.code);
    try {
      const [row] = await this.db.query<{
        code: string;
        name: string;
        description: string | null;
        active: boolean;
      }>(
        `insert into ministries (code, name, description) values ($1,$2,$3)
         returning code, name, description, active`,
        [code, input.name.trim(), input.description ?? null],
      );
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`Ministry ${code} already exists`);
      throw error;
    }
  }

  async update(
    code: string,
    input: { name?: string; description?: string | null; active?: boolean },
  ): Promise<MinistryDto> {
    const existing = await this.get(code);
    if (!existing) throw new NotFoundError(`Ministry ${code} was not found`);

    const [row] = await this.db.query<{
      code: string;
      name: string;
      description: string | null;
      active: boolean;
    }>(
      `update ministries set name = $2, description = $3, active = $4, updated_at = now()
       where code = $1 returning code, name, description, active`,
      [
        existing.code,
        input.name?.trim() || existing.name,
        input.description === undefined ? existing.description : input.description,
        input.active ?? existing.active,
      ],
    );
    return row!;
  }

  async remove(code: string): Promise<void> {
    const existing = await this.get(code);
    if (!existing) throw new NotFoundError(`Ministry ${code} was not found`);

    const [references] = await this.db.query<{ members: number; series: number }>(
      `select
         (select count(*)::int from member_ministries mm join ministries mi on mi.id = mm.ministry_id where mi.code = $1) as members,
         (select count(*)::int from event_series s join ministries mi on mi.id = s.ministry_id where mi.code = $1) as series`,
      [existing.code],
    );

    if ((references?.members ?? 0) > 0 || (references?.series ?? 0) > 0) {
      throw new ConflictError(
        `Ministry ${existing.code} is referenced by ${references?.members ?? 0} member(s) and ${references?.series ?? 0} series; deactivate it instead`,
      );
    }

    await this.db.query('delete from ministries where code = $1', [existing.code]);
  }
}
