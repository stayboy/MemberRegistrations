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
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, isUnauthorized } from '../api/errors';
import {
  createEventParent,
  getEventParent,
  listEventPeriods,
  updateEventParent,
  writeEventSchedule,
  type CreateEventParentPayload,
  type EventParentItem,
  type EventPeriodItem,
  type EventPreview,
  type EventScheduleWriteInput,
  type PeriodDay,
  type UpdateEventParentInput,
} from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { AudienceSetPicker } from '../components/AudienceSetPicker';
import { PageFrame } from '../components/PageFrame';
import { ScheduleBuilder } from '../components/ScheduleBuilder';
import { SchedulePreview } from '../components/SchedulePreview';
import {
  EVENT_VENUE_OPTIONS,
  canEditSchedule,
  createEmptyEventForm,
  fromEventParent,
  latestSchedule,
  occurrenceErrorKey,
  periodShapeOf,
  toCreateEventPayload,
  toPreviewInput,
  toScheduleRrule,
  toScheduleWrite,
  toUpdateEventPayload,
  validateEventForm,
  type EventFormErrors,
  type EventFormField,
  type EventFormValues,
  type EventScheduleForm,
  type OccurrenceFormValues,
} from '../format/event-form';
import { utcToday } from '../format/member-form';
import { periodProvenanceLine } from '../format/period';
import { cadenceLabel, fromRrule, weekdayOf } from '../format/rrule';
import { lockReasonsFromProblem, scheduleLockSentence } from '../format/schedule-lock';
import { scheduleLabel } from '../format/series';
import { writeFailure, type WriteFailure } from '../format/write-errors';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { useEventStyles } from './events-styles';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  // FR-42b (event-form layout, owner 2026-11-24): two columns, never a stack.
  // Identity, the cycle/provenance line and the schedule live in the main
  // column; when and where are supporting facts in the narrow rail.
  columns: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 320px',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 960px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minWidth: 0,
  },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
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
  railGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: tokens.spacingVerticalM,
    alignItems: 'start',
  },
  // The cycle/provenance line sits at the foot of Identity, separated by a
  // hairline, so identity -> cycle -> schedule reads as one column (FR-42b).
  cycle: {
    margin: 0,
    paddingTop: tokens.spacingVerticalS,
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
  // The rail's start date is a derived fact for a period or a standalone event,
  // and an input only where it is the rule's first date.
  startBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalS,
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke2),
  },
  startValue: {
    fontWeight: tokens.fontWeightSemibold,
  },
  readOnlyRows: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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

/** The earliest date among the standalone rows, which is where counts read. */
function firstRowDate(occurrences: readonly OccurrenceFormValues[]): string | undefined {
  return occurrences
    .map((row) => row.date.trim())
    .filter((date) => date.length > 0)
    .sort()[0];
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The `state` the create hands its edit view when activation failed (FR-42b). */
interface EventFormLocationState {
  readonly notActivated?: boolean;
  readonly activationError?: string;
}

type CommitMode = 'draft' | 'activate' | 'update';

/**
 * Events → New event / Edit event (FR-42, FR-42a, FR-42b, FR-42f, AC-56,
 * AC-63a). The create is two columns: identity, the cycle/provenance line and
 * the schedule in the main column, when and where in the narrow rail.
 *
 * The event number is **minted by the server**: the create carries no number
 * control, never sends one, and reports a mint collision as a banner (AC 8). The
 * audience is an ordered set; the schedule is the shared builder (four cadences
 * plus the named-period mode); and the resolved dates are a preview fetched from
 * `POST /v1/events/preview`, never a table the form builds.
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
  const { formatDate, formatRange } = useDateTimeFormat();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const today = utcToday();

  const [values, setValues] = useState<EventFormValues>(() => createEmptyEventForm());
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [formFailure, setFormFailure] = useState<WriteFailure | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EventPreview | undefined>(undefined);

  const locationState = (location.state ?? null) as EventFormLocationState | null;
  const notActivated = isEdit && locationState?.notActivated === true;

  const parentQuery = useQuery({
    queryKey: ['events', baseUrl, 'detail', id, 'form'],
    queryFn: ({ signal }) =>
      getEventParent(baseUrl, token, id ?? '', { from: today, to: today, signal }),
    enabled: isEdit && Boolean(token) && Boolean(id),
  });

  // The named-period catalogue: the builder lists it and the cycle line names
  // the chosen period from the same rows, so no id or name is hard-coded here.
  const periodsQuery = useQuery({
    queryKey: ['events', 'periods', baseUrl],
    queryFn: ({ signal }) => listEventPeriods(baseUrl, token, signal),
    enabled: Boolean(token),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isUnauthorized(periodsQuery.error)) void signOut();
  }, [periodsQuery.error, signOut]);

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
  // FR-42h: the rule write is its own verb, and it is only dispatched when the
  // authored rule differs from the stored one (`toScheduleWrite`).
  const scheduleMutation = useMutation({
    mutationFn: (input: EventScheduleWriteInput) =>
      writeEventSchedule(baseUrl, token, id ?? '', input),
  });
  const activateMutation = useMutation({
    mutationFn: (eventId: string) =>
      updateEventParent(baseUrl, token, eventId, { status: 'active' }),
  });

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    scheduleMutation.isPending ||
    activateMutation.isPending;

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
    setFormFailure(null);
  }

  /**
   * The start date is the rule's anchor, so changing it re-seeds the weekday
   * **while the weekday set is still the untouched seed** (the cadence presets
   * take their weekday from this date). A set the operator ticked is never
   * rewritten.
   */
  function setStartDate(next: string): void {
    setValues((current) => {
      const previousSeed = weekdayOf(current.effectiveFrom);
      const untouched =
        current.schedule.weekdays.length === 1 &&
        previousSeed !== null &&
        current.schedule.weekdays[0] === previousSeed;
      const nextSeed = weekdayOf(next);
      return {
        ...current,
        effectiveFrom: next,
        schedule:
          untouched && nextSeed ? { ...current.schedule, weekdays: [nextSeed] } : current.schedule,
      };
    });
    clearError('effectiveFrom');
    setFormFailure(null);
  }

  /** The builder is one control group, so its keys clear together. */
  function patchSchedule(patch: Partial<EventScheduleForm>): void {
    setValues((current) => ({ ...current, schedule: { ...current.schedule, ...patch } }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of [
        'weekdays',
        'interval',
        'dayOfMonth',
        'position',
        'period',
        'cycleMonth',
        'periodDay',
        'endsOn',
      ] as const) {
        delete next[key];
      }
      return next;
    });
    setFormFailure(null);
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

  function onRequestError(error: unknown): void {
    if (isUnauthorized(error)) {
      void signOut();
      return;
    }
    // AC 8/FR-42g: a create 409 is a mint collision. The form has no number
    // field to bind it to, so it is the form's banner; an update's conflict is a
    // banner too, titled by its problem+json code.
    setFormFailure(writeFailure(error, 'The event was not saved'));
  }

  /**
   * FR-42g/FR-42h: a `409 recurrence_locked` is the edit form's banner carrying
   * the API's own reasons, and a `422` is the same banner under its fallback
   * title. The identity `PATCH` may already have succeeded, so the banner says
   * the rule was not saved rather than claiming the whole event was lost.
   */
  function onScheduleError(error: unknown): void {
    if (isUnauthorized(error)) {
      void signOut();
      return;
    }
    const failure = writeFailure(error, 'The schedule was not saved');
    const reasons = lockReasonsFromProblem(error instanceof ApiError ? error.problem : null);
    const causes = scheduleLockSentence(reasons, formatDate);
    setFormFailure({
      title: failure.title,
      message: causes ? `${failure.message} ${causes}` : failure.message,
    });
  }

  function submit(mode: CommitMode): void {
    if (isSaving) return;

    const nextErrors = validateEventForm(
      values,
      isEdit ? { schedule: parent ? canEditSchedule(parent) : false } : {},
    );
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFormFailure(null);
    setScheduleNotice(null);
    setActivationError(null);

    if (mode === 'update') {
      // FR-42h: the rule is sent only when it changed, and only when the write
      // is offered at all. An identity-only save on a locked or unchanged
      // schedule is a bare `PATCH`. The period's shape comes from the catalogue
      // (the parent read carries no `dates`) through the same helper the builder
      // uses, so a single-date period never sends a day.
      const catalogueRow = periodsQuery.data?.find(
        (period) => period.id === values.schedule.periodId,
      );
      const scheduleInput = parent
        ? toScheduleWrite(values, parent, periodShapeOf(values.schedule, catalogueRow?.dates))
        : null;

      updateMutation.mutate(toUpdateEventPayload(values), {
        onSuccess: (updated) => {
          invalidateEvents();
          if (!scheduleInput) {
            navigate(`/events/${encodeURIComponent(updated.id)}`);
            return;
          }
          scheduleMutation.mutate(scheduleInput, {
            onSuccess: (result) => {
              invalidateEvents();
              if (!result.generated) {
                // The rule is saved; the API could not produce the window. Say
                // so once, without failing the save or writing it twice.
                setScheduleNotice(
                  'The schedule was saved. The API could not produce dates over the event’s current window yet; generate the calendar again to see the new dates.',
                );
                return;
              }
              navigate(`/events/${encodeURIComponent(updated.id)}`);
            },
            onError: onScheduleError,
          });
        },
        onError: onRequestError,
      });
      return;
    }

    let payload: CreateEventParentPayload;
    try {
      payload = toCreateEventPayload(values);
    } catch (error) {
      setFormFailure({ title: 'The event was not saved', message: errorMessage(error) });
      return;
    }

    createMutation.mutate(payload, {
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
      onError: onRequestError,
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

  /**
   * The preview body. `values` is a new object per keystroke, but the debounce in
   * `SchedulePreview` means a settle — not a keystroke — is what fetches, so no
   * extra identity plumbing is needed here (AC-63a).
   */
  const previewInput = useMemo(() => toPreviewInput(values), [values]);

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
  const storedRule = schedule ? scheduleLabel(schedule.rrule) : null;
  const storedCadence = schedule ? fromRrule(schedule.rrule) : null;
  const storedRuleInVocabulary = storedCadence !== null;
  const parentPeriod = parent?.period ?? null;
  const periods = periodsQuery.data ?? [];
  const selectedPeriod = periods.find((period) => period.id === values.schedule.periodId);
  const firstResolvedDate = preview?.occurrences[0]?.date;
  const activationMessage = activationError ?? locationState?.activationError ?? null;

  // The catalogue's shape for the chosen period, or null when there is no row:
  // the line then makes no span claim (round `detail-grammar`, Q4).
  const periodShape = selectedPeriod?.dates ?? null;
  // A period's line names a span, never a date list. On the edit route the span
  // is the range the event actually holds (a fact); on the create it is the
  // preview's range, which `buildCycleLine` computes.
  const heldPeriodSpan =
    parent && parentPeriod ? formatRange(parent.startDate, parent.endDate ?? parent.startDate) : '';

  const scheduleRrule =
    values.repeats && values.schedule.mode === 'rule'
      ? toScheduleRrule(values.schedule, values.effectiveFrom)
      : null;

  const cycleLine = buildCycleLine({
    isEdit,
    storedRule,
    storedRuleInVocabulary,
    parentPeriod,
    heldPeriodSpan,
    values,
    selectedPeriod,
    preview,
    scheduleRrule,
    formatDate,
    formatRange,
  });

  const railStart = railStartOf({
    isEdit,
    values,
    parent,
    firstResolvedDate,
    formatDate,
  });

  // The chips count at the first resolved date of the authored rule, exactly as
  // the resolved-dates summary beside them does; an edit falls back to the stored
  // start date until the preview settles.
  const countAt = values.repeats
    ? (firstResolvedDate ?? (isEdit ? parent?.startDate : undefined))
    : firstRowDate(values.occurrences);

  const scheduleContext = describeSchedule({
    values,
    selectedPeriod,
    scheduleRrule,
    formatDate,
  });

  // FR-42h: an event is recurring by an rrule or by a period; the edit route
  // offers the builder only when the read reports the guard open and the stored
  // schedule is one the write can express.
  const recurring = Boolean(parent?.recurrence ?? parent?.period);
  const scheduleEditable = parent ? canEditSchedule(parent) : false;
  const scheduleLocked = parent?.schedule.locked === true;
  const lockSentence = scheduleLockSentence(parent?.schedule.reasons ?? [], formatDate);

  /**
   * The stored rule in one line, for the surface that cannot edit it: the same
   * facts the resolved-dates block would carry, taken from the read rather than a
   * preview fetch. A period event names its provenance; an rrule event names the
   * rule and its window.
   */
  const storedScheduleLine = parentPeriod
    ? `${periodProvenanceLine(parentPeriod, heldPeriodSpan, periodShape)}.`
    : schedule
      ? `${storedRule ?? schedule.rrule} · from ${formatDate(schedule.effectiveFrom)}${
          schedule.endsOn ? ` to ${formatDate(schedule.endsOn)}` : ', with no end date'
        }.`
      : null;

  const title = isEdit ? 'Edit event' : 'New event';
  const description = isEdit
    ? 'Update the identity and when/where fields, and the rule while its dates have no history.'
    : 'The event identity, its schedule or named period, and its venue. The API mints the event number, derives the range and generates the first window.';

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
          {formFailure ? (
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>{formFailure.title}</MessageBarTitle>
                {formFailure.message}
              </MessageBarBody>
            </MessageBar>
          ) : null}

          {scheduleNotice ? (
            <MessageBar intent="warning">
              <MessageBarBody>
                <MessageBarTitle>
                  The schedule was saved; its dates were not generated
                </MessageBarTitle>
                {scheduleNotice}
              </MessageBarBody>
            </MessageBar>
          ) : null}

          <div className={styles.columns}>
            <div className={styles.main} role="group" aria-label="Event details">
              <section className={styles.section} aria-labelledby="event-identity-heading">
                <div className={styles.sectionHeader}>
                  <h2 id="event-identity-heading" className={styles.sectionTitle}>
                    Identity
                  </h2>
                  <Text size={200} className={styles.helper}>
                    {isEdit
                      ? 'The event number is minted by the server and never changes.'
                      : 'The event number is minted by the server when you save, and never changes.'}
                  </Text>
                </div>

                {isEdit ? (
                  <Field label="Event number">
                    <Input value={values.eventNo} readOnly />
                  </Field>
                ) : null}

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

                <AudienceSetPicker
                  value={values.audienceIds}
                  onChange={(audienceIds) => setField('audienceIds', audienceIds)}
                  countAt={countAt}
                  validationState={errors.audienceIds ? 'error' : 'none'}
                  validationMessage={errors.audienceIds}
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

                <p className={styles.cycle}>{cycleLine}</p>
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
                      ? recurring
                        ? 'This event repeats. Its type was chosen when it was created and is not part of an edit.'
                        : 'This event does not repeat. Its dates are managed from the event detail.'
                      : values.repeats
                        ? 'The API generates the first window from this rule, or resolves the period’s dates. The weekday or day comes from the start date in When and where.'
                        : 'One row per date, and nothing else. Each date is unique; the API derives the event’s range from them.'}
                  </Text>
                </div>

                {isEdit ? (
                  <>
                    {scheduleLocked ? (
                      <MessageBar intent="warning">
                        <MessageBarBody>
                          <MessageBarTitle>The schedule cannot change</MessageBarTitle>
                          {lockSentence ? `${lockSentence} ` : ''}The name, description, audience
                          and times still save; a schedule write here is refused{' '}
                          <strong>409 recurrence_locked</strong>.
                        </MessageBarBody>
                      </MessageBar>
                    ) : null}

                    {scheduleEditable ? (
                      <>
                        <ScheduleBuilder
                          value={values.schedule}
                          onChange={patchSchedule}
                          effectiveFrom={values.effectiveFrom}
                          endsOn={values.endsOn}
                          onEndsOnChange={(endsOn) => setField('endsOn', endsOn)}
                          errors={errors}
                          periods={periods}
                          periodsLoading={periodsQuery.isPending}
                          periodsError={periodsQuery.isError}
                          fixedArm={parentPeriod ? 'period' : 'rule'}
                        />
                        <Text size={200} className={styles.helper}>
                          {parentPeriod
                            ? 'Saving a changed period replaces the dates it generated and regenerates the calendar to match.'
                            : `Saving a changed rule replaces the dates from ${
                                schedule ? formatDate(schedule.effectiveFrom) : 'its start date'
                              } and regenerates the calendar to match.`}{' '}
                          Nothing dated today or earlier is touched; an unchanged schedule sends no
                          write.
                        </Text>
                        <SchedulePreview
                          input={previewInput}
                          context={scheduleContext}
                          onPreview={setPreview}
                        />
                      </>
                    ) : (
                      <>
                        <div className={styles.readOnlyRows}>
                          <div className={styles.readOnlyRow}>
                            <Text className={styles.label}>Repeats</Text>
                            <Text>
                              {parentPeriod
                                ? parentPeriod.name
                                : parent?.recurrence
                                  ? storedCadence
                                    ? cadenceLabel(storedCadence)
                                    : "A schedule outside the form's vocabulary"
                                  : 'Standalone event'}
                            </Text>
                          </div>
                          {schedule ? (
                            <>
                              <div className={styles.readOnlyRow}>
                                <Text className={styles.label}>Schedule</Text>
                                <Text>{storedRule ?? schedule.rrule}</Text>
                              </div>
                              <div className={styles.readOnlyRow}>
                                <Text className={styles.label}>From</Text>
                                <Text>{formatDate(schedule.effectiveFrom)}</Text>
                              </div>
                              <div className={styles.readOnlyRow}>
                                <Text className={styles.label}>Ends on</Text>
                                <Text>
                                  {schedule.endsOn ? formatDate(schedule.endsOn) : 'No end date'}
                                </Text>
                              </div>
                            </>
                          ) : null}
                        </div>
                        {!scheduleLocked && parentPeriod && parentPeriod.frequency === null ? (
                          <Text size={200} className={styles.helper}>
                            This period resolved once and stores no rule, so there is no cycle to
                            rewrite here.
                          </Text>
                        ) : null}
                        {!scheduleLocked && parent?.recurrence && !storedRuleInVocabulary ? (
                          <Text size={200} className={styles.helper}>
                            The stored rule sits outside the form’s vocabulary, so it is shown from
                            its stored string rather than edited.
                          </Text>
                        ) : null}
                        {storedScheduleLine ? (
                          // No Preview control here: the officer cannot change this rule, so
                          // there is no authored rule to resolve (FR-42b, FR-42h).
                          <Text size={200} className={styles.helper}>
                            {storedScheduleLine}
                          </Text>
                        ) : null}
                      </>
                    )}
                  </>
                ) : values.repeats ? (
                  <>
                    <ScheduleBuilder
                      value={values.schedule}
                      onChange={patchSchedule}
                      effectiveFrom={values.effectiveFrom}
                      endsOn={values.endsOn}
                      onEndsOnChange={(endsOn) => setField('endsOn', endsOn)}
                      errors={errors}
                      periods={periods}
                      periodsLoading={periodsQuery.isPending}
                      periodsError={periodsQuery.isError}
                    />
                    <SchedulePreview
                      input={previewInput}
                      context={scheduleContext}
                      onPreview={setPreview}
                    />
                  </>
                ) : (
                  <>
                    {errors.occurrences ? (
                      <Text size={200} role="alert" className={styles.error}>
                        {errors.occurrences}
                      </Text>
                    ) : null}

                    <div className={eventStyles.tableWrap}>
                      <Table
                        className={styles.occurrencesTable}
                        size="small"
                        aria-label="Event dates"
                      >
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
                                    onChange={(_, data) =>
                                      setOccurrence(index, 'endTime', data.value)
                                    }
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
              </section>
            </div>

            <aside className={styles.rail} aria-labelledby="event-when-heading">
              <h2 id="event-when-heading" className={styles.sectionTitle}>
                When and where
              </h2>

              <div className={styles.startBlock}>
                {railStart.editable ? (
                  <Field
                    label="Starts on"
                    required
                    hint={railStart.hint}
                    validationState={errors.effectiveFrom ? 'error' : 'none'}
                    validationMessage={errors.effectiveFrom}
                  >
                    <Input
                      type="date"
                      value={values.effectiveFrom}
                      onChange={(_, data) => setStartDate(data.value)}
                    />
                  </Field>
                ) : (
                  <>
                    <Text size={200} className={styles.label}>
                      Starts
                    </Text>
                    <Text className={styles.startValue}>{railStart.value}</Text>
                    <Text size={200} className={styles.helper}>
                      {railStart.hint}
                    </Text>
                  </>
                )}
              </div>

              <div className={styles.railGrid}>
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
                    onOptionSelect={(_, data) =>
                      setField('venueType', asVenueType(data.optionValue))
                    }
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

              <Text size={200} className={styles.helper}>
                {values.repeats
                  ? 'The times apply to every date. A blank end time leaves the session open-ended.'
                  : 'The times apply to every date that leaves them blank; a date row can set its own. A blank end time leaves that session open-ended.'}
              </Text>
            </aside>
          </div>
        </form>
      </div>
    </PageFrame>
  );
}

/** The provenance/cycle line at the foot of Identity (FR-42b). */
function buildCycleLine({
  isEdit,
  storedRule,
  storedRuleInVocabulary,
  parentPeriod,
  heldPeriodSpan,
  values,
  selectedPeriod,
  preview,
  scheduleRrule,
  formatDate,
  formatRange,
}: {
  readonly isEdit: boolean;
  readonly storedRule: string | null;
  readonly storedRuleInVocabulary: boolean;
  readonly parentPeriod: EventParentItem['period'];
  /** The event's held range, formatted: a one-off period's span on an edit. */
  readonly heldPeriodSpan: string;
  readonly values: EventFormValues;
  readonly selectedPeriod: EventPeriodItem | undefined;
  readonly preview: EventPreview | undefined;
  readonly scheduleRrule: string | null;
  readonly formatDate: (value: string | null | undefined) => string;
  readonly formatRange: (from: string | null | undefined, to: string | null | undefined) => string;
}): string {
  if (isEdit) {
    if (parentPeriod)
      return `${periodProvenanceLine(parentPeriod, heldPeriodSpan, selectedPeriod?.dates ?? null)}.`;
    if (storedRule)
      return storedRuleInVocabulary
        ? `${storedRule}.`
        : 'A schedule outside the form’s vocabulary, shown from its stored string.';
    return 'Does not repeat.';
  }

  if (!values.repeats) {
    const dates = values.occurrences
      .map((row) => row.date.trim())
      .filter((date) => date.length > 0)
      .sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (!first) return 'Does not repeat.';
    return `Does not repeat · ${plural(dates.length, 'date', 'dates')}, ${formatDate(first)}${
      last && last !== first ? ` – ${formatDate(last)}` : ''
    }.`;
  }

  if (values.schedule.mode === 'period') {
    // One grammar for both surfaces (round `detail-grammar`, Q6): the name, the
    // span and the frequency, with the catalogue's shape deciding whether a
    // day-less monthly period says "whole week" or makes no span claim at all.
    const period = {
      name: selectedPeriod?.name ?? 'No period chosen',
      frequency: values.schedule.periodFrequency === 'monthly' ? ('monthly' as const) : null,
      day: (values.schedule.periodDay || null) as PeriodDay | null,
    };
    const shape = selectedPeriod?.dates ?? null;
    if (period.frequency === 'monthly') return `${periodProvenanceLine(period, '', shape)}.`;

    // A one-cycle input: the preview's range once it settles, and the chosen
    // cycle month until then - never a date list. The word "cycle" belongs to
    // this caller's span: the create names its input, not a fact.
    const first = preview?.occurrences[0]?.date;
    const last = preview?.occurrences[preview.occurrences.length - 1]?.date;
    const span = first && last ? formatRange(first, last) : `cycle ${values.schedule.cycleMonth}`;
    return `${periodProvenanceLine(period, span, shape)}.`;
  }

  if (!scheduleRrule) return 'Choose the schedule.';
  return `${scheduleRrule} from ${formatDate(values.effectiveFrom)}.`;
}

/** The rail's start date: an input where it is the rule's anchor, else a fact. */
function railStartOf({
  isEdit,
  values,
  parent,
  firstResolvedDate,
  formatDate,
}: {
  readonly isEdit: boolean;
  readonly values: EventFormValues;
  readonly parent: { readonly startDate: string } | undefined;
  readonly firstResolvedDate: string | undefined;
  readonly formatDate: (value: string | null | undefined) => string;
}): { readonly editable: boolean; readonly value: string; readonly hint: string } {
  if (isEdit) {
    // The rail keeps the event's **stored** first date: an authored rule's
    // preview drives the chips and the summary, never this derived fact.
    return {
      editable: false,
      value: parent ? formatDate(parent.startDate) : '—',
      hint: 'The event’s stored first date, derived by the API.',
    };
  }

  if (!values.repeats) {
    const first = firstRowDate(values.occurrences);
    return {
      editable: false,
      value: first ? formatDate(first) : '—',
      hint: 'The earliest date row; the API derives the event’s range from the rows.',
    };
  }

  if (values.schedule.mode === 'period' && values.schedule.periodFrequency === 'one-cycle') {
    return {
      editable: false,
      value: firstResolvedDate ? formatDate(firstResolvedDate) : 'Resolving the dates…',
      hint: 'The period’s first resolved date, from the server preview.',
    };
  }

  return {
    editable: true,
    value: formatDate(values.effectiveFrom),
    hint:
      values.schedule.mode === 'period'
        ? 'Anchors the period’s monthly window. It is a start date, not stored; past dates are never generated.'
        : 'The rule’s first date; its weekday or day is what repeats.',
  };
}

/** The rule in words, for the preview dialog's context line. */
function describeSchedule({
  values,
  selectedPeriod,
  scheduleRrule,
  formatDate,
}: {
  readonly values: EventFormValues;
  readonly selectedPeriod: EventPeriodItem | undefined;
  readonly scheduleRrule: string | null;
  readonly formatDate: (value: string | null | undefined) => string;
}): string {
  if (!values.repeats) return 'Standalone event';

  if (values.schedule.mode === 'period') {
    // The dialog's context line is the period line, so the form cannot describe a
    // day-less monthly period as a "whole period" (Q6); with no catalogue row it
    // makes no span claim at all (Q4).
    const period = {
      name: selectedPeriod?.name ?? 'Named period',
      frequency: values.schedule.periodFrequency === 'monthly' ? ('monthly' as const) : null,
      day: (values.schedule.periodDay || null) as PeriodDay | null,
    };
    const span = period.frequency === 'monthly' ? '' : `one cycle, ${values.schedule.cycleMonth}`;
    return periodProvenanceLine(period, span, selectedPeriod?.dates ?? null);
  }

  return `${scheduleRrule ?? 'Incomplete rule'} · from ${formatDate(values.effectiveFrom)}`;
}
