import {
  Dropdown,
  Field,
  Input,
  Label,
  Option,
  Radio,
  RadioGroup,
  Spinner,
  Text,
  ToggleButton,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { type EventPeriodItem } from '../api/events';
import { InfoTooltip } from './InfoTooltip';
import {
  defaultCycleMonth,
  periodShapeOf,
  type EventFormErrors,
  type EventScheduleForm,
  type PeriodFrequency,
} from '../format/event-form';
import { PERIOD_DAY_LABELS, PERIOD_DAYS, isPeriodDay } from '../format/period';
import {
  CADENCE_OPTIONS,
  MONTH_POSITIONS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  type MonthPosition,
  type RecurrenceCadence,
  type WeekdayCode,
} from '../format/rrule';

/**
 * The two frequencies in a sentence or two, carried by the info glyph's tooltip
 * (the owner's drawing): the radios say only what they are named.
 */
const FREQUENCY_EXPLANATION =
  'One cycle resolves the period once, for a single month. Monthly stores the period rule and generates one date per cycle over the same 90-day window a recurrence uses.';

/** The info glyph's accessible name; its tooltip is {@link FREQUENCY_EXPLANATION}. */
const FREQUENCY_INFO_LABEL = 'What the frequency means';

/**
 * The day control's explanation likewise rides an info glyph's tooltip rather
 * than a hint line under the select (the owner's drawing).
 */
const PERIOD_DAY_EXPLANATION =
  'Leave blank for the whole period; pick a weekday for one date per cycle.';

/** The day glyph's accessible name; its tooltip is {@link PERIOD_DAY_EXPLANATION}. */
const PERIOD_DAY_INFO_LABEL = 'What the day inside the period means';

/**
 * The named-period select's explanation likewise rides an info glyph's tooltip
 * rather than a hint line under the select (owner, 2026-11-26). The copy is the
 * form's own: it says what picking a period does to the arm, not what a period is.
 */
const NAMED_PERIOD_EXPLANATION =
  'A named period replaces the cadence. The API resolves its dates, not this form.';

/** The period glyph's accessible name; its tooltip is {@link NAMED_PERIOD_EXPLANATION}. */
const NAMED_PERIOD_INFO_LABEL = 'What a named period means';

const useStyles = makeStyles({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  two: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  cadence: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalXL,
    flexWrap: 'wrap',
  },
  /**
   * The period arm's one row: the named period stretches and the arm's own field
   * (the cycle month or the day inside it) sits beside it, as drawn.
   */
  periodRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  /** The frequency row sits under that one: label, explanation, then the radios. */
  frequencyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
  },
  /** A visible label with its info glyph after it, on one line. */
  labelWithInfo: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  days: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  interval: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    maxWidth: '180px',
  },
  intervalInput: {
    width: '72px',
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
  definition: {
    color: tokens.colorNeutralForeground2,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
});

function asRecurrenceCadence(value: string | undefined): RecurrenceCadence {
  return CADENCE_OPTIONS.find((option) => option.value === value)?.value ?? 'weekly';
}

function asWeekday(value: string | undefined): WeekdayCode {
  return WEEKDAYS.find((day) => day === value) ?? 'MO';
}

function asPosition(value: string | undefined): MonthPosition {
  return MONTH_POSITIONS.find((position) => position === value) ?? 'first';
}

/** The unit the interval counts, by cadence. */
function intervalUnit(cadence: RecurrenceCadence): string {
  return cadence === 'daily' ? 'days' : 'weeks';
}

export interface ScheduleBuilderProps {
  readonly value: EventScheduleForm;
  readonly onChange: (patch: Partial<EventScheduleForm>) => void;
  /** The rail's start date: the rule's first date, or a period recurrence's anchor. */
  readonly effectiveFrom: string;
  readonly endsOn: string;
  readonly onEndsOnChange: (value: string) => void;
  readonly errors: EventFormErrors;
  /** The named-period catalogue, read by the call site (it shows the same names). */
  readonly periods: readonly EventPeriodItem[];
  readonly periodsLoading?: boolean;
  readonly periodsError?: boolean;
  /** The locked edit state renders the same controls inert (AC 19). */
  readonly readOnly?: boolean;
  /**
   * The edit route's fixed arm (FR-42b, FR-42h): the event's type is chosen at
   * create, so the builder authors only that arm and never offers the other.
   * Unset on the create, where both arms are the officer's choice.
   */
  readonly fixedArm?: 'rule' | 'period';
}

/**
 * The one schedule builder (FR-42f, AC-63): the create form's call site today,
 * and the detail dialog's when that surface adopts it. It authors the closed
 * vocabulary — daily, weekly (a weekday set), fortnightly, monthly on the day or
 * positionally — and the **named-period mode**, which replaces the cadence
 * controls because a period event submits a period, never an rrule. The period
 * arm reads the catalogue's `dates` projection to hide the day control for a
 * single-date period, and it carries its own seven labels (`MON`-`SUN`, from
 * `format/period`) rather than the rrule's `MO`-`SU` set, so no day value ever
 * crosses between the two vocabularies. It never accepts a raw rule and never
 * resolves a date: the preview endpoint is the only resolver (AC-63a).
 *
 * Presentational by design: the call site owns the catalogue read, because the
 * form's cycle line and the dialog both name the selected period too.
 */
export function ScheduleBuilder({
  value,
  onChange,
  effectiveFrom,
  endsOn,
  onEndsOnChange,
  errors,
  periods,
  periodsLoading = false,
  periodsError = false,
  readOnly = false,
  fixedArm,
}: ScheduleBuilderProps) {
  const styles = useStyles();

  const selectedPeriod = periods.find((period) => period.id === value.periodId);
  const dates = periodShapeOf(value, selectedPeriod?.dates);

  const cadenceLabelText =
    CADENCE_OPTIONS.find((option) => option.value === value.cadence)?.label ?? 'Weekly';

  // The one period select, handed to whichever arm is mounted: the rule mode's
  // grid, or the period mode's own row. Both arms never hold a copy at once.
  const namedPeriod =
    fixedArm === undefined ? (
      <NamedPeriodField
        value={value}
        onChange={onChange}
        effectiveFrom={effectiveFrom}
        periods={periods}
        loading={periodsLoading}
        readOnly={readOnly}
        error={errors.period}
      />
    ) : null;

  return (
    <div className={styles.stack}>
      {value.mode === 'rule' ? (
        <div className={styles.grid}>
          {namedPeriod}

          <Field label="Repeats" required>
            <Dropdown
              aria-label="Repeats"
              value={cadenceLabelText}
              selectedOptions={[value.cadence]}
              disabled={readOnly}
              onOptionSelect={(_, data) => {
                const cadence = asRecurrenceCadence(data.optionValue);
                // Fortnightly is the weekly rule at an interval of two; the
                // others reset to one so a stale interval cannot follow a
                // cadence the operator did not mean.
                onChange({
                  cadence,
                  interval:
                    cadence === value.cadence
                      ? value.interval
                      : cadence === 'fortnightly'
                        ? '2'
                        : '1',
                });
              }}
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
              value={endsOn}
              readOnly={readOnly}
              min={effectiveFrom || undefined}
              onChange={(_, data) => onEndsOnChange(data.value)}
            />
          </Field>
        </div>
      ) : null}

      {periodsLoading ? <Spinner size="tiny" /> : null}

      {periodsError ? (
        <Text size={200} role="alert" className={styles.error}>
          The period catalogue is unavailable. Repeat by rule still works.
        </Text>
      ) : null}

      {value.mode === 'period' ? (
        <PeriodControls
          value={value}
          onChange={onChange}
          period={selectedPeriod}
          dates={dates}
          namedPeriod={namedPeriod}
          frequencyLocked={fixedArm === 'period'}
          errors={errors}
          readOnly={readOnly}
        />
      ) : (
        <RuleControls value={value} onChange={onChange} errors={errors} readOnly={readOnly} />
      )}
    </div>
  );
}

/**
 * The one named-period select (FR-42f). Both arms render it — the rule mode's
 * grid and the period mode's own row — but only one is ever mounted. Picking
 * "None" hands the form back to the rule arm.
 */
function NamedPeriodField({
  value,
  onChange,
  effectiveFrom,
  periods,
  loading,
  readOnly,
  error,
}: {
  readonly value: EventScheduleForm;
  readonly onChange: (patch: Partial<EventScheduleForm>) => void;
  /** The rail's start date: the period's cycle defaults from it. */
  readonly effectiveFrom: string;
  readonly periods: readonly EventPeriodItem[];
  readonly loading: boolean;
  readonly readOnly: boolean;
  readonly error: string | undefined;
}) {
  const styles = useStyles();
  const selectedPeriod = periods.find((period) => period.id === value.periodId);

  function choosePeriod(periodId: string): void {
    if (periodId.length === 0) {
      onChange({ mode: 'rule', periodId: '', periodDates: null, periodDay: '' });
      return;
    }

    const period: EventPeriodItem | undefined = periods.find((item) => item.id === periodId);
    // The catalogue's `dates` is the contract's own projection of the resolver's
    // shape, so the form never re-derives whether a period takes a day.
    const dates = period?.dates ?? null;
    onChange({
      mode: 'period',
      periodId,
      periodDates: dates,
      cycleMonth: defaultCycleMonth(effectiveFrom),
      // A single-date period takes no day (Home Cells); a week starts blank.
      periodDay: dates === 'date' ? '' : value.periodDay,
    });
  }

  return (
    <Field
      label={
        <span className={styles.labelWithInfo}>
          Named period
          <InfoTooltip name={NAMED_PERIOD_INFO_LABEL} explanation={NAMED_PERIOD_EXPLANATION} />
        </span>
      }
      validationMessage={error}
      validationState={error ? 'error' : 'none'}
    >
      <Dropdown
        aria-label="Named period"
        value={selectedPeriod?.name ?? 'None'}
        selectedOptions={[value.periodId]}
        disabled={readOnly || loading}
        onOptionSelect={(_, data) => choosePeriod(data.optionValue ?? '')}
      >
        <Option value="" text="None">
          None — repeat by rule
        </Option>
        {periods.map((period) => (
          <Option key={period.id} value={period.id} text={period.name}>
            {period.name}
          </Option>
        ))}
      </Dropdown>
    </Field>
  );
}

/**
 * The period arm: one cycle, or a monthly period recurrence inside the period.
 * The owner's drawing puts the period select and the arm's own field on one row
 * (the select stretching, the arm's field beside it) and the frequency directly
 * beneath it, inline — label, an info glyph with the explanation, then the two
 * radios, which carry only their own names.
 */
function PeriodControls({
  value,
  onChange,
  period,
  dates,
  namedPeriod,
  frequencyLocked,
  errors,
  readOnly,
}: {
  readonly value: EventScheduleForm;
  readonly onChange: (patch: Partial<EventScheduleForm>) => void;
  readonly period: EventPeriodItem | undefined;
  /** The form's own `periodDates`: set when a period is picked, or seeded on edit. */
  readonly dates: 'week' | 'date' | null;
  /** The shared period select, or null on the edit route, where the period is fixed. */
  readonly namedPeriod: ReactNode;
  /** The edit route's stored period rule: the frequency cannot change (FR-42h). */
  readonly frequencyLocked: boolean;
  readonly errors: EventFormErrors;
  readonly readOnly: boolean;
}) {
  const styles = useStyles();
  const frequency = frequencyLocked ? 'monthly' : value.periodFrequency;

  return (
    <div className={styles.stack}>
      <div className={namedPeriod ? styles.periodRow : styles.grid}>
        {namedPeriod}

        {frequency === 'one-cycle' ? (
          <Field
            label="Cycle month"
            required
            hint="The month the period resolves in; it defaults to the next cycle, never a past one."
            validationState={errors.cycleMonth ? 'error' : 'none'}
            validationMessage={errors.cycleMonth}
          >
            <Input
              type="month"
              value={value.cycleMonth}
              readOnly={readOnly}
              onChange={(_, data) => onChange({ cycleMonth: data.value })}
            />
          </Field>
        ) : dates === 'date' ? (
          // A single-date period resolves to one date, so there is no day inside
          // it to choose: the control is absent, not disabled (FR-42f).
          <Text size={200} className={styles.hint}>
            {period?.name ?? 'This period'} resolves to a single date, so there is no day inside it
            to choose.
          </Text>
        ) : (
          <Field
            label={
              <span className={styles.labelWithInfo}>
                Day inside the period (optional)
                <InfoTooltip name={PERIOD_DAY_INFO_LABEL} explanation={PERIOD_DAY_EXPLANATION} />
              </span>
            }
            validationState={errors.periodDay ? 'error' : 'none'}
            validationMessage={errors.periodDay}
          >
            <Dropdown
              aria-label="Day inside the period"
              value={value.periodDay ? PERIOD_DAY_LABELS[value.periodDay] : 'Whole period'}
              selectedOptions={[value.periodDay]}
              disabled={readOnly}
              onOptionSelect={(_, data) =>
                onChange({ periodDay: isPeriodDay(data.optionValue) ? data.optionValue : '' })
              }
            >
              <Option value="" text="Whole period">
                Whole period
              </Option>
              {PERIOD_DAYS.map((day) => (
                <Option key={day} value={day} text={PERIOD_DAY_LABELS[day]}>
                  {PERIOD_DAY_LABELS[day]}
                </Option>
              ))}
            </Dropdown>
          </Field>
        )}
      </div>

      <div className={styles.frequencyRow}>
        <span className={styles.labelWithInfo}>
          <Label id="event-period-frequency" size="small">
            Frequency
          </Label>
          {/*
            The info glyph is the row's only explanation: it carries the sentence
            on both frequencies, so the radios never repeat it as sub-labels.
          */}
          <InfoTooltip name={FREQUENCY_INFO_LABEL} explanation={FREQUENCY_EXPLANATION} />
        </span>

        {frequencyLocked ? (
          <Text size={200}>Monthly — one date per cycle, generated</Text>
        ) : (
          <RadioGroup
            aria-labelledby="event-period-frequency"
            layout="horizontal"
            value={value.periodFrequency}
            disabled={readOnly}
            onChange={(_, data) => onChange({ periodFrequency: data.value as PeriodFrequency })}
          >
            <Radio value="one-cycle" label="One cycle" />
            <Radio value="monthly" label="Monthly" />
          </RadioGroup>
        )}
      </div>

      {period ? (
        <Text size={200} className={styles.definition}>
          {period.definition}
        </Text>
      ) : null}

      <Text size={200} className={styles.hint}>
        {frequency === 'one-cycle'
          ? 'One cycle resolves once, on the server, into that month’s dates; the event stores the period it came from and its name as it was written.'
          : 'Monthly stores the period rule on the event and generates one date per cycle over the same 90-day window a recurrence uses; no rrule is involved.'}
      </Text>
    </div>
  );
}

/** The rule arm: the closed cadence vocabulary, never a raw rrule. */
function RuleControls({
  value,
  onChange,
  errors,
  readOnly,
}: {
  readonly value: EventScheduleForm;
  readonly onChange: (patch: Partial<EventScheduleForm>) => void;
  readonly errors: EventFormErrors;
  readonly readOnly: boolean;
}) {
  const styles = useStyles();
  const showWeekdays = value.cadence === 'weekly' || value.cadence === 'fortnightly';

  function toggleWeekday(day: WeekdayCode): void {
    const next = value.weekdays.includes(day)
      ? value.weekdays.filter((chosen) => chosen !== day)
      : [...value.weekdays, day];
    onChange({ weekdays: WEEKDAYS.filter((candidate) => next.includes(candidate)) });
  }

  return (
    <div className={styles.stack}>
      {value.cadence === 'daily' ? (
        <div className={styles.interval}>
          <Field
            label="Every"
            validationState={errors.interval ? 'error' : 'none'}
            validationMessage={errors.interval}
          >
            <Input
              type="number"
              min={1}
              max={7}
              aria-label="Interval in days"
              className={styles.intervalInput}
              value={value.interval}
              readOnly={readOnly}
              onChange={(_, data) => onChange({ interval: data.value })}
            />
          </Field>
          <Text size={200} className={styles.hint}>
            {intervalUnit(value.cadence)}
          </Text>
        </div>
      ) : null}

      {showWeekdays ? (
        <div className={styles.cadence}>
          <div>
            <Text size={200} className={styles.hint} id="event-weekdays-label">
              Repeat on
            </Text>
            <div className={styles.days} role="group" aria-labelledby="event-weekdays-label">
              {WEEKDAYS.map((day) => (
                <ToggleButton
                  key={day}
                  size="small"
                  aria-label={WEEKDAY_LABELS[day]}
                  title={WEEKDAY_LABELS[day]}
                  checked={value.weekdays.includes(day)}
                  disabled={readOnly}
                  onClick={() => toggleWeekday(day)}
                >
                  {day}
                </ToggleButton>
              ))}
            </div>
            {errors.weekdays ? (
              <Text size={200} role="alert" className={styles.error}>
                {errors.weekdays}
              </Text>
            ) : null}
          </div>

          <div className={styles.interval}>
            <Field
              label="Every"
              validationState={errors.interval ? 'error' : 'none'}
              validationMessage={errors.interval}
            >
              <Input
                type="number"
                min={1}
                max={4}
                aria-label="Interval in weeks"
                className={styles.intervalInput}
                value={value.interval}
                readOnly={readOnly}
                onChange={(_, data) => onChange({ interval: data.value })}
              />
            </Field>
            <Text size={200} className={styles.hint}>
              {intervalUnit(value.cadence)}
            </Text>
          </div>
        </div>
      ) : null}

      {value.cadence === 'monthly' ? (
        <MonthlyControls value={value} onChange={onChange} errors={errors} readOnly={readOnly} />
      ) : null}

      <Text size={200} className={styles.hint}>
        {value.cadence === 'daily'
          ? 'The list labels this schedule “Daily” at an interval of 1 and “Every 3 days” at 3.'
          : showWeekdays
            ? 'The church week runs Sunday to Saturday, so an interval is counted from Sunday.'
            : 'Monthly on the day is a fixed date, so the 31st skips short months.'}
      </Text>
    </div>
  );
}

/** Monthly on the day, or the first/last named weekday of the month. */
function MonthlyControls({
  value,
  onChange,
  errors,
  readOnly,
}: {
  readonly value: EventScheduleForm;
  readonly onChange: (patch: Partial<EventScheduleForm>) => void;
  readonly errors: EventFormErrors;
  readonly readOnly: boolean;
}) {
  const styles = useStyles();

  return (
    <div className={styles.stack}>
      <RadioGroup
        aria-label="Monthly on"
        value={value.monthlyMode}
        disabled={readOnly}
        onChange={(_, data) => onChange({ monthlyMode: data.value as 'day' | 'position' })}
      >
        <Radio value="day" label="On a day of the month" />
        <Radio value="position" label="On the first or last weekday of the month" />
      </RadioGroup>

      {value.monthlyMode === 'day' ? (
        <div className={styles.interval}>
          <Field
            label="Day of the month"
            validationState={errors.dayOfMonth ? 'error' : 'none'}
            validationMessage={errors.dayOfMonth}
          >
            <Input
              type="number"
              min={1}
              max={31}
              aria-label="Day of the month"
              className={styles.intervalInput}
              value={value.dayOfMonth}
              readOnly={readOnly}
              onChange={(_, data) => onChange({ dayOfMonth: data.value })}
            />
          </Field>
        </div>
      ) : (
        <div className={styles.two}>
          <Field label="Which one" required>
            <Dropdown
              aria-label="Which one"
              value={value.position === 'first' ? 'First' : 'Last'}
              selectedOptions={[value.position]}
              disabled={readOnly}
              onOptionSelect={(_, data) => onChange({ position: asPosition(data.optionValue) })}
            >
              <Option value="first">First</Option>
              <Option value="last">Last</Option>
            </Dropdown>
          </Field>

          <Field
            label="Weekday"
            required
            validationState={errors.position ? 'error' : 'none'}
            validationMessage={errors.position}
          >
            <Dropdown
              aria-label="Weekday"
              value={WEEKDAY_LABELS[value.positionWeekday]}
              selectedOptions={[value.positionWeekday]}
              disabled={readOnly}
              onOptionSelect={(_, data) =>
                onChange({ positionWeekday: asWeekday(data.optionValue) })
              }
            >
              {WEEKDAYS.map((day) => (
                <Option key={day} value={day} text={WEEKDAY_LABELS[day]}>
                  {WEEKDAY_LABELS[day]}
                </Option>
              ))}
            </Dropdown>
          </Field>
        </div>
      )}
    </div>
  );
}
