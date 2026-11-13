import {
  Badge,
  Button,
  Card,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Text,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { isUnauthorized } from '../../api/errors';
import { listEvents } from '../../api/events';
import { getMember } from '../../api/members';
import { useSession } from '../../auth/SessionProvider';
import { MemberPicker } from '../../components/MemberPicker';
import { PageFrame } from '../../components/PageFrame';
import { shiftUtcDate } from '../../format/date-window';
import { memberLabelFromName } from '../../format/member';
import { utcToday } from '../../format/member-form';
import {
  activitiesFromEvents,
  activitiesOn,
  activitiesThisWeek,
  activityCountLabel,
  activityPageSize,
  nextActivities,
  nextActivitiesLine,
  type Activity,
  type ActivityViewer,
} from '../../format/ussd';
import { useDateTimeFormat } from '../../shell/DateTimeProvider';
import { useUssdStyles } from './ussd-styles';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function tierLabel(activity: Activity): string {
  if (activity.priority === 0) return 'Ministry';
  if (activity.priority === 1) return 'Presbyter only';
  return 'General';
}

/**
 * USSD → Activities. The same eligibility and ordering as the handset: general
 * events, the selected member's active ministries, and presbyter-only events for
 * presbyters; date → priority tier → start time → event number, with the same
 * three-plus-More page (two at Nalo's 120-character cap), the zero-events-today
 * two-week prompt and the empty-week state. The API has no operator-identity
 * read, so the eligibility view is an explicit member choice; leaving it empty
 * is the anonymous general-events view.
 */
export function UssdActivitiesPage() {
  const styles = useUssdStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate, formatTime } = useDateTimeFormat();
  const token = session?.token ?? '';

  const [date, setDate] = useState(() => utcToday());
  const [provider, setProvider] = useState<'nalo' | 'hmac'>('hmac');
  const [memberNo, setMemberNo] = useState<string | null>(null);
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [visible, setVisible] = useState(() => activityPageSize('hmac'));

  const to = shiftUtcDate(date, 14) ?? date;
  const pageSize = activityPageSize(provider);

  const eventsQuery = useQuery({
    queryKey: ['ussd', baseUrl, 'activities', date],
    queryFn: ({ signal }) => listEvents(baseUrl, token, { from: date, to, limit: 100, signal }),
    enabled: Boolean(token),
  });

  const memberQuery = useQuery({
    queryKey: ['member', baseUrl, memberNo ?? ''],
    queryFn: ({ signal }) => getMember(baseUrl, token, memberNo!, signal),
    enabled: Boolean(token) && memberNo !== null,
  });

  useEffect(() => {
    if (isUnauthorized(eventsQuery.error) || isUnauthorized(memberQuery.error)) {
      void signOut();
    }
  }, [eventsQuery.error, memberQuery.error, signOut]);

  const viewer = useMemo<ActivityViewer | null>(() => {
    if (!memberQuery.data) return null;
    return {
      isPresbyter: memberQuery.data.isPresbyter,
      ministries: memberQuery.data.ministries.map((ministry) => ministry.code),
    };
  }, [memberQuery.data]);

  const activities = useMemo(
    () => activitiesFromEvents(eventsQuery.data ?? [], viewer),
    [eventsQuery.data, viewer],
  );

  const dayRows = activitiesOn(activities, date);
  const weekRows = activitiesThisWeek(activities, date);
  const next = nextActivities(activities, date);
  const shownDay = dayRows.slice(0, visible);
  const shownWeek = mode === 'week' ? weekRows.slice(0, visible) : [];

  function resetPaging(nextProvider: 'nalo' | 'hmac' = provider): void {
    setVisible(activityPageSize(nextProvider));
  }

  function changeDate(nextDate: string): void {
    if (!nextDate) return;
    setDate(nextDate);
    setMode('day');
    resetPaging();
  }

  const memberLabel = memberQuery.data
    ? memberLabelFromName(
        `${memberQuery.data.firstName} ${memberQuery.data.lastName}`.trim(),
        memberQuery.data.gender,
        memberQuery.data.age,
      )
    : 'General events only';

  const rows = mode === 'week' ? shownWeek : shownDay;
  const totalRows = mode === 'week' ? weekRows.length : dayRows.length;

  return (
    <PageFrame
      sectionId="ussd"
      title="USSD activities"
      submenu="Activities"
      description="The handset activity list with the same eligibility and ordering. A provider page is three events, or two at Nalo's 120-character cap."
      actions={[
        {
          id: 'refresh',
          label: 'Refresh',
          icon: <ArrowClockwiseRegular />,
          disabled: eventsQuery.isFetching,
          onSelect: () => {
            void eventsQuery.refetch();
          },
        },
      ]}
    >
      <div className={styles.page}>
        <Card className={styles.panel}>
          <div className={styles.panelBody}>
            <div className={styles.toolbar}>
              <Field label="Date" className={styles.field}>
                <Input type="date" value={date} onChange={(_, data) => changeDate(data.value)} />
              </Field>

              <Field
                label="Channel"
                hint="The channel page size: Nalo caps at 120 characters, so two rows."
                className={styles.field}
              >
                <Dropdown
                  aria-label="Channel"
                  value={
                    provider === 'nalo'
                      ? 'Nalo (120 characters)'
                      : 'HMAC reference (182 characters)'
                  }
                  selectedOptions={[provider]}
                  onOptionSelect={(_, data) => {
                    const nextProvider = data.optionValue === 'nalo' ? 'nalo' : 'hmac';
                    setProvider(nextProvider);
                    resetPaging(nextProvider);
                  }}
                >
                  <Option value="nalo" text="Nalo (120 characters)">
                    Nalo (120 characters)
                  </Option>
                  <Option value="hmac" text="HMAC reference (182 characters)">
                    HMAC reference (182 characters)
                  </Option>
                </Dropdown>
              </Field>

              <div className={styles.field}>
                <MemberPicker
                  value={memberNo}
                  onChange={(next) => {
                    setMemberNo(next);
                    resetPaging();
                  }}
                  label="Eligibility view"
                />
              </div>

              <Button
                appearance="secondary"
                disabled={memberNo === null}
                onClick={() => setMemberNo(null)}
              >
                General events
              </Button>
            </div>

            <Text size={200} className={styles.muted}>
              Viewing: {memberLabel}. General events, the member&apos;s active ministries, and
              presbyter-only events for presbyters — ordered date, priority tier, start time, event
              number.
            </Text>
          </div>
        </Card>

        {eventsQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              Activities could not be loaded. {errorMessage(eventsQuery.error)}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {memberQuery.isError ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              The eligibility view could not be loaded, so general events are shown.{' '}
              {errorMessage(memberQuery.error)}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {eventsQuery.isPending ? (
          <div className={styles.state}>
            <Spinner label="Loading activities…" />
          </div>
        ) : mode === 'week' ? (
          <section className={styles.panel} aria-label="This week's activities">
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>
                {weekRows.length === 0 ? '0 events this week' : 'This week'}
              </h2>
              <Button appearance="secondary" size="small" onClick={() => setMode('day')}>
                9 Back
              </Button>
            </div>

            {weekRows.length === 0 ? (
              <div className={styles.empty}>
                <Text size={200} className={styles.muted}>
                  No applicable events from {formatDate(date)} to{' '}
                  {formatDate(shiftUtcDate(date, 6) ?? date)}.
                </Text>
                <div>
                  <Button appearance="primary" size="small" onClick={() => setMode('day')}>
                    1 A date
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <ActivityRows rows={rows} formatDate={formatDate} formatTime={formatTime} />
                {weekRows.length > rows.length ? (
                  <div className={styles.panelBody}>
                    <Button
                      appearance="secondary"
                      onClick={() => setVisible((current) => current + pageSize)}
                    >
                      More ({weekRows.length - rows.length})
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : dayRows.length === 0 ? (
          <section className={styles.panel} aria-label="No activities today">
            <div className={styles.panelBody}>
              <h2 className={styles.panelTitle}>0 events today</h2>
              {next ? <Text>{nextActivitiesLine(next)}</Text> : <Text>No upcoming events</Text>}
              <div className={styles.badgeRow}>
                {next ? (
                  <Button appearance="primary" size="small" onClick={() => changeDate(next.date)}>
                    1 View
                  </Button>
                ) : null}
                <Button
                  appearance="secondary"
                  size="small"
                  onClick={() => {
                    setMode('week');
                    resetPaging();
                  }}
                >
                  2 This week
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className={styles.panel} aria-label="Today's activities">
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>
                {activityCountLabel(dayRows.length)} on {formatDate(date)}
              </h2>
              <Button
                appearance="secondary"
                size="small"
                onClick={() => {
                  setMode('week');
                  resetPaging();
                }}
              >
                2 This week
              </Button>
            </div>
            <ActivityRows rows={rows} formatDate={formatDate} formatTime={formatTime} />
            {dayRows.length > rows.length ? (
              <div className={styles.panelBody}>
                <Button
                  appearance="secondary"
                  onClick={() => setVisible((current) => current + pageSize)}
                >
                  More ({dayRows.length - rows.length})
                </Button>
              </div>
            ) : null}
            <div className={styles.panelBody}>
              <Text size={200} className={styles.muted}>
                Showing {rows.length} of {totalRows} · {pageSize} per provider page.
              </Text>
            </div>
          </section>
        )}
      </div>
    </PageFrame>
  );
}

function ActivityRows({
  rows,
  formatDate,
  formatTime,
}: {
  rows: readonly Activity[];
  formatDate: (value: string) => string;
  formatTime: (value: string) => string;
}) {
  const styles = useUssdStyles();
  return (
    <ul className={styles.numbers} aria-label="Activities">
      {rows.map((activity) => (
        <li key={`${activity.eventId}:${activity.sessionDate}`} className={styles.badgeRow}>
          <Badge appearance="tint" color="subtle" size="small">
            {activity.eventNo ?? 'No number'}
          </Badge>
          <Text>{activity.name}</Text>
          <Text size={200} className={styles.muted}>
            {formatDate(activity.sessionDate)} · {formatTime(activity.startTime)}
            {activity.ministryName ? ` · ${activity.ministryName}` : ''}
          </Text>
          <Badge
            appearance="tint"
            color={
              activity.priority === 0
                ? 'brand'
                : activity.priority === 1
                  ? 'warning'
                  : 'informative'
            }
            size="small"
          >
            {tierLabel(activity)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
