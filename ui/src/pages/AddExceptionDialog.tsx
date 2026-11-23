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
  Textarea,
} from '@fluentui/react-components';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { isUnauthorized } from '../api/errors';
import { addEventRecurrenceException, type AddEventExceptionInput } from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { utcToday } from '../format/member-form';
import { writeFailure, type WriteFailure } from '../format/write-errors';
import { useEventStyles } from './events-styles';

const DATE_REQUIRED = 'Choose the UTC date this extra occurrence falls on.';

/**
 * Call site: EventDetailPage's recurrence panel (FR-42e). One
 * `POST …/recurrence/exceptions` adds a date the schedule would not generate.
 * **Extra only**: cancelling a scheduled date is the occurrence row's **Cancel**,
 * so a `cancelled` exception is never authored from the UI while the two writes
 * do not agree on the occurrence row.
 */
export function AddExceptionDialog({
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
  const [date, setDate] = useState(() => utcToday());
  const [note, setNote] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [failure, setFailure] = useState<WriteFailure | null>(null);

  const mutation = useMutation({
    mutationFn: (input: AddEventExceptionInput) =>
      addEventRecurrenceException(baseUrl, token, eventId, input),
  });

  function update(next: { date?: string; note?: string }): void {
    if (next.date !== undefined) setDate(next.date);
    if (next.note !== undefined) setNote(next.note);
    setDateError(null);
    setFailure(null);
  }

  function submit(): void {
    if (mutation.isPending) return;

    if (!date) {
      setDateError(DATE_REQUIRED);
      return;
    }

    setDateError(null);
    setFailure(null);
    mutation.mutate(
      { date, kind: 'extra', note: note.trim() || null },
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
          setFailure(writeFailure(error, 'The exception was not added'));
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
      <DialogSurface aria-label="Add exception">
        <DialogBody>
          <DialogTitle>Add exception</DialogTitle>
          <DialogContent className={styles.dialogContent}>
            <Text size={200} className={styles.muted}>
              An extra date is added even though the schedule does not generate it. To cancel a
              scheduled date, use <strong>Cancel</strong> on its occurrence row; the schedule itself
              does not change.
            </Text>

            <Field
              label="Date"
              required
              hint="UTC date."
              validationState={dateError ? 'error' : 'none'}
              validationMessage={dateError}
            >
              <Input
                type="date"
                value={date}
                onChange={(_, data) => update({ date: data.value })}
              />
            </Field>

            <Field label="Note (optional)" hint="Up to 200 characters.">
              <Textarea
                value={note}
                rows={2}
                maxLength={200}
                resize="vertical"
                onChange={(_, data) => update({ note: data.value })}
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
              {mutation.isPending ? 'Adding…' : 'Add extra date'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
