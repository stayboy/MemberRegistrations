export interface Ancestor {
  name: string;
  attrs: string;
  classes: string[];
}

export interface ShellCheckResult {
  failures: string[];
}

export function restylingClasses(css: string): Map<string, string>;
export function ancestorsAt(html: string, targetIndex: number): Ancestor[];
export function classesOf(attrs: string): string[];
export function checkShell(html: string, options?: { css?: string }): ShellCheckResult;
export function mockFiles(set: string): string[];

export const SWEEP_SETS: string[];
export const repoRoot: string;
export const MOCK_CSS: string;
