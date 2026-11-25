import {
  Dropdown,
  Field,
  Input,
  Option,
  Radio,
  RadioGroup,
  Spinner,
  Text,
  ToggleButton,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { type EventPeriodItem } from '../api/events';
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

  const cadenceLabelText =
    CADENCE_OPTIONS.find((option) => option.value === value.cadence)?.label ?? 'Weekly';
  const periodName = selectedPeriod?.name ?? 'None';

  return (
    <div className={styles.stack}>
      <div className={styles.grid}>
        {fixedArm === undefined ? (
          <Field
            label="Named period"
            hint="A named period replaces the cadence. The API resolves its dates, not this form."
            validationMessage={errors.period}
            validationState={errors.period ? 'error' : 'none'}
          >
            <Dropdown
              aria-label="Named period"
              value={periodName}
              selectedOptions={[value.periodId]}
              disabled={readOnly || periodsLoading}
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
        ) : null}

        {value.mode === 'rule' ? (
          <>
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
          </>
        ) : null}
      </div>

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

/** The period arm: one cycle, or a monthly period recurrence inside the period. */
function PeriodControls({
  value,
  onChange,
  period,
  dates,
  frequencyLocked,
  errors,
  readOnly,
}: {
  readonly value: EventScheduleForm;
  readonly onChange: (patch: Partial<EventScheduleForm>) => void;
  readonly period: EventPeriodItem | undefined;
  /** The form's own `periodDates`: set when a period is picked, or seeded on edit. */
  readonly dates: 'week' | 'date' | null;
  /** The edit route's stored period rule: the frequency cannot change (FR-42h). */
  readonly frequencyLocked: boolean;
  readonly errors: EventFormErrors;
  readonly readOnly: boolean;
}) {
  const styles = useStyles();
  const frequency = frequencyLocked ? 'monthly' : value.periodFrequency;

  return (
    <div className={styles.stack}>
      <div className={styles.two}>
        {frequencyLocked ? (
          <div>
            <Text size={200} className={styles.hint}>
              Frequency
            </Text>
            <Text>Monthly — one date per cycle, generated</Text>
          </div>
        ) : (
          <Field label="Frequency" required>
            <RadioGroup
              aria-label="Frequency"
              value={value.periodFrequency}
              disabled={readOnly}
              onChange={(_, data) => onChange({ periodFrequency: data.value as PeriodFrequency })}
            >
              <Radio value="one-cycle" label="One cycle — a single month, resolved once" />
              <Radio value="monthly" label="Monthly — one date per cycle, generated" />
            </RadioGroup>
          </Field>
        )}

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
            label="Day inside the period (optional)"
            hint="Leave it blank to schedule the whole period, all seven dates."
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
