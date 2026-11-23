import type { Db, DbClient, Row } from '../db/sql.js';
import { renderAudienceSummary } from '../domain/audiences.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import type {
  Audience,
  AudienceRule,
  CreateAudienceInput,
  UpdateAudienceInput,
} from '../schemas/audiences.js';

interface AudienceRow extends Row {
  id: string;
  name: string;
  system: boolean;
  system_key: string | null;
  active: boolean;
  rule: unknown;
  created_at: Date | string;
  created_by: string | null;
  updated_at: Date | string;
  updated_by: string | null;
}

function isoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseRule(value: unknown): AudienceRule {
  if (typeof value === 'string') return JSON.parse(value) as AudienceRule;
  return value as AudienceRule;
}

function toAudience(row: AudienceRow): Audience {
  const rule = parseRule(row.rule);
  return {
    id: row.id,
    name: row.name,
    system: row.system,
    systemKey: row.system_key,
    active: row.active,
    rule,
    summary: renderAudienceSummary(row.name, rule),
    createdAt: isoTimestamp(row.created_at),
    createdBy: row.created_by,
    updatedAt: isoTimestamp(row.updated_at),
    updatedBy: row.updated_by,
  };
}

const COLUMNS = `
  id, name, system, system_key, active, rule,
  created_at, created_by, updated_at, updated_by`;

/**
 * A rule may name a ministry by code; an unknown code is a write error, not a
 * rule that simply matches nobody (A-6).
 */
async function assertMinistryCodes(db: DbClient, rule: AudienceRule): Promise<void> {
  for (const [index, clause] of rule.clauses.entries()) {
    if (clause.attribute !== 'ministry') continue;
    const [ministry] = await db.query<{ id: string }>(
      'select id from ministries where lower(code) = lower($1)',
      [clause.ministryCode],
    );
    if (!ministry) {
      throw new ValidationError(
        `rule.clauses.${index}.ministryCode: no ministry has code ${clause.ministryCode}`,
        'validation_error',
      );
    }
  }
}

/** Reference-data reads and the custom-audience writes (A-6); system rows are read-only. */
export class AudienceRepository {
  constructor(private readonly db: Db) {}

  async list(includeArchived = false): Promise<Audience[]> {
    const rows = await this.db.query<AudienceRow>(
      `select ${COLUMNS}
         from audiences
        where ($1::boolean or active)
        order by lower(name), id`,
      [includeArchived],
    );
    return rows.map(toAudience);
  }

  async get(id: string): Promise<Audience | null> {
    const [row] = await this.db.query<AudienceRow>(
      `select ${COLUMNS} from audiences where id = $1`,
      [id],
    );
    return row ? toAudience(row) : null;
  }

  /**
   * A custom audience, created active. The name is unique case-insensitively
   * across every row, archived ones included; a duplicate is `409
   * audience_name_in_use` with the field named.
   */
  async create(input: CreateAudienceInput, actor: string): Promise<Audience> {
    const name = input.name.trim();
    if (!name) throw new ValidationError('name: name is required', 'validation_error');
    await assertMinistryCodes(this.db, input.rule);

    try {
      const [row] = await this.db.query<AudienceRow>(
        `insert into audiences (name, system, system_key, active, rule, created_by, updated_by)
         values ($1, false, null, true, $2::jsonb, $3, $3)
         returning ${COLUMNS}`,
        [name, JSON.stringify(input.rule), actor],
      );
      return toAudience(row!);
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(
          `name: an audience named "${name}" already exists`,
          'audience_name_in_use',
        );
      }
      throw error;
    }
  }

  /**
   * Edits a custom audience. A system row refuses the write with `409
   * audience_system`; archiving is `{ active: false }` because there is no
   * delete.
   */
  async update(id: string, input: UpdateAudienceInput, actor: string): Promise<Audience> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError(`Audience ${id} was not found`);
    if (current.system) {
      throw new ConflictError('A system audience is read-only', 'audience_system');
    }
    if (input.rule) await assertMinistryCodes(this.db, input.rule);

    const name = input.name !== undefined ? input.name.trim() : current.name;
    if (!name) throw new ValidationError('name: name is required', 'validation_error');

    try {
      const [row] = await this.db.query<AudienceRow>(
        `update audiences
            set name = $2,
                rule = $3::jsonb,
                active = $4,
                updated_at = now(),
                updated_by = $5
          where id = $1
          returning ${COLUMNS}`,
        [
          id,
          name,
          JSON.stringify(input.rule ?? current.rule),
          input.active ?? current.active,
          actor,
        ],
      );
      return toAudience(row!);
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(
          `name: an audience named "${name}" already exists`,
          'audience_name_in_use',
        );
      }
      throw error;
    }
  }
}
