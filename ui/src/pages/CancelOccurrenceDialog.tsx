import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
  Textarea,
} from '@fluentui/react-components';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { isUnauthorized } from '../api/errors';
import { cancelEventOccurrence } from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { writeFailure, type WriteFailure } from '../format/write-errors';
import { useEventStyles } from './events-styles';

/** AC-64: the reason is validated here, so `reason_required` is never reached. */
export const CANCEL_REASON_REQUIRED = 'Enter a reason for cancelling this date.';

/**
 * Call site: EventDetailPage, from the occurrence row's **Cancel** (FR-42e,
 * AC-62). One `POST …/occurrences/:date/cancel` with the reason as `{ note }`.
 * The failure is the dialog's own banner and the reason the operator typed stays
 * put (AC-64).
 */
export function CancelOccurrenceDialog({
  eventId,
  date,
  dateLabel,
  onClose,
  onCancelled,
}: {
  eventId: string;
  /** The UTC calendar date the cancel route addresses. */
  date: string;
  /** The formatted date the title and body name. */
  dateLabel: string;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const styles = useEventStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [failure, setFailure] = useState<WriteFailure | null>(null);

  const mutation = useMutation({
    mutationFn: (reason: string) =>
      cancelEventOccurrence(baseUrl, token, eventId, date, { note: reason }),
  });

  function submit(): void {
    if (mutation.isPending) return;

    const reason = note.trim();
    if (!reason) {
      setNoteError(CANCEL_REASON_REQUIRED);
      return;
    }

    setNoteError(null);
    setFailure(null);
    mutation.mutate(reason, {
      onSuccess: () => {
        onCancelled();
        onClose();
      },
      onError: (error: unknown) => {
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        setFailure(writeFailure(error, 'The date was not cancelled'));
      },
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open && !mutation.isPending) onClose();
      }}
    >
      <DialogSurface aria-label="Cancel this date">
        <DialogBody>
          <DialogTitle>Cancel this date</DialogTitle>
          <DialogContent className={styles.dialogContent}>
            <Text size={200} className={styles.muted}>
              The occurrence on {dateLabel} is marked cancelled and keeps its reason. Its history
              stays readable; nothing is deleted, and the schedule is unchanged.
            </Text>

            <Field
              label="Reason"
              required
              hint="The reason is recorded on the cancelled occurrence."
              validationState={noteError ? 'error' : 'none'}
              validationMessage={noteError}
            >
              <Textarea
                value={note}
                rows={3}
                maxLength={200}
                resize="vertical"
                onChange={(_, data) => {
                  setNote(data.value);
                  setNoteError(null);
                }}
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
              Keep date
            </Button>
            <Button appearance="primary" onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? 'Cancelling…' : 'Cancel date'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
