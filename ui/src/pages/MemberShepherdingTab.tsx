import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
} from '@fluentui/react-components';
import { Link } from 'react-router-dom';
import type { MemberShepherding } from '../api/members';
import { outcomeLabel, stillInChurchLabel } from '../format/shepherding';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { errorMessage } from './member-detail-errors';
import { useMemberDetailStyles } from './member-detail-styles';

export interface MemberShepherdingTabProps {
  readonly summary: MemberShepherding | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly isArchived: boolean;
  readonly onAssign: () => void;
  readonly onReassign: () => void;
  readonly onEnd: () => void;
}

/**
 * Member-detail **Shepherding** tab (FR-66): the current shepherd, assignment
 * history, recent calls and current `stillInChurch` from
 * `GET /v1/members/:memberNo/shepherding`. The call history is read-only because
 * calls are append-only; assignment actions are owned by MemberDetailPage.
 */
export function MemberShepherdingTab({
  summary,
  isPending,
  isError,
  error,
  onRetry,
  isArchived,
  onAssign,
  onReassign,
  onEnd,
}: MemberShepherdingTabProps) {
  const styles = useMemberDetailStyles();
  const { formatDate } = useDateTimeFormat();

  return (
    <section className={styles.section} aria-labelledby="member-shepherding-heading">
      <div className={styles.sectionHeader}>
        <h2 id="member-shepherding-heading" className={styles.sectionTitle}>
          Shepherding
        </h2>
        {isArchived ? (
          <Text size={200} className={styles.muted}>
            Archived members cannot be assigned a shepherd. Restore the member first.
          </Text>
        ) : summary && !isPending && !isError ? (
          summary.shepherd ? (
            <div className={styles.pills}>
              <Button size="small" appearance="secondary" onClick={onReassign}>
                Reassign
              </Button>
              <Button size="small" appearance="secondary" onClick={onEnd}>
                End assignment
              </Button>
            </div>
          ) : (
            <Button size="small" appearance="primary" onClick={onAssign}>
              Assign shepherd
            </Button>
          )
        ) : null}
      </div>

      {isPending ? (
        <Spinner size="small" label="Loading shepherding…" />
      ) : isError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Shepherding could not be loaded</MessageBarTitle>
            {errorMessage(error)}
            <Button size="small" appearance="transparent" onClick={onRetry}>
              Retry
            </Button>
          </MessageBarBody>
        </MessageBar>
      ) : !summary ? (
        <Text className={styles.muted}>No shepherding record is available.</Text>
      ) : (
        <div className={styles.list}>
          <div className={styles.rowCard}>
            <div className={styles.rowHead}>
              <Text weight="semibold">Current shepherd</Text>
              {summary.stillInChurch ? (
                <Badge
                  appearance="outline"
                  color={
                    summary.stillInChurch === 'yes'
                      ? 'success'
                      : summary.stillInChurch === 'no'
                        ? 'warning'
                        : 'subtle'
                  }
                  size="small"
                >
                  {stillInChurchLabel(summary.stillInChurch)}
                </Badge>
              ) : null}
            </div>
            {summary.shepherd ? (
              <Text size={200}>
                <Link to={`/members/${encodeURIComponent(summary.shepherd.memberNo)}`}>
                  {summary.shepherd.name || summary.shepherd.memberNo}
                </Link>{' '}
                · {summary.shepherd.memberNo} · assigned {formatDate(summary.shepherd.assignedOn)}
              </Text>
            ) : (
              <Text size={200} className={styles.muted}>
                No current shepherd.
              </Text>
            )}
            <Text size={200}>
              {summary.calls.attempts} attempts · {summary.calls.conversations} conversations ·{' '}
              {summary.calls.lastCalledOn
                ? `last called ${formatDate(summary.calls.lastCalledOn)}`
                : 'never called'}
            </Text>
            {summary.latestFeedback ? (
              <Text size={200}>Latest feedback: {summary.latestFeedback}</Text>
            ) : null}
            {summary.latestIssue ? (
              <Text size={200}>Latest issue: {summary.latestIssue}</Text>
            ) : null}
          </div>

          <div>
            <Text weight="semibold">Assignment history</Text>
            {summary.history.length === 0 ? (
              <Text size={200} className={styles.muted}>
                No assignments recorded.
              </Text>
            ) : (
              <div className={styles.list}>
                {summary.history.map((assignment) => (
                  <div key={assignment.assignmentId} className={styles.rowCard}>
                    <div className={styles.rowHead}>
                      <Text weight="semibold">
                        {assignment.officerName || assignment.officerMemberNo}
                      </Text>
                      <Badge
                        appearance="outline"
                        color={assignment.endedOn ? 'subtle' : 'success'}
                        size="small"
                      >
                        {assignment.endedOn ? 'Ended' : 'Active'}
                      </Badge>
                    </div>
                    <Text size={200} className={styles.muted}>
                      {assignment.officerMemberNo} · assigned {formatDate(assignment.assignedOn)}
                      {assignment.endedOn ? ` · ended ${formatDate(assignment.endedOn)}` : ''}
                    </Text>
                    {assignment.reason ? <Text size={200}>Reason: {assignment.reason}</Text> : null}
                    {assignment.endedReason ? (
                      <Text size={200}>Ended: {assignment.endedReason}</Text>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Text weight="semibold">Recent calls</Text>
            {summary.recentCalls.length === 0 ? (
              <Text size={200} className={styles.muted}>
                No calls recorded.
              </Text>
            ) : (
              <div className={styles.list}>
                {summary.recentCalls.map((call) => (
                  <div key={call.id} className={styles.rowCard}>
                    <div className={styles.rowHead}>
                      <Text weight="semibold">{formatDate(call.calledOn)}</Text>
                      <div className={styles.pills}>
                        <Badge appearance="outline" size="small">
                          {outcomeLabel(call.outcome)}
                        </Badge>
                        <Badge appearance="outline" color="informative" size="small">
                          {stillInChurchLabel(call.stillInChurch)}
                        </Badge>
                      </div>
                    </div>
                    <Text size={200} className={styles.muted}>
                      Officer {call.officerMemberNo}
                    </Text>
                    {call.feedback ? <Text size={200}>Feedback: {call.feedback}</Text> : null}
                    {call.issue ? <Text size={200}>Issue: {call.issue}</Text> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
