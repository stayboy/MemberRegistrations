import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Text,
} from '@fluentui/react-components';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { isUnauthorized } from '../api/errors';
import { addEventScheduleVersion, type AddEventScheduleVersionInput } from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { utcToday } from '../format/member-form';
import {
  CADENCE_OPTIONS,
  toRrule,
  type RecurrenceCadence,
  type RecurrenceChoice,
} from '../format/rrule';
import { writeFailure, type WriteFailure } from '../format/write-errors';
import { useEventStyles } from './events-styles';

const EFFECTIVE_FROM_REQUIRED = 'Choose the first date this version applies to.';

interface FormErrors {
  effectiveFrom?: string;
  endsOn?: string;
}

function validate(values: { readonly effectiveFrom: string; readonly endsOn: string }): FormErrors {
  const errors: FormErrors = {};
  if (!values.effectiveFrom) errors.effectiveFrom = EFFECTIVE_FROM_REQUIRED;
  if (values.endsOn && values.effectiveFrom && values.endsOn < values.effectiveFrom) {
    errors.endsOn = 'The end date must not be before the effective date.';
  }
  return errors;
}

function asCadence(value: string | undefined): RecurrenceCadence {
  return value === 'daily' || value === 'fortnightly' || value === 'monthly' ? value : 'weekly';
}

/**
 * Call site: EventDetailPage's recurrence panel (FR-42e/FR-42f, AC-63). One
 * `POST …/recurrence/versions` appends a version; earlier versions are never
 * edited or removed. The cadence comes from the closed vocabulary and the
 * `rrule` is built by `toRrule` from the effective date, so no raw RRULE is ever
 * typed here.
 */
export function AddScheduleVersionDialog({
  eventId,
  onClose,
  onSaved,
}: {
  eventId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const styles = useEventStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const [effectiveFrom, setEffectiveFrom] = useState(() => utcToday());
  const [cadence, setCadence] = useState<RecurrenceCadence>('weekly');
  const [endsOn, setEndsOn] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [failure, setFailure] = useState<WriteFailure | null>(null);

  const mutation = useMutation({
    mutationFn: (input: AddEventScheduleVersionInput) =>
      addEventScheduleVersion(baseUrl, token, eventId, input),
  });

  function update(next: {
    effectiveFrom?: string;
    cadence?: RecurrenceCadence;
    endsOn?: string;
  }): void {
    if (next.effectiveFrom !== undefined) setEffectiveFrom(next.effectiveFrom);
    if (next.cadence !== undefined) setCadence(next.cadence);
    if (next.endsOn !== undefined) setEndsOn(next.endsOn);
    setErrors({});
    setFailure(null);
  }

  function submit(): void {
    if (mutation.isPending) return;

    const nextErrors = validate({ effectiveFrom, endsOn });
    const choice: RecurrenceChoice = { cadence, effectiveFrom };
    const rrule = toRrule(choice);
    if (!rrule) nextErrors.effectiveFrom = EFFECTIVE_FROM_REQUIRED;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !rrule) return;

    setFailure(null);
    mutation.mutate(
      { effectiveFrom, rrule, endsOn: endsOn || null },
      {
        onSuccess: () => {
          onSaved();
          onClose();
        },
        onError: (error: unknown) => {
          if (isUnauthorized(error)) {
            void signOut();
            return;
          }
          setFailure(writeFailure(error, 'The schedule version was not added'));
        },
      },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open && !mutation.isPending) onClose();
      }}
    >
      <DialogSurface aria-label="Add schedule version">
        <DialogBody>
          <DialogTitle>Add schedule version</DialogTitle>
          <DialogContent className={styles.dialogContent}>
            <Text size={200} className={styles.muted}>
              Versions are appended. Earlier versions keep their dates; a new version changes what
              the API generates from its effective date onwards.
            </Text>

            <Field
              label="Effective from"
              required
              hint="UTC date. This version applies from this date until the next version starts."
              validationState={errors.effectiveFrom ? 'error' : 'none'}
              validationMessage={errors.effectiveFrom}
            >
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(_, data) => update({ effectiveFrom: data.value })}
              />
            </Field>

            <Field
              label="Repeats"
              required
              hint="The weekday, or the day of the month, comes from the effective date."
            >
              <Dropdown
                aria-label="Repeats"
                value={
                  CADENCE_OPTIONS.find((option) => option.value === cadence)?.label ?? 'Weekly'
                }
                selectedOptions={[cadence]}
                onOptionSelect={(_, data) => update({ cadence: asCadence(data.optionValue) })}
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
              hint="UTC date. Leave blank when the recurrence has no planned end."
              validationState={errors.endsOn ? 'error' : 'none'}
              validationMessage={errors.endsOn}
            >
              <Input
                type="date"
                value={endsOn}
                min={effectiveFrom || undefined}
                onChange={(_, data) => update({ endsOn: data.value })}
              />
            </Field>

            {failure ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>{failure.title}</MessageBarTitle>
                  {failure.message}
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button appearance="primary" onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? 'Adding…' : 'Add version'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
