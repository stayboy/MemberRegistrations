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
  Text,
  Textarea,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { DismissRegular, SaveRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, isUnauthorized } from '../api/errors';
import { listMinistries } from '../api/members';
import { createSeries, getSeries, updateSeries, type SeriesDto } from '../api/series';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';
import {
  SERIES_TIMEZONE_OPTIONS,
  SERIES_TIMEZONE_OTHER,
  createEmptySeriesForm,
  fromSeriesDetail,
  toCreateSeriesPayload,
  toUpdateSeriesPayload,
  validateSeriesForm,
  type SeriesFormErrors,
  type SeriesFormField,
  type SeriesFormValues,
} from '../format/series-form';
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
  helper: {
    color: tokens.colorNeutralForeground3,
  },
  state: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function seriesNameConflict(error: unknown): string | null {
  if (error instanceof ApiError && error.status === 409) {
    return error.message.trim() || 'A series with this name already exists for that ministry.';
  }
  return null;
}

function SeriesFormView({
  isEdit,
  series,
  initial,
}: {
  isEdit: boolean;
  series: SeriesDto | null;
  initial: SeriesFormValues;
}) {
  const styles = useStyles();
  const eventStyles = useEventStyles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [values, setValues] = useState<SeriesFormValues>(initial);
  const [errors, setErrors] = useState<SeriesFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const readOnly = isEdit && Boolean(series?.archivedAt);

  const ministriesQuery = useQuery({
    queryKey: ['ministries', baseUrl],
    queryFn: ({ signal }) => listMinistries(baseUrl, token, signal),
    enabled: Boolean(token),
  });

  const createMutation = useMutation({
    mutationFn: () => createSeries(baseUrl, token, toCreateSeriesPayload(values)),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!series) throw new Error('The series is not loaded.');
      return updateSeries(baseUrl, token, series.id, toUpdateSeriesPayload(values));
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const ministries = ministriesQuery.data ?? [];
  const selectedMinistry = ministries.find((ministry) => ministry.code === values.ministryCode);
  const ministryLabel = selectedMinistry
    ? `${selectedMinistry.code} · ${selectedMinistry.name}`
    : values.ministryCode || 'No ministry';
  const timezoneLabel =
    SERIES_TIMEZONE_OPTIONS.find((option) => option.value === values.timezoneSelection)?.label ??
    'Other timezone';

  useEffect(() => {
    if (isUnauthorized(ministriesQuery.error)) void signOut();
  }, [ministriesQuery.error, signOut]);

  function setField<Key extends SeriesFormField>(key: Key, value: SeriesFormValues[Key]): void {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function selectTimezone(selection: string): void {
    if (selection === SERIES_TIMEZONE_OTHER) {
      setValues((current) => ({
        ...current,
        timezoneSelection: SERIES_TIMEZONE_OTHER,
        timezone: '',
      }));
    } else {
      setValues((current) => ({
        ...current,
        timezoneSelection: selection,
        timezone: selection,
      }));
    }
    setErrors((current) => {
      if (!current.timezone) return current;
      const next = { ...current };
      delete next.timezone;
      return next;
    });
  }

  function submit(): void {
    if (isSaving || readOnly) return;

    const nextErrors = validateSeriesForm(values, { requireSchedule: !isEdit });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFormError(null);

    if (!isEdit) {
      createMutation.mutate(undefined, {
        onSuccess: (created) => {
          void queryClient.invalidateQueries({ queryKey: ['series', baseUrl] });
          navigate(`/events/series/${encodeURIComponent(created.id)}`);
        },
        onError: (error: unknown) => {
          if (isUnauthorized(error)) {
            void signOut();
            return;
          }
          const conflict = seriesNameConflict(error);
          if (conflict) {
            setErrors({ name: conflict });
            return;
          }
          setFormError(errorMessage(error));
        },
      });
      return;
    }

    updateMutation.mutate(undefined, {
      onSuccess: (updated) => {
        void queryClient.invalidateQueries({ queryKey: ['series', baseUrl] });
        navigate(`/events/series/${encodeURIComponent(updated.id)}`);
      },
      onError: (error: unknown) => {
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        const conflict = seriesNameConflict(error);
        if (conflict) {
          setErrors({ name: conflict });
          return;
        }
        setFormError(errorMessage(error));
      },
    });
  }

  function cancel(): void {
    if (isEdit && series) navigate(`/events/series/${encodeURIComponent(series.id)}`);
    else navigate('/events/series');
  }

  const title = isEdit ? 'Edit series' : 'New series';
  const description = isEdit
    ? 'Update the identity fields. Schedule versions are appended from the series detail, never rewritten here.'
    : 'Create the series and its first schedule version. Later versions are appended from the series detail.';

  return (
    <PageFrame
      sectionId="events"
      title={title}
      submenu={title}
      description={description}
      controls={
        <>
          <Button icon={<DismissRegular />} appearance="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button
            icon={<SaveRegular />}
            appearance="primary"
            onClick={submit}
            disabled={isSaving || readOnly}
          >
            {isEdit ? 'Save changes' : 'Create series'}
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
          {readOnly ? (
            <MessageBar intent="warning">
              <MessageBarBody>
                <MessageBarTitle>This series is archived</MessageBarTitle>
                Restore it from the series detail before editing. Its name, ministry, timezone,
                description, schedule versions and exceptions are kept.
              </MessageBarBody>
            </MessageBar>
          ) : null}
          {formError ? (
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>The series was not saved</MessageBarTitle>
                {formError}
              </MessageBarBody>
            </MessageBar>
          ) : null}
          <section className={styles.section} aria-labelledby="series-identity-heading">
            <div className={styles.sectionHeader}>
              <h2 id="series-identity-heading" className={styles.sectionTitle}>
                Identity
              </h2>
              <Text size={200} className={styles.helper}>
                The name is unique per ministry. The timezone decides which calendar date counts as
                today for this series.
              </Text>
            </div>

            <div className={styles.grid}>
              <Field
                label="Name"
                required
                validationState={errors.name ? 'error' : 'none'}
                validationMessage={errors.name}
                hint="Up to 120 characters."
              >
                <Input
                  value={values.name}
                  maxLength={120}
                  disabled={readOnly}
                  onChange={(_, data) => setField('name', data.value)}
                />
              </Field>

              <Field
                label="Ministry (optional)"
                validationState={errors.ministryCode ? 'error' : 'none'}
                validationMessage={errors.ministryCode}
                hint="Leave as No ministry when the series belongs to the whole church."
              >
                <Dropdown
                  value={ministryLabel}
                  selectedOptions={values.ministryCode ? [values.ministryCode] : []}
                  disabled={readOnly || ministriesQuery.isPending}
                  onOptionSelect={(_, data) => {
                    setField('ministryCode', data.optionValue ?? '');
                  }}
                >
                  <Option value="">No ministry</Option>
                  {ministries.map((ministry) => (
                    <Option
                      key={ministry.code}
                      value={ministry.code}
                      text={`${ministry.code} · ${ministry.name}`}
                    >
                      {ministry.code} · {ministry.name}
                    </Option>
                  ))}
                </Dropdown>
              </Field>

              <Field
                label="Timezone"
                required
                validationState={errors.timezone ? 'error' : 'none'}
                validationMessage={errors.timezone}
                hint="The series uses this timezone only to decide today; dates stay UTC calendar dates."
              >
                <Dropdown
                  value={readOnly ? values.timezone : timezoneLabel}
                  selectedOptions={[values.timezoneSelection]}
                  disabled={readOnly}
                  onOptionSelect={(_, data) => selectTimezone(data.optionValue ?? 'UTC')}
                >
                  {SERIES_TIMEZONE_OPTIONS.map((option) => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                  <Option value={SERIES_TIMEZONE_OTHER}>Other timezone…</Option>
                </Dropdown>
              </Field>

              {values.timezoneSelection === SERIES_TIMEZONE_OTHER ? (
                <Field
                  label="Custom timezone"
                  required
                  validationState={errors.timezone ? 'error' : 'none'}
                  validationMessage={errors.timezone}
                  hint="An IANA name such as Asia/Tokyo or Africa/Accra."
                >
                  <Input
                    value={values.timezone}
                    maxLength={64}
                    disabled={readOnly}
                    placeholder="Asia/Tokyo"
                    onChange={(_, data) => setField('timezone', data.value)}
                  />
                </Field>
              ) : null}
            </div>

            <Field
              label="Description (optional)"
              validationState={errors.description ? 'error' : 'none'}
              validationMessage={errors.description}
              hint="Up to 500 characters."
            >
              <Textarea
                value={values.description}
                rows={3}
                resize="vertical"
                maxLength={500}
                disabled={readOnly}
                onChange={(_, data) => setField('description', data.value)}
              />
            </Field>

            {ministriesQuery.isError ? (
              <MessageBar intent="warning">
                <MessageBarBody>
                  <MessageBarTitle>The ministry list is unavailable</MessageBarTitle>
                  The series can still be saved without a ministry.{' '}
                  {errorMessage(ministriesQuery.error)}
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </section>
          {isEdit ? (
            <Text size={200} className={styles.helper}>
              Schedule versions and exceptions are append-only. Open the series detail to add a
              version or an exception.
            </Text>
          ) : (
            <section className={styles.section} aria-labelledby="series-schedule-heading">
              <div className={styles.sectionHeader}>
                <h2 id="series-schedule-heading" className={styles.sectionTitle}>
                  First schedule version
                </h2>
                <Text size={200} className={styles.helper}>
                  The API resolves this RRULE into occurrences. The browser never expands it.
                </Text>
              </div>

              <div className={styles.grid}>
                <Field
                  label="Effective from"
                  required
                  validationState={errors.effectiveFrom ? 'error' : 'none'}
                  validationMessage={errors.effectiveFrom}
                  hint="UTC date. This version applies from this date until a later version starts."
                >
                  <Input
                    type="date"
                    value={values.effectiveFrom}
                    onChange={(_, data) => setField('effectiveFrom', data.value)}
                  />
                </Field>

                <Field
                  label="Recurrence rule"
                  required
                  validationState={errors.rrule ? 'error' : 'none'}
                  validationMessage={errors.rrule}
                  hint="Examples: FREQ=WEEKLY;BYDAY=SU · FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE · FREQ=MONTHLY;BYMONTHDAY=15"
                >
                  <Input
                    value={values.rrule}
                    maxLength={200}
                    placeholder="FREQ=WEEKLY;BYDAY=SU"
                    onChange={(_, data) => setField('rrule', data.value)}
                  />
                </Field>

                <Field
                  label="Ends on (optional)"
                  validationState={errors.endsOn ? 'error' : 'none'}
                  validationMessage={errors.endsOn}
                  hint="UTC date. Leave blank when the series has no planned end."
                >
                  <Input
                    type="date"
                    value={values.endsOn}
                    min={values.effectiveFrom || undefined}
                    onChange={(_, data) => setField('endsOn', data.value)}
                  />
                </Field>
              </div>
            </section>
          )}
        </form>
      </div>
    </PageFrame>
  );
}

/**
 * Events → Series → New/Edit (FR-42). Create submits the identity and the first
 * schedule version in one POST; edit submits identity fields only. Schedule
 * versions and exceptions are appended from the detail page.
 */
export function SeriesFormPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const detailQuery = useQuery({
    queryKey: ['series', baseUrl, 'detail', id],
    queryFn: ({ signal }) => getSeries(baseUrl, token, id ?? '', signal),
    enabled: isEdit && Boolean(token) && Boolean(id),
  });

  useEffect(() => {
    if (isUnauthorized(detailQuery.error)) void signOut();
  }, [detailQuery.error, signOut]);

  if (!isEdit) {
    return (
      <SeriesFormView
        key="new-series"
        isEdit={false}
        series={null}
        initial={createEmptySeriesForm()}
      />
    );
  }

  if (detailQuery.isPending) {
    return (
      <PageFrame sectionId="events" title="Edit series" submenu="Edit series">
        <div className={styles.state}>
          <Spinner label="Loading series…" />
        </div>
      </PageFrame>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <PageFrame sectionId="events" title="Edit series" submenu="Edit series">
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The series could not be loaded</MessageBarTitle>
            {errorMessage(detailQuery.error)}
            <Button
              size="small"
              appearance="transparent"
              onClick={() => {
                void detailQuery.refetch();
              }}
            >
              Retry
            </Button>
          </MessageBarBody>
        </MessageBar>
        <Button appearance="secondary" onClick={() => navigate('/events/series')}>
          Back to series
        </Button>
      </PageFrame>
    );
  }

  return (
    <SeriesFormView
      key={detailQuery.data.id}
      isEdit
      series={detailQuery.data}
      initial={fromSeriesDetail(detailQuery.data)}
    />
  );
}
