import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Textarea,
} from '@fluentui/react-components';
import { useState } from 'react';

/**
 * The shared reason prompt for Codes (void) and Registrations (reject). It owns
 * the draft text and the "required" check; the caller owns the request and the
 * pending state, so a failed request keeps the dialog and the typed reason.
 */
export function ReasonDialog({
  open,
  title,
  label,
  confirmLabel,
  hint,
  required = true,
  pending = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  confirmLabel: string;
  hint?: string;
  required?: boolean;
  pending?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [previousOpen, setPreviousOpen] = useState(open);
  const missing = required && reason.trim().length === 0;

  // A fresh target must not inherit the previous reason: a successful request
  // closes by clearing the caller's target, not through close().
  // Adjusting state during render is React's documented
  // alternative to a cascading effect for a prop change.
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setReason('');
      setTouched(false);
    }
  }

  function close(): void {
    setReason('');
    setTouched(false);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) close();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <Field
              label={label}
              hint={hint}
              validationState={touched && missing ? 'error' : 'none'}
              validationMessage={touched && missing ? 'A reason is required.' : undefined}
            >
              <Textarea
                value={reason}
                maxLength={500}
                resize="vertical"
                onChange={(_, data) => {
                  setReason(data.value);
                  setTouched(true);
                }}
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              disabled={pending || missing}
              onClick={() => {
                if (missing) {
                  setTouched(true);
                  return;
                }
                onConfirm(reason.trim());
              }}
            >
              {pending ? 'Saving…' : confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
