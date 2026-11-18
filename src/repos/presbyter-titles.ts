import { presbyterTitles } from '../db/schema.js';
import type { OrmClient } from '../db/sql.js';

/**
 * One row of `presbyter_titles`: the word the register uses for an office, the
 * gender it is restricted to (or null), and whether it is still offered. A
 * retired title keeps rendering on its holder, so only the picker filters on
 * `active` (O-6, MR-12).
 */
export interface PresbyterTitleOptionDto {
  code: string;
  label: string;
  genderRestriction: 'male' | 'female' | null;
  active: boolean;
}

const columns = {
  code: presbyterTitles.code,
  label: presbyterTitles.label,
  genderRestriction: presbyterTitles.genderRestriction,
  active: presbyterTitles.active,
};

/** The read-only reference list behind `GET /v1/presbyter-titles`. */
export class PresbyterTitleRepository {
  constructor(private readonly db: OrmClient) {}

  /** Every active title, in the picker's own order (by label). */
  async listActive(): Promise<PresbyterTitleOptionDto[]> {
    const rows = await this.db.orm
      .select(columns)
      .from(presbyterTitles)
      .orderBy(presbyterTitles.label);
    return rows
      .filter((row) => row.active)
      .map((row) => ({
        code: row.code,
        label: row.label,
        genderRestriction:
          row.genderRestriction === 'male' || row.genderRestriction === 'female'
            ? row.genderRestriction
            : null,
        active: row.active,
      }));
  }
}
