import {
  Button,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Textarea,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, isUnauthorized } from '../api/errors';
import {
  createEventParent,
  getEventParent,
  updateEventParent,
  type CreateEventParentPayload,
  type UpdateEventParentInput,
} from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { AudiencePicker } from '../components/AudiencePicker';
import { PageFrame } from '../components/PageFrame';
import {
  EVENT_VENUE_OPTIONS,
  createEmptyEventForm,
  fromEventParent,
  latestSchedule,
  occurrenceErrorKey,
  toCreateEventPayload,
  toUpdateEventPayload,
  validateEventForm,
  type EventFormErrors,
  type EventFormField,
  type EventFormValues,
  type OccurrenceFormValues,
} from '../format/event-form';
import { utcToday } from '../format/member-form';
import { CADENCE_OPTIONS, cadenceLabel, fromRrule, type RecurrenceCadence } from '../format/rrule';
import { scheduleLabel } from '../format/series';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
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
  readOnlyRows: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: tokens.spacingVerticalM,
    margin: 0,
  },
  readOnlyRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  label: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  helper: {
    color: tokens.colorNeutralForeground3,
  },
  error: {
    display: 'block',
    color: tokens.colorPaletteRedForeground1,
  },
  occurrencesTable: {
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
  state: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  bannerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalS,
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function asVenueType(value: string | undefined): EventFormValues['venueType'] {
  return value === 'virtual' || value === 'hybrid' ? value : 'auditorium';
}

function asCadence(value: string | undefined): RecurrenceCadence {
  return value === 'fortnightly' || value === 'monthly' ? value : 'weekly';
}

/** The `state` the create hands its edit view when activation failed (FR-42b). */
interface EventFormLocationState {
  readonly notActivated?: boolean;
  readonly activationError?: string;
}

type CommitMode = 'draft' | 'activate' | 'update';

/**
 * Events → New event / Edit event (FR-42, FR-42a, FR-42b, AC-56). One **Audience**
 * picker replaces the retired Ministry select and Presbyter-only toggle; the
 * event is either its date rows or its first recurrence version; and the form
 * commits with **Save draft** or **Save and activate**, where activation is a
 * separate `PATCH` carrying only `status: active`.
 *
 * The commit/cancel pair is the form's own control, so the page renders no
 * `Actions` menu (FR-9a). The form never sends the parent's `status`, an
 * occurrence's `source`, the derived range or the retired projections.
 */
export function EventFormPage() {
  const styles = useStyles();
  const eventStyles = useEventStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { formatDate } = useDateTimeFormat();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const today = utcToday();

  const [values, setValues] = useState<EventFormValues>(() => createEmptyEventForm());
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);

  const locationState = (location.state ?? null) as EventFormLocationState | null;
  const notActivated = isEdit && locationState?.notActivated === true;

  const parentQuery = useQuery({
    queryKey: ['events', baseUrl, 'detail', id, 'form'],
    queryFn: ({ signal }) =>
      getEventParent(baseUrl, token, id ?? '', { from: today, to: today, signal }),
    enabled: isEdit && Boolean(token) && Boolean(id),
  });

  useEffect(() => {
    if (isUnauthorized(parentQuery.error)) void signOut();
  }, [parentQuery.error, signOut]);

  // Seed the edit form from the parent once per event; a later refetch must not
  // overwrite what the operator is typing.
  const parent = parentQuery.data;
  if (isEdit && parent && seededFor !== parent.id) {
    setSeededFor(parent.id);
    setValues(fromEventParent(parent, today));
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateEventParentPayload) => createEventParent(baseUrl, token, payload),
  });
  const updateMutation = useMutation({
    mutationFn: (payload: UpdateEventParentInput) =>
      updateEventParent(baseUrl, token, id ?? '', payload),
  });
  const activateMutation = useMutation({
    mutationFn: (eventId: string) =>
      updateEventParent(baseUrl, token, eventId, { status: 'active' }),
  });

  const isSaving =
    createMutation.isPending || updateMutation.isPending || activateMutation.isPending;

  function invalidateEvents(): void {
    void queryClient.invalidateQueries({ queryKey: ['events', baseUrl] });
  }

  function clearError(key: EventFormField): void {
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  /** A row's keys shift when an occurrence is added or removed, so drop them all. */
  function clearOccurrenceErrors(): void {
    setErrors((current) => {
      const keys = Object.keys(current).filter(
        (key) => key === 'occurrences' || key.startsWith('occurrence-'),
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
    setFormError(null);
  }

  function setOccurrence(index: number, key: keyof OccurrenceFormValues, value: string): void {
    setValues((current) => ({
      ...current,
      occurrences: current.occurrences.map((row, position) =>
        position === index ? { ...row, [key]: value } : row,
      ),
    }));
    clearError(occurrenceErrorKey(index, key));
    clearError('occurrences');
  }

  function addOccurrence(): void {
    const lastDate = values.occurrences.at(-1)?.date ?? '';
    const row: OccurrenceFormValues = {
      date: lastDate.trim() || today,
      startTime: '',
      endTime: '',
    };
    setValues((current) => ({ ...current, occurrences: [...current.occurrences, row] }));
    clearError('occurrences');
  }

  function removeOccurrence(index: number): void {
    setValues((current) => ({
      ...current,
      occurrences: current.occurrences.filter((_, position) => position !== index),
    }));
    clearOccurrenceErrors();
  }

  function onRequestError(error: unknown, mode: CommitMode): void {
    if (isUnauthorized(error)) {
      void signOut();
      return;
    }
    // FR-42a/AC-56: the create's sole 409 is a duplicate event number, so it
    // binds to that field and every other entered value survives.
    if (mode !== 'update' && error instanceof ApiError && error.status === 409) {
      setErrors({
        eventNo: error.message.trim() || 'An event with this number already exists.',
      });
      return;
    }
    // FR-42g: an update's conflict stays a banner on the form.
    setFormError(errorMessage(error));
  }

  function submit(mode: CommitMode): void {
    if (isSaving) return;

    const nextErrors = validateEventForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFormError(null);
    setActivationError(null);

    if (mode === 'update') {
      updateMutation.mutate(toUpdateEventPayload(values), {
        onSuccess: (updated) => {
          invalidateEvents();
          navigate(`/events/${encodeURIComponent(updated.id)}`);
        },
        onError: (error: unknown) => onRequestError(error, 'update'),
      });
      return;
    }

    createMutation.mutate(toCreateEventPayload(values), {
      onSuccess: (created) => {
        invalidateEvents();
        if (mode === 'draft') {
          navigate(`/events/${encodeURIComponent(created.id)}`);
          return;
        }

        // FR-42b/AC-56: activation is its own PATCH. A failure leaves the
        // operator on the created event, says the draft was saved, and
        // re-offers Activate — it never reports the create as failed.
        activateMutation.mutate(created.id, {
          onSuccess: () => {
            invalidateEvents();
            navigate(`/events/${encodeURIComponent(created.id)}`);
          },
          onError: (error: unknown) => {
            invalidateEvents();
            if (isUnauthorized(error)) {
              void signOut();
              return;
            }
            navigate(`/events/${encodeURIComponent(created.id)}/edit`, {
              replace: true,
              state: {
                notActivated: true,
                activationError: errorMessage(error),
              } satisfies EventFormLocationState,
            });
          },
        });
      },
      onError: (error: unknown) => onRequestError(error, mode),
    });
  }

  function activateDraft(): void {
    if (!id || isSaving) return;
    setActivationError(null);

    activateMutation.mutate(id, {
      onSuccess: () => {
        invalidateEvents();
        navigate(`/events/${encodeURIComponent(id)}`);
      },
      onError: (error: unknown) => {
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        setActivationError(errorMessage(error));
      },
    });
  }

  function cancel(): void {
    if (isEdit && id) navigate(`/events/${encodeURIComponent(id)}`);
    else navigate('/events');
  }

  // The edit form is seeded from the parent read (FR-43), so the frame shows the
  // read's own states rather than an empty form.
  if (isEdit && parentQuery.isPending) {
    return (
      <PageFrame sectionId="events" title="Edit event" submenu="Edit event">
        <div className={styles.state}>
          <Spinner label="Loading the event…" />
        </div>
      </PageFrame>
    );
  }

  if (isEdit && parentQuery.isError) {
    return (
      <PageFrame sectionId="events" title="Edit event" submenu="Edit event">
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The event could not be loaded</MessageBarTitle>
            {errorMessage(parentQuery.error)}
            <Button
              size="small"
              appearance="transparent"
              onClick={() => {
                void parentQuery.refetch();
              }}
            >
              Retry
            </Button>
          </MessageBarBody>
        </MessageBar>
      </PageFrame>
    );
  }

  const schedule = parent ? latestSchedule(parent) : null;
  const cadence = schedule ? fromRrule(schedule.rrule) : null;
  const activationMessage = activationError ?? locationState?.activationError ?? null;

  const title = isEdit ? 'Edit event' : 'New event';
  const description = isEdit
    ? 'Update the identity and when/where fields. Dates and schedule versions are managed from the event detail.'
    : "The event identity, its dates or recurrence, and its venue. The API derives its status, its range and an occurrence's source.";

  return (
    <PageFrame
      sectionId="events"
      title={title}
      submenu={title}
      description={description}
      controls={
        <>
          <Button appearance="secondary" onClick={cancel} disabled={isSaving}>
            Cancel
          </Button>
          {isEdit ? (
            <Button appearance="primary" onClick={() => submit('update')} disabled={isSaving}>
              Save changes
            </Button>
          ) : (
            <>
              <Button appearance="secondary" onClick={() => submit('draft')} disabled={isSaving}>
                Save draft
              </Button>
              <Button appearance="primary" onClick={() => submit('activate')} disabled={isSaving}>
                Save and activate
              </Button>
            </>
          )}
        </>
      }
    >
      <div className={eventStyles.page}>
        {notActivated ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>Saved as a draft but not activated</MessageBarTitle>
              The event was created. Activation failed
              {activationMessage ? `: ${activationMessage}` : '.'} You can activate it here, or from
              the event detail.
              <div className={styles.bannerActions}>
                <Button
                  appearance="primary"
                  size="small"
                  onClick={activateDraft}
                  disabled={isSaving}
                >
                  Activate
                </Button>
              </div>
            </MessageBarBody>{' '}
          </MessageBar>
        ) : null}

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            submit(isEdit ? 'update' : 'activate');
          }}
          noValidate
        >
          {formError ? (
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>The event was not saved</MessageBarTitle>
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
                An event number is unique and never reused.
              </Text>
            </div>

            <div className={styles.grid}>
              <Field
                label="Event number (optional)"
                hint={
                  isEdit
                    ? 'The event number is immutable; it is not sent with an update.'
                    : 'Leave blank and the API mints EVT-<year>-<sequence> when the event is created.'
                }
                validationState={errors.eventNo ? 'error' : 'none'}
                validationMessage={errors.eventNo}
              >
                <Input
                  value={values.eventNo}
                  maxLength={64}
                  readOnly={isEdit}
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

            <AudiencePicker
              value={values.audienceId}
              onChange={(audienceId) => setField('audienceId', audienceId)}
              validationState={errors.audienceId ? 'error' : 'none'}
              validationMessage={errors.audienceId}
            />

            <Field
              label="Description (optional)"
              validationState={errors.description ? 'error' : 'none'}
              validationMessage={errors.description}
            >
              <Textarea
                value={values.description}
                maxLength={2000}
                rows={3}
                resize="vertical"
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
                Times are wall-clock times in the event&apos;s stored zone. A date row that leaves
                its times blank inherits them.
              </Text>
            </div>

            <div className={styles.grid}>
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
                  aria-label="Venue type"
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

          <section className={styles.section} aria-labelledby="event-dates-heading">
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleRow}>
                <h2 id="event-dates-heading" className={styles.sectionTitle}>
                  Dates
                </h2>
                {isEdit ? null : (
                  <Switch
                    checked={values.repeats}
                    onChange={(_, data) => setField('repeats', data.checked)}
                    label="Repeats"
                  />
                )}
              </div>
              <Text size={200} className={styles.helper}>
                {isEdit
                  ? 'Dates and schedule versions are added from the event detail; an update carries neither.'
                  : values.repeats
                    ? 'The API generates the first window from this version; the weekday or day comes from the start date.'
                    : 'One row per date. Each date is unique; the API derives the event’s range from them.'}
              </Text>
            </div>

            {isEdit ? (
              <div className={styles.readOnlyRows}>
                <div className={styles.readOnlyRow}>
                  <Text className={styles.label}>Repeats</Text>
                  <Text>
                    {parent?.recurrence
                      ? cadence
                        ? cadenceLabel(cadence)
                        : "A schedule outside the form's vocabulary"
                      : 'Standalone event'}
                  </Text>
                </div>
                {schedule ? (
                  <>
                    <div className={styles.readOnlyRow}>
                      <Text className={styles.label}>Schedule</Text>
                      <Text>{cadence ? scheduleLabel(schedule.rrule) : schedule.rrule}</Text>
                    </div>
                    <div className={styles.readOnlyRow}>
                      <Text className={styles.label}>From</Text>
                      <Text>{formatDate(schedule.effectiveFrom)}</Text>
                    </div>
                    <div className={styles.readOnlyRow}>
                      <Text className={styles.label}>Ends on</Text>
                      <Text>{schedule.endsOn ? formatDate(schedule.endsOn) : 'No end date'}</Text>
                    </div>
                  </>
                ) : null}
              </div>
            ) : values.repeats ? (
              <div className={styles.grid}>
                <Field
                  label="Starts on"
                  required
                  hint="The first date of this version. Its weekday (or day of the month) is what repeats."
                  validationState={errors.effectiveFrom ? 'error' : 'none'}
                  validationMessage={errors.effectiveFrom}
                >
                  <Input
                    type="date"
                    value={values.effectiveFrom}
                    onChange={(_, data) => setField('effectiveFrom', data.value)}
                  />
                </Field>

                <Field label="Repeats" required>
                  <Dropdown
                    aria-label="Repeats"
                    value={
                      CADENCE_OPTIONS.find((option) => option.value === values.cadence)?.label ??
                      'Weekly'
                    }
                    selectedOptions={[values.cadence]}
                    onOptionSelect={(_, data) => setField('cadence', asCadence(data.optionValue))}
                  >
                    {CADENCE_OPTIONS.map((option) => (
                      <Option key={option.value} value={option.value}>
                        {option.label}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>

                <Field
                  label="Ends on (optional)"
                  hint="Leave blank when the recurrence has no planned end."
                  validationState={errors.endsOn ? 'error' : 'none'}
                  validationMessage={errors.endsOn}
                >
                  <Input
                    type="date"
                    value={values.endsOn}
                    min={values.effectiveFrom || undefined}
                    onChange={(_, data) => setField('endsOn', data.value)}
                  />
                </Field>
              </div>
            ) : (
              <>
                {errors.occurrences ? (
                  <Text size={200} role="alert" className={styles.error}>
                    {errors.occurrences}
                  </Text>
                ) : null}

                <div className={eventStyles.tableWrap}>
                  <Table className={styles.occurrencesTable} size="small" aria-label="Event dates">
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
                      {values.occurrences.map((row, index) => {
                        const dateError = errors[occurrenceErrorKey(index, 'date')];
                        const startError = errors[occurrenceErrorKey(index, 'startTime')];
                        const endError = errors[occurrenceErrorKey(index, 'endTime')];

                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <Input
                                type="date"
                                aria-label={`Occurrence ${index + 1} date`}
                                value={row.date}
                                onChange={(_, data) => setOccurrence(index, 'date', data.value)}
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
                                aria-label={`Occurrence ${index + 1} start time`}
                                value={row.startTime}
                                onChange={(_, data) =>
                                  setOccurrence(index, 'startTime', data.value)
                                }
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
                                aria-label={`Occurrence ${index + 1} end time`}
                                value={row.endTime}
                                onChange={(_, data) => setOccurrence(index, 'endTime', data.value)}
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
                                aria-label={`Remove occurrence ${index + 1}`}
                                onClick={() => removeOccurrence(index)}
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

                <div>
                  <Button icon={<AddRegular />} appearance="secondary" onClick={addOccurrence}>
                    Add date
                  </Button>
                </div>
              </>
            )}
          </section>

          <section className={styles.section} aria-labelledby="event-tracking-heading">
            <div className={styles.sectionHeader}>
              <h2 id="event-tracking-heading" className={styles.sectionTitle}>
                Tracking
              </h2>
            </div>

            <div className={styles.toggle}>
              <Switch
                checked={values.tracksMembers}
                disabled={isEdit}
                onChange={(_, data) => setField('tracksMembers', data.checked)}
                label="Members tracking"
              />
              <Text size={200} className={styles.helper}>
                {isEdit
                  ? 'Members tracking is read-only here: flipping it changes whether future attendance is counted, and that decision is not offered as an edit.'
                  : 'Off records a headcount only.'}
              </Text>
            </div>
          </section>
        </form>
      </div>
    </PageFrame>
  );
}
