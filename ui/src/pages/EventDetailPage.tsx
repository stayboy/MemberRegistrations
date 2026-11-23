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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ComponentProps } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  getEventParent,
  type EventOccurrenceItem,
  type EventParentStatus,
  type EventVenueType,
} from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { DateWindowControl, useDateWindow } from '../components/DateWindowControl';
import { PageFrame } from '../components/PageFrame';
import { SessionHeadcount } from '../components/SessionHeadcount';
import { SessionImportPanel } from '../components/SessionImportPanel';
import { TermsDialog } from '../components/TermsDialog';
import { occurrenceFrom, type Occurrence } from '../features/attendance-import/AttendanceWorkspace';
import { captureState, endActionState } from '../format/capture';
import {
  eventStatusLabel,
  ministryLabel,
  offeringsLabel,
  sessionCaptureLine,
  sessionSourceLabel,
  sessionStatusLabel,
  venueLabel,
} from '../format/events';
import { exceptionKindLabel, exceptionNoteLabel, scheduleLabel } from '../format/series';

import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { EventAttendanceDialog } from './EventAttendanceDialog';
import { SeriesSummaryTiles } from './SeriesSummaryTiles';
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

function statusColor(status: EventParentStatus): BadgeColor {
  if (status === 'active') return 'success';
  if (status === 'archived') return 'subtle';
  return 'informative';
}

function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/**
 * Events → event detail (events FR-4/FR-5/FR-6, UI FR-42): the parent read with
 * its identity, the server-rendered audience summary, the recurrence's schedule
 * versions and exceptions, the window occurrence table with the derived status
 * and capture state, the window summary tiles and the read-only offerings.
 *
 * The roster figure is the API's transitional `expected` count, labelled
 * Roster and never merged with present or coloured here. The status and next
 * occurrence are the API's; the screen never classifies an event by comparing
 * dates (FR-3).
 */
export function EventDetailPage() {
  const styles = useEventStyles();
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate, formatTime, formatRange } = useDateTimeFormat();
  const token = session?.token ?? '';
  const [window, setWindow] = useDateWindow();
  const [selected, setSelected] = useState<EventOccurrenceItem | null>(null);
  const [importFor, setImportFor] = useState<Occurrence | null>(null);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [termsTarget, setTermsTarget] = useState<{
    readonly offeringId: string;
    readonly name: string;
  } | null>(null);

  const eventQuery = useQuery({
    queryKey: ['events', baseUrl, 'detail', id, window.from, window.to],
    queryFn: ({ signal }) =>
      getEventParent(baseUrl, token, id, {
        from: window.from,
        to: window.to,
        signal,
      }),
    enabled: Boolean(token) && id.length > 0 && window.from <= window.to,
  });

  useEffect(() => {
    if (isUnauthorized(eventQuery.error)) void signOut();
  }, [eventQuery.error, signOut]);

  const event = eventQuery.data;
  const occurrences = event?.occurrences ?? [];
  const schedules = [...(event?.recurrence?.schedules ?? [])].sort((left, right) =>
    right.effectiveFrom.localeCompare(left.effectiveFrom),
  );
  const exceptions = event?.recurrence?.exceptions ?? [];

  // FR-8a: a retired route forwards here with `import=<date>`. The date is a
  // calendar date matched to the occurrence the parent read returned for the
  // window; no derived occurrence is invented when nothing matches, so closing
  // the panel and dropping the parameter are the same act.
  const linkedDate = searchParams.get('import');
  const linkedOccurrence = linkedDate
    ? occurrences.find((candidate) => candidate.date === linkedDate)
    : undefined;
  const panelOccurrence: Occurrence | null =
    importFor ?? (event && linkedOccurrence ? occurrenceFrom(event, linkedOccurrence) : null);

  function clearImportParam(): void {
    if (!linkedDate) return;
    const next = new URLSearchParams(searchParams);
    next.delete('import');
    setSearchParams(next, { replace: true });
  }

  return (
    <PageFrame
      sectionId="events"
      title={event?.name ?? 'Event'}
      submenu={event?.name ?? 'Event detail'}
      description="Occurrences, attendance and offerings for one event, as the API derives them for the chosen window."
      controls={
        <Button
          icon={<ArrowLeftRegular />}
          appearance="secondary"
          onClick={() => navigate('/events')}
        >
          Back to events
        </Button>
      }
      actions={[
        {
          id: 'refresh',
          kind: 'utility' as const,
          label: 'Refresh',
          icon: <ArrowClockwiseRegular />,
          onSelect: () => {
            void eventQuery.refetch();
          },
          disabled: eventQuery.isFetching,
        },
      ]}
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
            <div className={styles.toolbar}>
              <DateWindowControl
                value={window}
                onChange={setWindow}
                label="Event window"
                hint="UTC dates · the API owns today and the 90-day next occurrence."
              />
            </div>

            <Card className={styles.meta}>
              <div className={styles.metaRows}>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Event number</Text>
                  <Text className={styles.metaValue}>{event.eventNo || 'No number yet'}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Audience</Text>
                  <Text className={styles.metaValue}>{event.audience.summary}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Ministry</Text>
                  <Text className={styles.metaValue}>{ministryLabel(event.ministry)}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Timezone</Text>
                  <Text className={styles.metaValue}>{event.timezone}</Text>
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
                    {event.endDate
                      ? formatRange(event.startDate, event.endDate)
                      : `${formatDate(event.startDate)} · ongoing`}
                  </Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Times</Text>
                  <Text className={styles.metaValue}>
                    {formatTime(event.startTime)}
                    {event.endTime ? `–${formatTime(event.endTime)}` : ''} · {event.timezone}
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

            <SeriesSummaryTiles
              summary={event.summary}
              occurrenceCount={occurrences.length}
              formatDate={formatDate}
              label="Event summary"
              expectedLabel="Roster"
            />

            <section className={styles.panel} aria-label="Recurrence">
              <div className={styles.sectionHeader}>
                <h2 className={styles.panelTitle}>Recurrence</h2>
                <Text size={200} className={styles.muted}>
                  {event.recurrence
                    ? `${schedules.length} schedule version${schedules.length === 1 ? '' : 's'} · ${exceptions.length} exception${exceptions.length === 1 ? '' : 's'}`
                    : 'Standalone event'}
                </Text>
              </div>
              {!event.recurrence ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No recurrence</Text>
                  <Text size={200} className={styles.muted}>
                    This event is standalone: its dated occurrences stand on their own, with no
                    schedule versions or exceptions.
                  </Text>
                </div>
              ) : (
                <>
                  <div className={styles.tableWrap}>
                    <Table className={styles.table} size="small" aria-label="Schedule versions">
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell>Effective from</TableHeaderCell>
                          <TableHeaderCell>Schedule</TableHeaderCell>
                          <TableHeaderCell>Ends on</TableHeaderCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schedules.map((version) => (
                          <TableRow key={version.effectiveFrom}>
                            <TableCell>{formatDate(version.effectiveFrom)}</TableCell>
                            <TableCell>{scheduleLabel(version.rrule)}</TableCell>
                            <TableCell>
                              {version.endsOn ? formatDate(version.endsOn) : 'No end date'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {exceptions.length > 0 ? (
                    <div className={styles.tableWrap}>
                      <Table className={styles.table} size="small" aria-label="Exceptions">
                        <TableHeader>
                          <TableRow>
                            <TableHeaderCell>Date</TableHeaderCell>
                            <TableHeaderCell>Kind</TableHeaderCell>
                            <TableHeaderCell>Note</TableHeaderCell>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {exceptions.map((exception) => (
                            <TableRow key={exception.date}>
                              <TableCell>{formatDate(exception.date)}</TableCell>
                              <TableCell>
                                <Badge
                                  appearance="tint"
                                  color={exception.kind === 'cancelled' ? 'danger' : 'informative'}
                                  size="small"
                                >
                                  {exceptionKindLabel(exception.kind)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {exception.note ? (
                                  exception.note
                                ) : (
                                  <Text size={200} className={styles.muted}>
                                    {exceptionNoteLabel(exception.kind, exception.note)}
                                  </Text>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </>
              )}
            </section>

            <section className={styles.panel} aria-label="Event occurrences">
              <div className={styles.sectionHeader}>
                <h2 className={styles.panelTitle}>Event occurrences</h2>
                <Text size={200} className={styles.muted}>
                  {occurrences.length} occurrence{occurrences.length === 1 ? '' : 's'} in this
                  window
                </Text>
              </div>
              {occurrences.length === 0 ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No occurrences in this window</Text>
                  <Text size={200} className={styles.muted}>
                    Widen the window; the API generates the dates and the screen never expands the
                    RRULE.
                  </Text>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <Table
                    className={styles.sessionTable}
                    size="small"
                    aria-label="Event occurrences"
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Date</TableHeaderCell>
                        <TableHeaderCell>Status</TableHeaderCell>
                        <TableHeaderCell>Capture</TableHeaderCell>
                        <TableHeaderCell>Headcount</TableHeaderCell>
                        <TableHeaderCell>Present / Roster</TableHeaderCell>
                        <TableHeaderCell>Imported rows</TableHeaderCell>
                        <TableHeaderCell>Source</TableHeaderCell>
                        <TableHeaderCell aria-label="Action" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {occurrences.map((occurrence) => (
                        <TableRow key={occurrence.id}>
                          <TableCell>{formatDate(occurrence.date)}</TableCell>
                          <TableCell className={styles.statusCell}>
                            <div className={styles.statusStack}>
                              <Badge
                                appearance="tint"
                                color={
                                  occurrence.status === 'held'
                                    ? 'success'
                                    : occurrence.status === 'cancelled'
                                      ? 'danger'
                                      : 'informative'
                                }
                                size="small"
                              >
                                {sessionStatusLabel(occurrence.status)}
                              </Badge>
                              {occurrence.status === 'cancelled' ? (
                                <Text size={200} className={styles.muted}>
                                  {occurrence.note
                                    ? `Reason: ${occurrence.note}`
                                    : 'No reason recorded'}
                                </Text>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Text size={200} className={styles.muted}>
                              {sessionCaptureLine(
                                {
                                  date: occurrence.date,
                                  startTime: occurrence.startTime,
                                  endTime: occurrence.endTime,
                                  timezone: event.timezone,
                                  status: occurrence.status,
                                  capture: occurrence.capture,
                                },
                                new Date(),
                              )}
                            </Text>
                          </TableCell>
                          <TableCell>
                            <SessionHeadcount
                              eventId={event.id}
                              sessionDate={occurrence.date}
                              disabled={
                                occurrence.status === 'cancelled' ||
                                Boolean(occurrence.capture?.ended)
                              }
                              onImport={
                                event.tracksMembers
                                  ? () => setImportFor(occurrenceFrom(event, occurrence))
                                  : undefined
                              }
                              endAction={
                                event.tracksMembers
                                  ? endActionState(
                                      captureState(
                                        {
                                          date: occurrence.date,
                                          startTime: occurrence.startTime,
                                          endTime: occurrence.endTime,
                                          timezone: event.timezone,
                                          status: occurrence.status,
                                          capture: occurrence.capture,
                                        },
                                        new Date(),
                                      ),
                                    )
                                  : 'hidden'
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <div className={styles.counts}>
                              <Text size={200}>{occurrence.present} present</Text>
                              <Text size={200}>Roster {occurrence.expected}</Text>
                            </div>
                          </TableCell>
                          <TableCell>{occurrence.importedRows}</TableCell>
                          <TableCell>{sessionSourceLabel(occurrence.source)}</TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              appearance="transparent"
                              aria-label={`View rows for ${formatDate(occurrence.date)}`}
                              onClick={() => setSelected(occurrence)}
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

            <section className={styles.panel} aria-label="Active offerings">
              <div className={styles.sectionHeader}>
                <h2 className={styles.panelTitle}>Active offerings</h2>
                <Text size={200} className={styles.muted}>
                  Every offering attached · current terms
                </Text>
              </div>
              {event.offerings.length === 0 ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No offerings attached</Text>
                  <Text size={200} className={styles.muted}>
                    Attach an offering to this event before recording giving.
                  </Text>
                </div>
              ) : (
                <>
                  <div className={styles.tableWrap}>
                    <Table className={styles.table} size="small" aria-label="Active offerings">
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell>Offering</TableHeaderCell>
                          <TableHeaderCell>Kind</TableHeaderCell>
                          <TableHeaderCell>Currency</TableHeaderCell>
                          <TableHeaderCell>Available until</TableHeaderCell>
                          <TableHeaderCell>Status</TableHeaderCell>
                          <TableHeaderCell>Terms</TableHeaderCell>
                          <TableHeaderCell aria-label="Action" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {event.offerings.map((offering) => (
                          <TableRow key={offering.offeringId}>
                            <TableCell>
                              <Text weight="semibold">{offering.name}</Text>
                            </TableCell>
                            <TableCell>{kindLabel(offering.terms.kind)}</TableCell>
                            <TableCell>{offering.terms.currency}</TableCell>
                            <TableCell>
                              {offering.availableUntil ? formatDate(offering.availableUntil) : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                appearance="tint"
                                color={offering.expired ? 'warning' : 'success'}
                                size="small"
                              >
                                {offering.expired ? 'Expired' : 'Active'}
                              </Badge>
                            </TableCell>
                            <TableCell>{`v${offering.terms.version}`}</TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                appearance="transparent"
                                aria-label={`View terms for ${offering.name}`}
                                onClick={() =>
                                  setTermsTarget({
                                    offeringId: offering.offeringId,
                                    name: offering.name,
                                  })
                                }
                              >
                                View terms
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className={styles.listFooter}>
                    <Text size={200} className={styles.muted}>
                      Read-only summary · the full offering detail is post-MVP.
                    </Text>
                  </div>
                </>
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

      <TermsDialog offering={termsTarget} onClose={() => setTermsTarget(null)} />

      {panelOccurrence ? (
        <SessionImportPanel
          open
          occurrence={panelOccurrence}
          onClose={() => {
            setImportFor(null);
            clearImportParam();
          }}
          onImported={() => {
            setImportFor(null);
            // FR-8/AC-7: a successful batch invalidates the events, series and imports queries, and the
            // member reads whose attendance lines it changed - the same set the retired page invalidated.
            for (const root of ['events', 'series', 'imports', 'member', 'members']) {
              void queryClient.invalidateQueries({ queryKey: [root, baseUrl] });
            }
            clearImportParam();
          }}
        />
      ) : null}
    </PageFrame>
  );
}
