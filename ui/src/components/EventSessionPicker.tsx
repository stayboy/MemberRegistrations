import {
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { isUnauthorized } from '../api/errors';
import { listEvents, type EventItem, type EventSessionSummary } from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { DateWindowControl } from './DateWindowControl';
import { shiftUtcDate } from '../format/date-window';
import { utcToday } from '../format/member-form';
import { useDateTimeFormat } from '../shell/DateTimeProvider';

const useStyles = makeStyles({
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  fields: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  field: {
    minWidth: '260px',
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
});

export interface EventSessionSelection {
  readonly eventId: string;
  readonly sessionDate: string;
}

function sessionLabel(
  session: EventSessionSummary,
  formatDate: (value: string) => string,
  formatTime: (value: string) => string,
): string {
  return `${formatDate(session.date)} · ${formatTime(session.startTime)}`;
}

function eventLabel(event: EventItem, formatDate: (value: string) => string): string {
  const number = event.eventNo ? `${event.eventNo} · ` : '';
  return `${number}${event.name} (${formatDate(event.startDate)})`;
}

function selectableSessions(event: EventItem | undefined): EventSessionSummary[] {
  if (!event) return [];
  return event.sessions.filter((session) => session.status !== 'cancelled');
}

function defaultSession(event: EventItem): EventSessionSummary | undefined {
  const sessions = selectableSessions(event);
  const today = utcToday();
  return sessions.find((session) => session.date >= today) ?? sessions[sessions.length - 1];
}

/**
 * The one event-session picker shared by Codes, Clocking and Headcount. It owns
 * the `GET /v1/events` window and the two dropdowns; the page owns the selected
 * `{ eventId, sessionDate }` and decides what to read next. Cancelled and
 * archived events, and cancelled sessions, are never selectable.
 */
export function EventSessionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: EventSessionSelection | null;
  onChange: (selection: EventSessionSelection | null) => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate, formatTime } = useDateTimeFormat();
  const token = session?.token ?? '';

  const [range, setRange] = useState(() => {
    const today = utcToday();
    return {
      from: shiftUtcDate(today, -30) ?? today,
      to: shiftUtcDate(today, 60) ?? today,
    };
  });
  const [draftEventId, setDraftEventId] = useState<string | null>(value?.eventId ?? null);

  const eventsQuery = useQuery({
    queryKey: ['ussd', baseUrl, 'session-picker', range.from, range.to],
    queryFn: ({ signal }) => listEvents(baseUrl, token, { ...range, limit: 100, signal }),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (isUnauthorized(eventsQuery.error)) void signOut();
  }, [eventsQuery.error, signOut]);

  const events = useMemo(
    () =>
      (eventsQuery.data ?? []).filter(
        (event) => event.status !== 'cancelled' && event.status !== 'archived',
      ),
    [eventsQuery.data],
  );

  const selectedEvent = events.find((event) => event.id === (value?.eventId ?? draftEventId));
  const sessions = selectableSessions(selectedEvent);
  const selectedSession = sessions.find((sessionRow) => sessionRow.date === value?.sessionDate);

  function chooseEvent(eventId: string): void {
    const event = events.find((candidate) => candidate.id === eventId);
    setDraftEventId(eventId);
    const sessionRow = event ? defaultSession(event) : undefined;
    onChange(event && sessionRow ? { eventId: event.id, sessionDate: sessionRow.date } : null);
  }

  return (
    <div className={styles.wrapper}>
      <DateWindowControl
        value={range}
        onChange={setRange}
        label="Event window"
        hint="UTC dates · the list is capped at 100 events in the window."
      />

      {eventsQuery.isError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            The event list could not be loaded. Check the API connection and try again.
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {eventsQuery.isPending ? (
        <Spinner label="Loading events…" />
      ) : (
        <div className={styles.fields}>
          <Field label="Event" className={styles.field}>
            <Dropdown
              aria-label="Event"
              placeholder={events.length === 0 ? 'No events in this window' : 'Choose an event'}
              value={selectedEvent ? eventLabel(selectedEvent, formatDate) : ''}
              selectedOptions={selectedEvent ? [selectedEvent.id] : []}
              disabled={disabled || events.length === 0}
              onOptionSelect={(_, data) => {
                if (data.optionValue) chooseEvent(data.optionValue);
              }}
            >
              {events.map((event) => (
                <Option key={event.id} value={event.id} text={eventLabel(event, formatDate)}>
                  {eventLabel(event, formatDate)}
                </Option>
              ))}
            </Dropdown>
          </Field>

          <Field label="Session" className={styles.field}>
            <Dropdown
              aria-label="Session"
              placeholder={
                selectedEvent
                  ? sessions.length === 0
                    ? 'No selectable sessions'
                    : 'Choose a session'
                  : 'Choose an event first'
              }
              value={selectedSession ? sessionLabel(selectedSession, formatDate, formatTime) : ''}
              selectedOptions={selectedSession ? [selectedSession.date] : []}
              disabled={disabled || !selectedEvent || sessions.length === 0}
              onOptionSelect={(_, data) => {
                if (selectedEvent && data.optionValue) {
                  onChange({ eventId: selectedEvent.id, sessionDate: data.optionValue });
                }
              }}
            >
              {sessions.map((sessionRow) => (
                <Option
                  key={sessionRow.date}
                  value={sessionRow.date}
                  text={sessionLabel(sessionRow, formatDate, formatTime)}
                >
                  {sessionLabel(sessionRow, formatDate, formatTime)}
                </Option>
              ))}
            </Dropdown>
          </Field>
        </div>
      )}

      <Text size={200} className={styles.hint}>
        Codes, clocking and headcounts always name one event session. Cancelled and archived events,
        and cancelled sessions, cannot be selected.
      </Text>
    </div>
  );
}
