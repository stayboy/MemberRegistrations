import {
  Badge,
  Button,
  Card,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular, ArrowLeftRegular } from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ComponentProps } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  getEvent,
  type EventSessionItem,
  type EventStatus,
  type EventVenueType,
} from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';
import {
  eventStatusLabel,
  formatDateRange,
  formatPresentExpected,
  formatTimeRange,
  offeringsLabel,
  seriesLabel,
  sessionSourceLabel,
  sessionStatusLabel,
  venueLabel,
} from '../format/events';
import { formatDateLong } from '../format/member';
import { EventAttendanceDialog } from './EventAttendanceDialog';
import { useEventStyles } from './events-styles';

type BadgeColor = ComponentProps<typeof Badge>['color'];

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function venueColor(venueType: EventVenueType): BadgeColor {
  if (venueType === 'hybrid') return 'brand';
  if (venueType === 'virtual') return 'subtle';
  return 'informative';
}

function statusColor(status: EventStatus): BadgeColor {
  if (status === 'held') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'scheduled') return 'informative';
  return 'subtle';
}

/**
 * Events → event detail (events FR-4/FR-10/FR-15): the header, the metadata,
 * the attached-offering count and one row per dated session with its status,
 * source and API-supplied present/expected. Selecting a session opens the
 * read-only attendance dialog. The status is the API's derived value; the
 * screen never classifies an event by comparing dates (FR-3).
 */
export function EventDetailPage() {
  const styles = useEventStyles();
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const [selected, setSelected] = useState<EventSessionItem | null>(null);

  const eventQuery = useQuery({
    queryKey: ['events', baseUrl, 'detail', id],
    queryFn: ({ signal }) => getEvent(baseUrl, token, id, signal),
    enabled: Boolean(token) && id.length > 0,
  });

  useEffect(() => {
    if (isUnauthorized(eventQuery.error)) void signOut();
  }, [eventQuery.error, signOut]);

  const event = eventQuery.data?.event;
  const sessions = event?.sessions ?? [];

  return (
    <PageFrame
      sectionId="events"
      title={event?.name ?? 'Event'}
      submenu={event?.name ?? 'Event detail'}
      description="Sessions and per-date attendance. Select a session to review the rows recorded against it."
      actions={
        <>
          <Button
            icon={<ArrowLeftRegular />}
            appearance="secondary"
            onClick={() => navigate('/events')}
          >
            Back to events
          </Button>
          <Button
            icon={<ArrowClockwiseRegular />}
            onClick={() => {
              void eventQuery.refetch();
            }}
            disabled={eventQuery.isFetching}
          >
            Refresh
          </Button>
        </>
      }
    >
      <div className={styles.page}>
        {eventQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The event could not be loaded</MessageBarTitle>
              {errorMessage(eventQuery.error)}
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void eventQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {eventQuery.isPending ? (
          <div className={styles.state}>
            <Spinner label="Loading the event…" />
          </div>
        ) : eventQuery.isError || !event ? null : (
          <>
            <Card className={styles.meta}>
              <div className={styles.metaRows}>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Event number</Text>
                  <Text className={styles.metaValue}>{event.eventNo ?? 'No number yet'}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Series</Text>
                  <Text className={styles.metaValue}>{seriesLabel(event)}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Venue</Text>
                  <div className={styles.metaValue}>
                    <Badge appearance="tint" color={venueColor(event.venueType)} size="small">
                      {venueLabel(event.venueType)}
                    </Badge>
                    {event.venueName ? (
                      <Text size={200} className={styles.muted}>
                        {event.venueName}
                      </Text>
                    ) : null}
                  </div>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Status</Text>
                  <div className={styles.metaValue}>
                    <Badge appearance="tint" color={statusColor(event.status)} size="small">
                      {eventStatusLabel(event.status)}
                    </Badge>
                  </div>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Dates</Text>
                  <Text className={styles.metaValue}>
                    {formatDateRange(event.startDate, event.endDate)}
                  </Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Times</Text>
                  <Text className={styles.metaValue}>
                    {formatTimeRange(event.startTime, event.endTime)}
                  </Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Offerings</Text>
                  <Text className={styles.metaValue}>{offeringsLabel(event.offerings.length)}</Text>
                </div>
              </div>
              {event.description ? (
                <>
                  <Divider />
                  <Text className={styles.metaLabel}>Description</Text>
                  <p className={styles.description}>{event.description}</p>
                </>
              ) : null}
            </Card>

            <section className={styles.panel} aria-label="Event sessions">
              {sessions.length === 0 ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No sessions</Text>
                  <Text size={200} className={styles.muted}>
                    This event has no dated sessions yet.
                  </Text>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <Table className={styles.sessionTable} size="small" aria-label="Event sessions">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Date</TableHeaderCell>
                        <TableHeaderCell>Start</TableHeaderCell>
                        <TableHeaderCell>End</TableHeaderCell>
                        <TableHeaderCell>Status</TableHeaderCell>
                        <TableHeaderCell>Source</TableHeaderCell>
                        <TableHeaderCell>Present/expected</TableHeaderCell>
                        <TableHeaderCell>Attendance</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessions.map((item) => (
                        <TableRow key={item.date}>
                          <TableCell>{formatDateLong(item.date)}</TableCell>
                          <TableCell>{item.startTime}</TableCell>
                          <TableCell>{item.endTime ?? '—'}</TableCell>
                          <TableCell>
                            <Badge appearance="tint" color={statusColor(item.status)} size="small">
                              {sessionStatusLabel(item.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>{sessionSourceLabel(item.source)}</TableCell>
                          <TableCell>{formatPresentExpected(item)}</TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              appearance="transparent"
                              aria-label={`View attendance rows for ${formatDateLong(item.date)}`}
                              onClick={() => setSelected(item)}
                            >
                              View rows
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <EventAttendanceDialog
        open={selected !== null}
        eventId={event?.id ?? id}
        session={selected}
        onClose={() => setSelected(null)}
      />
    </PageFrame>
  );
}
