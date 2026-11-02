export const CALL_OUTCOMES = ['reached', 'no_answer', 'wrong_number'] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const STILL_IN_CHURCH = ['yes', 'no', 'unknown'] as const;
export type StillInChurch = (typeof STILL_IN_CHURCH)[number];

export interface CallReport {
  calledOn: string;
  createdAt: string;
  outcome: CallOutcome;
  stillInChurch: StillInChurch;
}

export interface CallSummary {
  attempts: number;
  conversations: number;
  lastCalledOn: string | null;
}

function isLater(left: CallReport, right: CallReport): boolean {
  if (left.calledOn !== right.calledOn) return left.calledOn > right.calledOn;
  return left.createdAt > right.createdAt;
}

/**
 * "Latest wins" means latest *known* wins. An unanswered attempt recorded as
 * `unknown` must not erase an earlier yes/no, or every no-answer call would
 * reset the member's status.
 */
export function latestKnownStatus(reports: CallReport[]): StillInChurch | null {
  let latest: CallReport | null = null;
  for (const report of reports) {
    if (report.stillInChurch === 'unknown') continue;
    if (!latest || isLater(report, latest)) latest = report;
  }
  return latest?.stillInChurch ?? null;
}

export function summariseCalls(reports: CallReport[]): CallSummary {
  let lastCalledOn: string | null = null;
  let conversations = 0;

  for (const report of reports) {
    if (report.outcome === 'reached') conversations += 1;
    if (!lastCalledOn || report.calledOn > lastCalledOn) lastCalledOn = report.calledOn;
  }

  return { attempts: reports.length, conversations, lastCalledOn };
}
