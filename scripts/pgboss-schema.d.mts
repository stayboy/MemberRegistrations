export const VENDORED_PATH: string;

export interface VendoredSchema {
  packageVersion: string;
  schemaVersion: number;
  sql: string;
}

export function readPlans(): string;
export function extractSql(raw: string): string;
export function renderModule(
  sql: string,
  versions: { packageVersion: string; schemaVersion: number },
): string;
export function buildVendored(): VendoredSchema;
