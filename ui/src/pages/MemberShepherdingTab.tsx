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
import type { CallOutcome, MemberShepherding, StillInChurch } from '../api/members';
import { formatDateLong } from '../format/member';
import { errorMessage } from './member-detail-errors';
import { useMemberDetailStyles } from './member-detail-styles';

export interface MemberShepherdingTabProps {
  readonly summary: MemberShepherding | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
}

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  reached: 'Reached',
  no_answer: 'No answer',
  wrong_number: 'Wrong number',
};

const STILL_IN_CHURCH_LABELS: Record<StillInChurch, string> = {
  yes: 'Still in church',
  no: 'No longer in church',
  unknown: 'Unknown',
};

/**
 * Member-detail **Shepherding** tab (FR-66): the current shepherd, assignment
 * history, recent calls and current `stillInChurch` from
 * `GET /v1/members/:memberNo/shepherding`. Read-only here; logging calls is the
 * shepherding roster's job (ticket 16). MemberDetailPage owns the query.
 */
export function MemberShepherdingTab({
  summary,
  isPending,
  isError,
  error,
  onRetry,
}: MemberShepherdingTabProps) {
  const styles = useMemberDetailStyles();

  return (
    <section className={styles.section} aria-labelledby="member-shepherding-heading">
      <div className={styles.sectionHeader}>
        <h2 id="member-shepherding-heading" className={styles.sectionTitle}>
          Shepherding
        </h2>
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
                  {STILL_IN_CHURCH_LABELS[summary.stillInChurch]}
                </Badge>
              ) : null}
            </div>
            {summary.shepherd ? (
              <Text size={200}>
                <Link to={`/members/${encodeURIComponent(summary.shepherd.memberNo)}`}>
                  {summary.shepherd.name || summary.shepherd.memberNo}
                </Link>{' '}
                · {summary.shepherd.memberNo} · assigned{' '}
                {formatDateLong(summary.shepherd.assignedOn)}
              </Text>
            ) : (
              <Text size={200} className={styles.muted}>
                No current shepherd.
              </Text>
            )}
            <Text size={200}>
              {summary.calls.attempts} attempts · {summary.calls.conversations} conversations ·{' '}
              {summary.calls.lastCalledOn
                ? `last called ${formatDateLong(summary.calls.lastCalledOn)}`
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
                      {assignment.officerMemberNo} · assigned{' '}
                      {formatDateLong(assignment.assignedOn)}
                      {assignment.endedOn ? ` · ended ${formatDateLong(assignment.endedOn)}` : ''}
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
                      <Text weight="semibold">{formatDateLong(call.calledOn)}</Text>
                      <div className={styles.pills}>
                        <Badge appearance="outline" size="small">
                          {OUTCOME_LABELS[call.outcome]}
                        </Badge>
                        <Badge appearance="outline" color="informative" size="small">
                          {STILL_IN_CHURCH_LABELS[call.stillInChurch]}
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
