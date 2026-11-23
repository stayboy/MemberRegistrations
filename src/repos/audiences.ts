import type { Db, Row } from '../db/sql.js';
import { renderAudienceSummary } from '../domain/audiences.js';
import type { Audience, AudienceRule } from '../schemas/audiences.js';

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

/** Reference-data reads only in this slice; create/edit land with the write API. */
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
}
