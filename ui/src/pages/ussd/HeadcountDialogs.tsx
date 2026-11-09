import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Radio,
  RadioGroup,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { Headcount, HeadcountMode } from '../../api/ussd';
import {
  HEADCOUNT_MODE_OPTIONS,
  headcountFields,
  type HeadcountFieldKey,
  type HeadcountFormValues,
} from '../../format/ussd';
import { useUssdStyles } from './ussd-styles';

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  footerStart: {
    marginRight: 'auto',
  },
  actions: {
    justifySelf: 'stretch',
  },
});

function correctionNote(asOf: string): string {
  return `The correction keeps ${asOf} — the moment counted — and supersedes the current observation without deleting it. The mode and numbers stay editable; the earlier row remains valid for its asOf.`;
}

/**
 * The fields shared by Record and Correct: mode radios, the numbers for that
 * mode, and — for a record only — the `asOf`. A correction keeps the original
 * `asOf`, so the date input is deliberately absent and the badge states it.
 * Presentational only; the page owns the request.
 */
export function HeadcountDialogFields({
  correction,
  mode,
  values,
  asOf,
  pending,
  formatInstant,
  onModeChange,
  onValueChange,
  onAsOfChange,
}: {
  correction: Headcount | null;
  mode: HeadcountMode;
  values: HeadcountFormValues;
  asOf: string;
  pending: boolean;
  formatInstant: (value: string) => string;
  onModeChange: (mode: HeadcountMode) => void;
  onValueChange: (key: HeadcountFieldKey, value: string) => void;
  onAsOfChange: (value: string) => void;
}) {
  const styles = useUssdStyles();
  const dialogStyles = useStyles();
  const fields = headcountFields(mode);

  return (
    <div className={dialogStyles.body}>
      {correction ? (
        <>
          <div className={styles.badgeRow}>
            <Badge appearance="tint" color="warning" size="small">
              Keeping asOf {formatInstant(correction.asOf)}
            </Badge>
          </div>
          <Text size={200} className={styles.muted}>
            {correctionNote(formatInstant(correction.asOf))}
          </Text>
        </>
      ) : null}

      <Field label="Mode">
        <RadioGroup
          value={mode}
          disabled={pending}
          onChange={(_, data) => onModeChange(data.value as HeadcountMode)}
        >
          {HEADCOUNT_MODE_OPTIONS.map((option) => (
            <Radio key={option.value} value={option.value} label={option.label} />
          ))}
        </RadioGroup>
      </Field>

      {correction ? null : (
        <Field
          label="As of"
          hint="Defaults to now and must fall within the session day in the event timezone."
        >
          <Input
            type="datetime-local"
            value={asOf}
            disabled={pending}
            onChange={(_, data) => onAsOfChange(data.value)}
          />
        </Field>
      )}

      <div className={styles.fields}>
        {fields.map((field) => (
          <Field key={field.key} label={field.label} className={styles.narrowField}>
            <Input
              type="number"
              min={0}
              max={10_000}
              value={values[field.key]}
              disabled={pending}
              onChange={(_, data) => onValueChange(field.key, data.value)}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

/**
 * Record or Correct one observation. The title, kept `asOf` badge and footer
 * action label switch on `correction`; the page supplies the state and request.
 */
export function HeadcountDialog({
  open,
  correction,
  mode,
  values,
  asOf,
  total,
  submitError,
  validationError,
  pending,
  formatInstant,
  onModeChange,
  onValueChange,
  onAsOfChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  correction: Headcount | null;
  mode: HeadcountMode;
  values: HeadcountFormValues;
  asOf: string;
  total: number;
  submitError: string | null;
  validationError: string | null;
  pending: boolean;
  formatInstant: (value: string) => string;
  onModeChange: (mode: HeadcountMode) => void;
  onValueChange: (key: HeadcountFieldKey, value: string) => void;
  onAsOfChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const styles = useUssdStyles();
  const dialogStyles = useStyles();
  // A rejected request is shown where the operator is working. Only a local
  // validation error blocks submission; a server error must stay retryable.
  const visibleError = submitError ?? validationError;

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>
            {correction ? 'Correct the current observation' : 'Record a headcount'}
          </DialogTitle>
          <DialogContent>
            <HeadcountDialogFields
              correction={correction}
              mode={mode}
              values={values}
              asOf={asOf}
              pending={pending}
              formatInstant={formatInstant}
              onModeChange={onModeChange}
              onValueChange={onValueChange}
              onAsOfChange={onAsOfChange}
            />
          </DialogContent>
          <DialogActions fluid className={dialogStyles.actions}>
            <div className={dialogStyles.footerStart}>
              {visibleError !== null ? (
                <Text size={200} role="alert">
                  {visibleError}
                </Text>
              ) : (
                <Text size={200} className={styles.muted}>
                  Total {total}
                </Text>
              )}
            </div>
            <Button appearance="secondary" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              disabled={pending || validationError !== null}
              onClick={onSubmit}
            >
              {pending ? 'Saving…' : correction ? 'Save correction' : 'Record headcount'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
