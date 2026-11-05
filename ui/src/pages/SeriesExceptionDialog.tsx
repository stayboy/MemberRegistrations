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
  Textarea,
} from '@fluentui/react-components';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { isUnauthorized } from '../api/errors';
import {
  setSeriesException,
  type SeriesExceptionKind,
  type SetSeriesExceptionInput,
} from '../api/series';
import { useSession } from '../auth/SessionProvider';
import { utcToday } from '../format/member-form';
import { exceptionKindLabel } from '../format/series';
import { useEventStyles } from './events-styles';

const EXCEPTION_OPTIONS: readonly SeriesExceptionKind[] = ['cancelled', 'extra'];

interface FormValues {
  date: string;
  kind: SeriesExceptionKind;
  note: string;
}

interface FormErrors {
  date?: string;
  note?: string;
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.date) errors.date = 'Choose the UTC date this exception applies to.';
  if (values.note.trim().length > 200) errors.note = 'Keep the note to 200 characters or fewer.';
  return errors;
}

/**
 * Call site: SeriesDetailPage. One POST sets a date's cancelled/extra exception;
 * removing it is a separate confirmed DELETE. The page owns invalidation through
 * `onSaved` (FR-42, append-only history).
 */
export function SeriesExceptionDialog({
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
    date: utcToday(),
    kind: 'cancelled',
    note: '',
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: SetSeriesExceptionInput) =>
      setSeriesException(baseUrl, token, seriesId, input),
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
        date: values.date,
        kind: values.kind,
        note: values.note.trim() || null,
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
      <DialogSurface aria-label="Add series exception">
        <DialogBody>
          <DialogTitle>Add exception</DialogTitle>
          <DialogContent className={styles.dialogContent}>
            <Text size={200} className={styles.muted}>
              A cancelled date is removed from the generated occurrences. An extra date is added
              even though the RRULE does not produce it. The schedule itself does not change.
            </Text>

            <Field
              label="Date"
              hint="UTC date."
              validationState={errors.date ? 'error' : 'none'}
              validationMessage={errors.date}
            >
              <Input
                type="date"
                value={values.date}
                onChange={(_, data) => update({ date: data.value })}
              />
            </Field>

            <Field label="Kind">
              <Dropdown
                aria-label="Exception kind"
                value={exceptionKindLabel(values.kind)}
                selectedOptions={[values.kind]}
                onOptionSelect={(_, data) => {
                  if (data.optionValue === 'cancelled' || data.optionValue === 'extra') {
                    update({ kind: data.optionValue });
                  }
                }}
              >
                {EXCEPTION_OPTIONS.map((kind) => (
                  <Option key={kind} value={kind}>
                    {exceptionKindLabel(kind)}
                  </Option>
                ))}
              </Dropdown>
            </Field>

            <Field
              label="Note (optional)"
              hint="Up to 200 characters."
              validationState={errors.note ? 'error' : 'none'}
              validationMessage={errors.note}
            >
              <Textarea
                value={values.note}
                rows={2}
                resize="vertical"
                onChange={(_, data) => update({ note: data.value })}
              />
            </Field>

            {formError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The exception was not saved</MessageBarTitle>
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
              {mutation.isPending ? 'Saving…' : 'Add exception'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
