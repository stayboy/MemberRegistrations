import {
  Button,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, isUnauthorized } from '../api/errors';
import { createEvent, type CreateEventPayload } from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';
import {
  EVENT_VENUE_OPTIONS,
  createEmptyEventForm,
  sessionErrorKey,
  toCreateEventPayload,
  validateEventForm,
  type EventFormField,
  type EventFormErrors,
  type EventFormValues,
  type SessionFormValues,
} from '../format/event-form';
import { useEventStyles } from './events-styles';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sectionHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  toggle: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalXS,
  },
  helper: {
    color: tokens.colorNeutralForeground3,
  },
  error: {
    display: 'block',
    color: tokens.colorPaletteRedForeground1,
  },
  sessionsTable: {
    minWidth: '720px',
  },
  removeButton: {
    color: tokens.colorBrandForeground1,
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function asVenueType(value: string | undefined): EventFormValues['venueType'] {
  return value === 'virtual' || value === 'hybrid' ? value : 'auditorium';
}

/**
 * Events → New event (FR-42a, FR-42b, AC-56). The commit/cancel pair is the
 * form's own control, so the page renders no `Actions` menu (FR-9a). A create
 * sends the identity, the when-and-where fields and one or more sessions; the
 * API derives `status` and `source`.
 */
export function EventFormPage() {
  const styles = useStyles();
  const eventStyles = useEventStyles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [values, setValues] = useState<EventFormValues>(() => createEmptyEventForm());
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: CreateEventPayload) => createEvent(baseUrl, token, payload),
  });
  const isSaving = createMutation.isPending;

  function clearError(key: EventFormField): void {
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  /** A row's keys shift when a session is added or removed, so drop them all. */
  function clearSessionErrors(): void {
    setErrors((current) => {
      const keys = Object.keys(current).filter(
        (key) => key === 'sessions' || key.startsWith('session-'),
      );
      if (keys.length === 0) return current;
      const next = { ...current };
      for (const key of keys) delete next[key as EventFormField];
      return next;
    });
  }

  function setField<Key extends keyof EventFormValues>(
    key: Key,
    value: EventFormValues[Key],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    clearError(key as EventFormField);
  }

  /**
   * FR-42b: a single session still carrying the old start date follows the new
   * one, so changing the date does not strand the only row outside the range.
   */
  function setStartDate(next: string): void {
    setValues((current) => {
      if (next === current.startDate) return { ...current, startDate: next };
      const onOldStart = current.sessions.filter((session) => session.date === current.startDate);
      const sessions =
        onOldStart.length === 1
          ? current.sessions.map((session) =>
              session.date === current.startDate ? { ...session, date: next } : session,
            )
          : current.sessions;
      return { ...current, startDate: next, sessions };
    });
    clearError('startDate');
    clearSessionErrors();
  }

  function setSession(index: number, key: 'date' | 'startTime' | 'endTime', value: string): void {
    setValues((current) => ({
      ...current,
      sessions: current.sessions.map((session, row) =>
        row === index ? { ...session, [key]: value } : session,
      ),
    }));
    clearError(sessionErrorKey(index, key));
    clearError('sessions');
  }

  function addSession(): void {
    const row: SessionFormValues = {
      date: values.startDate.trim(),
      startTime: '',
      endTime: '',
    };
    setValues((current) => ({ ...current, sessions: [...current.sessions, row] }));
    clearError('sessions');
  }

  function removeSession(index: number): void {
    setValues((current) => ({
      ...current,
      sessions: current.sessions.filter((_, row) => row !== index),
    }));
    clearSessionErrors();
  }

  function submit(): void {
    if (isSaving) return;

    const nextErrors = validateEventForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFormError(null);
    createMutation.mutate(toCreateEventPayload(values), {
      onSuccess: (created) => {
        void queryClient.invalidateQueries({ queryKey: ['events', baseUrl] });
        navigate(`/events/${encodeURIComponent(created.id)}`);
      },
      onError: (error: unknown) => {
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        // FR-42a: the API's create conflict is the sole 409 on this form, so it
        // binds to the event number and keeps every other entered value.
        if (error instanceof ApiError && error.status === 409) {
          setErrors({
            eventNo: error.message.trim() || 'An event with this number already exists.',
          });
          return;
        }
        setFormError(errorMessage(error));
      },
    });
  }

  function cancel(): void {
    navigate('/events');
  }

  return (
    <PageFrame
      sectionId="events"
      title="New event"
      submenu="New event"
      description="A standalone event: its dates, venue and sessions. The API derives its status and source."
      controls={
        <>
          <Button appearance="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button appearance="primary" onClick={submit} disabled={isSaving}>
            Create event
          </Button>
        </>
      }
    >
      <div className={eventStyles.page}>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          noValidate
        >
          {formError ? (
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>The event was not created</MessageBarTitle>
                {formError}
              </MessageBarBody>
            </MessageBar>
          ) : null}

          <section className={styles.section} aria-labelledby="event-identity-heading">
            <div className={styles.sectionHeader}>
              <h2 id="event-identity-heading" className={styles.sectionTitle}>
                Identity
              </h2>
              <Text size={200} className={styles.helper}>
                The event number is unique and never reused.
              </Text>
            </div>

            <div className={styles.grid}>
              <Field
                label="Event number"
                required
                validationState={errors.eventNo ? 'error' : 'none'}
                validationMessage={errors.eventNo}
              >
                <Input
                  value={values.eventNo}
                  maxLength={64}
                  onChange={(_, data) => setField('eventNo', data.value)}
                />
              </Field>

              <Field
                label="Name"
                required
                validationState={errors.name ? 'error' : 'none'}
                validationMessage={errors.name}
              >
                <Input
                  value={values.name}
                  maxLength={200}
                  onChange={(_, data) => setField('name', data.value)}
                />
              </Field>
            </div>

            <Field
              label="Description (optional)"
              validationState={errors.description ? 'error' : 'none'}
              validationMessage={errors.description}
            >
              <Input
                value={values.description}
                maxLength={2000}
                onChange={(_, data) => setField('description', data.value)}
              />
            </Field>
          </section>

          <section className={styles.section} aria-labelledby="event-when-heading">
            <div className={styles.sectionHeader}>
              <h2 id="event-when-heading" className={styles.sectionTitle}>
                When and where
              </h2>
              <Text size={200} className={styles.helper}>
                UTC calendar dates. A blank end time leaves the session open-ended.
              </Text>
            </div>

            <div className={styles.grid}>
              <Field
                label="Start date"
                required
                validationState={errors.startDate ? 'error' : 'none'}
                validationMessage={errors.startDate}
              >
                <Input
                  type="date"
                  value={values.startDate}
                  onChange={(_, data) => setStartDate(data.value)}
                />
              </Field>

              <Field
                label="End date"
                required
                validationState={errors.endDate ? 'error' : 'none'}
                validationMessage={errors.endDate}
              >
                <Input
                  type="date"
                  value={values.endDate}
                  min={values.startDate || undefined}
                  onChange={(_, data) => setField('endDate', data.value)}
                />
              </Field>

              <Field
                label="Start time"
                required
                validationState={errors.startTime ? 'error' : 'none'}
                validationMessage={errors.startTime}
              >
                <Input
                  type="time"
                  value={values.startTime}
                  onChange={(_, data) => setField('startTime', data.value)}
                />
              </Field>

              <Field
                label="End time (optional)"
                validationState={errors.endTime ? 'error' : 'none'}
                validationMessage={errors.endTime}
              >
                <Input
                  type="time"
                  value={values.endTime}
                  onChange={(_, data) => setField('endTime', data.value)}
                />
              </Field>

              <Field
                label="Venue type"
                required
                validationState={errors.venueType ? 'error' : 'none'}
                validationMessage={errors.venueType}
              >
                <Dropdown
                  value={
                    EVENT_VENUE_OPTIONS.find((option) => option.value === values.venueType)
                      ?.label ?? 'Auditorium'
                  }
                  selectedOptions={[values.venueType]}
                  onOptionSelect={(_, data) => setField('venueType', asVenueType(data.optionValue))}
                >
                  {EVENT_VENUE_OPTIONS.map((option) => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>

              <Field
                label="Venue name (optional)"
                validationState={errors.venueName ? 'error' : 'none'}
                validationMessage={errors.venueName}
              >
                <Input
                  value={values.venueName}
                  maxLength={200}
                  onChange={(_, data) => setField('venueName', data.value)}
                />
              </Field>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="event-sessions-heading">
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleRow}>
                <h2 id="event-sessions-heading" className={styles.sectionTitle}>
                  Sessions
                </h2>
                <Button size="small" icon={<AddRegular />} onClick={addSession}>
                  Add session
                </Button>
              </div>
              <Text size={200} className={styles.helper}>
                One row per date, inside the event range. Leave a time blank to inherit the
                event&apos;s time.
              </Text>
              {errors.sessions ? (
                <Text size={200} role="alert" className={styles.error}>
                  {errors.sessions}
                </Text>
              ) : null}
            </div>

            <div className={eventStyles.tableWrap}>
              <Table className={styles.sessionsTable} size="small" aria-label="Sessions">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Date</TableHeaderCell>
                    <TableHeaderCell>Start time</TableHeaderCell>
                    <TableHeaderCell>End time</TableHeaderCell>
                    <TableHeaderCell>
                      <span className={styles.visuallyHidden}>Row actions</span>
                    </TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {values.sessions.map((session, index) => {
                    const dateError = errors[sessionErrorKey(index, 'date')];
                    const startError = errors[sessionErrorKey(index, 'startTime')];
                    const endError = errors[sessionErrorKey(index, 'endTime')];

                    return (
                      <TableRow key={index}>
                        <TableCell>
                          <Input
                            type="date"
                            aria-label={`Session ${index + 1} date`}
                            value={session.date}
                            min={values.startDate || undefined}
                            max={values.endDate || undefined}
                            onChange={(_, data) => setSession(index, 'date', data.value)}
                          />
                          {dateError ? (
                            <Text size={200} role="alert" className={styles.error}>
                              {dateError}
                            </Text>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="time"
                            aria-label={`Session ${index + 1} start time`}
                            value={session.startTime}
                            onChange={(_, data) => setSession(index, 'startTime', data.value)}
                          />
                          {startError ? (
                            <Text size={200} role="alert" className={styles.error}>
                              {startError}
                            </Text>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="time"
                            aria-label={`Session ${index + 1} end time`}
                            value={session.endTime}
                            onChange={(_, data) => setSession(index, 'endTime', data.value)}
                          />
                          {endError ? (
                            <Text size={200} role="alert" className={styles.error}>
                              {endError}
                            </Text>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Button
                            appearance="transparent"
                            className={styles.removeButton}
                            aria-label={`Remove session ${index + 1}`}
                            onClick={() => removeSession(index)}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="event-tracking-heading">
            <div className={styles.sectionHeader}>
              <h2 id="event-tracking-heading" className={styles.sectionTitle}>
                Tracking
              </h2>
            </div>

            <div className={styles.grid}>
              <div className={styles.toggle}>
                <Switch
                  checked={values.tracksMembers}
                  onChange={(_, data) => setField('tracksMembers', data.checked)}
                  label="Members tracking"
                />
                <Text size={200} className={styles.helper}>
                  Off records a headcount only.
                </Text>
              </div>

              <div className={styles.toggle}>
                <Switch
                  checked={values.presbyterOnly}
                  onChange={(_, data) => setField('presbyterOnly', data.checked)}
                  label="Presbyter only"
                />
                <Text size={200} className={styles.helper}>
                  Hidden on member-facing surfaces and rosters the presbyters.
                </Text>
              </div>
            </div>
          </section>
        </form>
      </div>
    </PageFrame>
  );
}
