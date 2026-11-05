import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
} from '@fluentui/react-components';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { isUnauthorized } from '../api/errors';
import { addScheduleVersion, type AddScheduleVersionInput } from '../api/series';
import { useSession } from '../auth/SessionProvider';
import { utcToday } from '../format/member-form';
import { useEventStyles } from './events-styles';

interface FormValues {
  effectiveFrom: string;
  rrule: string;
  endsOn: string;
}

interface FormErrors {
  effectiveFrom?: string;
  rrule?: string;
  endsOn?: string;
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.effectiveFrom)
    errors.effectiveFrom = 'Choose the first date this version applies to.';
  if (!values.rrule.trim()) errors.rrule = 'Enter an RRULE body such as FREQ=WEEKLY;BYDAY=SU.';
  if (values.endsOn && values.effectiveFrom && values.endsOn < values.effectiveFrom) {
    errors.endsOn = 'The end date must not be before the effective date.';
  }
  return errors;
}

/**
 * Call site: SeriesDetailPage. One POST appends a schedule version; earlier
 * versions are never edited or removed (FR-42, history is append-only). The
 * page owns invalidation through `onSaved`.
 */
export function AddScheduleVersionDialog({
  seriesId,
  onClose,
  onSaved,
}: {
  seriesId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const styles = useEventStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const [values, setValues] = useState<FormValues>(() => ({
    effectiveFrom: utcToday(),
    rrule: '',
    endsOn: '',
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: AddScheduleVersionInput) =>
      addScheduleVersion(baseUrl, token, seriesId, input),
  });

  function update(next: Partial<FormValues>): void {
    setValues((current) => ({ ...current, ...next }));
    setFormError(null);
  }

  function submit(): void {
    if (mutation.isPending) return;

    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFormError(null);
    mutation.mutate(
      {
        effectiveFrom: values.effectiveFrom,
        rrule: values.rrule.trim(),
        endsOn: values.endsOn || null,
      },
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
          setFormError(
            error instanceof Error && error.message.trim()
              ? error.message
              : 'Check the API connection and try again.',
          );
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
              Versions are appended. Earlier versions remain visible and continue to own their
              dates.
            </Text>

            <Field
              label="Effective from"
              hint="UTC date. This version applies from this date until the next version starts."
              validationState={errors.effectiveFrom ? 'error' : 'none'}
              validationMessage={errors.effectiveFrom}
            >
              <Input
                type="date"
                value={values.effectiveFrom}
                onChange={(_, data) => update({ effectiveFrom: data.value })}
              />
            </Field>

            <Field
              label="Recurrence rule"
              hint="RFC 5545 body. Examples: FREQ=WEEKLY;BYDAY=SU · FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE · FREQ=MONTHLY;BYMONTHDAY=15"
              validationState={errors.rrule ? 'error' : 'none'}
              validationMessage={errors.rrule}
            >
              <Input
                value={values.rrule}
                maxLength={200}
                placeholder="FREQ=WEEKLY;BYDAY=SU"
                onChange={(_, data) => update({ rrule: data.value })}
              />
            </Field>

            <Field
              label="Ends on (optional)"
              hint="UTC date. Leave blank when the series has no planned end."
              validationState={errors.endsOn ? 'error' : 'none'}
              validationMessage={errors.endsOn}
            >
              <Input
                type="date"
                value={values.endsOn}
                min={values.effectiveFrom || undefined}
                onChange={(_, data) => update({ endsOn: data.value })}
              />
            </Field>

            {formError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The schedule version was not added</MessageBarTitle>
                  {formError}
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
