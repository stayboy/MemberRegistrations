export interface RecordMockInput {
  set: string;
  state: string;
  capture: (file: string) => Promise<void>;
  note: string;
  root?: string;
}

export interface RecordMockResult {
  changed: boolean;
  sha256: string;
  version: number | null;
}

export function recordMock(input: RecordMockInput): Promise<RecordMockResult>;
