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
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { isUnauthorized } from '../api/errors';
import { logCall, type CallInput } from '../api/shepherding';
import { useSession } from '../auth/SessionProvider';
import { formatDateLong } from '../format/member';
import {
  CALL_OUTCOME_OPTIONS,
  STILL_IN_CHURCH_OPTIONS,
  createEmptyCallForm,
  validateCall,
  type CallFormErrors,
  type CallFormValues,
} from '../format/shepherding';

const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
});

/**
 * Call site: ShepherdingRosterPage row action. One call is one append-only POST;
 * there is no edit, delete or auto-retry, because a correction is a new call
 * (FR-62). The page owns invalidation through `onLogged`.
 */
export function LogCallDialog({
  assignmentId,
  memberName,
  assignedOn,
  onClose,
  onLogged,
}: {
  assignmentId: string;
  memberName: string;
  assignedOn: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [values, setValues] = useState<CallFormValues>(() => createEmptyCallForm());
  const [errors, setErrors] = useState<CallFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const logMutation = useMutation({
    mutationFn: (input: CallInput) => logCall(baseUrl, token, assignmentId, input),
  });

  function update(next: Partial<CallFormValues>): void {
    setValues((current) => ({ ...current, ...next }));
    setFormError(null);
  }

  function submit(): void {
    if (logMutation.isPending) return;

    const nextErrors = validateCall(values, assignedOn);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFormError(null);
    logMutation.mutate(
      {
        calledOn: values.calledOn.trim(),
        outcome: values.outcome as CallInput['outcome'],
        ...(values.stillInChurch ? { stillInChurch: values.stillInChurch } : {}),
        feedback: values.feedback.trim() || null,
        issue: values.issue.trim() || null,
      },
      {
        onSuccess: () => {
          onLogged();
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
        if (!data.open && !logMutation.isPending) onClose();
      }}
    >
      <DialogSurface aria-label={`Log call for ${memberName}`}>
        <DialogBody>
          <DialogTitle>Log call</DialogTitle>
          <DialogContent className={styles.content}>
            <Text size={200} className={styles.muted}>
              {memberName} · assignment started {formatDateLong(assignedOn)}
            </Text>

            <Field
              label="Called on"
              hint="UTC date. It cannot be in the future or before the assignment started."
              validationState={errors.calledOn ? 'error' : 'none'}
              validationMessage={errors.calledOn}
            >
              <Input
                type="date"
                value={values.calledOn}
                onChange={(_, data) => update({ calledOn: data.value })}
              />
            </Field>

            <Field
              label="Outcome"
              validationState={errors.outcome ? 'error' : 'none'}
              validationMessage={errors.outcome}
            >
              <Dropdown
                aria-label="Outcome"
                value={
                  CALL_OUTCOME_OPTIONS.find((option) => option.value === values.outcome)?.label ??
                  ''
                }
                selectedOptions={values.outcome ? [values.outcome] : []}
                onOptionSelect={(_, data) => {
                  const outcome = CALL_OUTCOME_OPTIONS.find(
                    (option) => option.value === data.optionValue,
                  )?.value;
                  update({ outcome: outcome ?? '' });
                }}
              >
                {CALL_OUTCOME_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
            </Field>

            <Field
              label={
                values.outcome === 'reached' ? 'Still in church' : 'Still in church (optional)'
              }
              hint="Required when the outcome is reached; it defaults to unknown otherwise."
              validationState={errors.stillInChurch ? 'error' : 'none'}
              validationMessage={errors.stillInChurch}
            >
              <Dropdown
                aria-label="Still in church"
                value={
                  STILL_IN_CHURCH_OPTIONS.find((option) => option.value === values.stillInChurch)
                    ?.label ?? ''
                }
                selectedOptions={values.stillInChurch ? [values.stillInChurch] : []}
                onOptionSelect={(_, data) => {
                  const status = STILL_IN_CHURCH_OPTIONS.find(
                    (option) => option.value === data.optionValue,
                  )?.value;
                  update({ stillInChurch: status ?? '' });
                }}
              >
                {STILL_IN_CHURCH_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
            </Field>

            <Field
              label="Feedback"
              validationState={errors.feedback ? 'error' : 'none'}
              validationMessage={errors.feedback}
            >
              <Textarea
                value={values.feedback}
                rows={3}
                resize="vertical"
                onChange={(_, data) => update({ feedback: data.value })}
              />
            </Field>

            <Field
              label="Issue"
              validationState={errors.issue ? 'error' : 'none'}
              validationMessage={errors.issue}
            >
              <Textarea
                value={values.issue}
                rows={2}
                resize="vertical"
                onChange={(_, data) => update({ issue: data.value })}
              />
            </Field>

            {formError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The call was not logged</MessageBarTitle>
                  {formError}
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={logMutation.isPending}>
              Cancel
            </Button>
            <Button appearance="primary" onClick={submit} disabled={logMutation.isPending}>
              Log call
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
