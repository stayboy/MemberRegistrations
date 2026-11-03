/**
 * The only database seam in the app. Repositories take a `Db` and write
 * parameterised SQL; production uses `pg`, tests use PGlite. Keeping the port
 * this small means both engines are exercised by the same code path.
 */
import type { Orm } from './orm.js';

export type Row = Record<string, unknown>;

/** The ORM handle a CRUD repository needs; a transaction client satisfies it. */
export interface OrmClient {
  readonly orm: Orm;
}

export interface DbClient extends OrmClient {
  query<T extends Row = Row>(text: string, params?: readonly unknown[]): Promise<T[]>;
  /** Multi-statement SQL, used only by migrations. */
  exec(text: string): Promise<void>;
}

export interface Db extends DbClient {
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
