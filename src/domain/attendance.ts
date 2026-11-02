export interface AttendanceCounts {
  attended: number;
  expected: number;
  remaining: number;
  status: 'ongoing' | 'completed' | 'in_progress';
}

/**
 * "2 of 5" is only trustworthy if both numbers come from the same window.
 * `occurrences` are the dates the series actually met inside that window;
 * `attendedDates` are the member's rows inside the same window.
 */
export function summariseAttendance(input: {
  occurrences: string[];
  attendedDates: string[];
  endsOn: string | null;
  today: string;
}): AttendanceCounts {
  const attendedSet = new Set(input.attendedDates);
  const attended = input.occurrences.filter((date) => attendedSet.has(date)).length;
  const expected = input.occurrences.length;

  const status = input.endsOn
    ? input.today > input.endsOn
      ? 'completed'
      : 'in_progress'
    : 'ongoing';

  return {
    attended,
    expected,
    remaining: Math.max(expected - attended, 0),
    status,
  };
}
