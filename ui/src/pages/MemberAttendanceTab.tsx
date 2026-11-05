import { Badge, Text } from '@fluentui/react-components';
import type { MemberDetail } from '../api/members';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { useMemberDetailStyles } from './member-detail-styles';

/**
 * Member-detail **Attendance** tab (FR-30): the existing per-series counts and
 * entries. It stays read-only here; recording and removing rows belong to the
 * event surface (FR-31). MemberDetailPage owns the detail query.
 */
export function MemberAttendanceTab({ member }: { member: MemberDetail }) {
  const styles = useMemberDetailStyles();
  const { formatDate } = useDateTimeFormat();

  return (
    <section className={styles.section} aria-labelledby="member-attendance-heading">
      <div className={styles.sectionHeader}>
        <h2 id="member-attendance-heading" className={styles.sectionTitle}>
          Attendance
        </h2>
      </div>
      {member.attendance.length === 0 ? (
        <Text className={styles.muted}>No attendance recorded.</Text>
      ) : (
        <div className={styles.list}>
          {member.attendance.map((series) => (
            <article key={series.seriesId} className={styles.rowCard}>
              <div className={styles.rowHead}>
                <Text weight="semibold">{series.seriesName}</Text>
                <Badge appearance="outline" size="small">
                  {statusLabel(series.status)}
                </Badge>
              </div>
              <Text size={200}>
                {series.attended} attended / {series.expected} expected / {series.remaining}{' '}
                remaining
                {series.ministry ? ` · ${series.ministry}` : ''}
              </Text>
              {series.entries.length === 0 ? (
                <Text size={200} className={styles.muted}>
                  No attendance entries.
                </Text>
              ) : (
                <ul className={styles.entryList} aria-label={`${series.seriesName} entries`}>
                  {series.entries.map((entry) => (
                    <li key={entry.id}>
                      <span className={styles.entry}>
                        <Text size={200}>{formatDate(entry.date)}</Text>
                        <Text size={100} className={styles.muted}>
                          {entry.source}
                        </Text>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function statusLabel(status: string): string {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Ongoing';
}
