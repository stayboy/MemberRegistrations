import {
  Badge,
  Button,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { AddRegular, DeleteRegular } from '@fluentui/react-icons';
import { useState } from 'react';
import type { OfferingCount } from '../../api/offering-counts';
import {
  GHS_COIN_MINORS,
  GHS_NOTE_MINORS,
  MAX_LINES,
  denominationLabel,
  parseMoneyMinor,
  quickPickVisible,
  type CountRowDraft,
} from '../../format/offering-counts';
import { formatMoneyMinor } from '../../format/welfare';
import { useUssdStyles } from './ussd-styles';

/**
 * The denomination entry for one count: a GHS note/coin quick-pick hidden for
 * other currencies, a free-form custom denomination, editable rows, a live
 * total, and Record or Correct. Presentational only; the page owns the request.
 */
export function OfferingCountEntry({
  currency,
  rows,
  totalMinor,
  asOf,
  correction,
  pending,
  error,
  formatInstant,
  onAddDenomination,
  onPiecesChange,
  onRemove,
  onAsOfChange,
  onSubmit,
  onCancelCorrection,
  showHeader = true,
  onCancel,
}: {
  currency: string;
  rows: readonly CountRowDraft[];
  totalMinor: number;
  asOf: string;
  correction: OfferingCount | null;
  pending: boolean;
  error: string | null;
  formatInstant: (value: string) => string;
  onAddDenomination: (denominationMinor: number) => void;
  onPiecesChange: (denominationMinor: number, pieces: string) => void;
  onRemove: (denominationMinor: number) => void;
  onAsOfChange: (value: string) => void;
  onSubmit: () => void;
  onCancelCorrection: () => void;
  /** The dialog supplies its own title and close action. */
  showHeader?: boolean;
  onCancel?: () => void;
}) {
  const styles = useUssdStyles();
  const [customAmount, setCustomAmount] = useState('');
  const customMinor = parseMoneyMinor(customAmount);
  const showQuickPick = quickPickVisible(currency);
  const atLineCap = rows.length >= MAX_LINES;

  return (
    <section className={showHeader ? styles.panel : undefined} aria-label="Record an offering count">
      {showHeader ? (
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>
            {correction ? 'Correct the current observation' : 'Record a count'}
          </h2>
          {correction ? (
            <Badge appearance="tint" color="warning" size="small">
              Keeping asOf {formatInstant(correction.asOf)}
            </Badge>
          ) : null}
        </div>
      ) : null}
      <div className={styles.panelBody}>
        {showQuickPick ? (
          <div className={styles.panelBody}>
            <Text size={200} className={styles.muted}>
              GHS notes
            </Text>
            <div className={styles.badgeRow}>
              {GHS_NOTE_MINORS.map((denominationMinor) => (
                <Button
                  key={denominationMinor}
                  size="small"
                  appearance="secondary"
                  disabled={pending || atLineCap}
                  onClick={() => onAddDenomination(denominationMinor)}
                >
                  {denominationLabel(denominationMinor, currency)}
                </Button>
              ))}
            </div>
            <Text size={200} className={styles.muted}>
              GHS coins
            </Text>
            <div className={styles.badgeRow}>
              {GHS_COIN_MINORS.map((denominationMinor) => (
                <Button
                  key={denominationMinor}
                  size="small"
                  appearance="secondary"
                  disabled={pending || atLineCap}
                  onClick={() => onAddDenomination(denominationMinor)}
                >
                  {denominationLabel(denominationMinor, currency)}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <Text size={200} className={styles.muted}>
            The GHS quick-pick is hidden for {currency}; add free-form denomination rows below.
          </Text>
        )}

        <div className={styles.fields}>
          <Field
            label="Custom denomination"
            hint={`In ${currency}; two decimals at most. Adds one piece.`}
          >
            <Input
              value={customAmount}
              disabled={pending}
              placeholder="e.g. 25.50"
              inputMode="decimal"
              onChange={(_, data) => setCustomAmount(data.value)}
            />
          </Field>
          <Button
            icon={<AddRegular />}
            appearance="secondary"
            disabled={pending || atLineCap || customMinor === null}
            onClick={() => {
              if (customMinor === null) return;
              onAddDenomination(customMinor);
              setCustomAmount('');
            }}
          >
            Add row
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className={styles.empty}>
            <Text size={200} className={styles.muted}>
              No denomination row yet. Use the quick-pick or add a custom value.
            </Text>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <Table className={styles.table} size="small" aria-label="Denomination rows">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Denomination</TableHeaderCell>
                  <TableHeaderCell>Pieces</TableHeaderCell>
                  <TableHeaderCell>Value</TableHeaderCell>
                  <TableHeaderCell>Remove</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.denominationMinor}>
                    <TableCell>{denominationLabel(row.denominationMinor, currency)}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={1_000_000}
                        value={row.pieces}
                        disabled={pending}
                        aria-label={`Pieces of ${denominationLabel(row.denominationMinor, currency)}`}
                        onChange={(_, data) => onPiecesChange(row.denominationMinor, data.value)}
                      />
                    </TableCell>
                    <TableCell>
                      {formatMoneyMinor(
                        row.denominationMinor * (Number(row.pieces) || 0),
                        currency,
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        appearance="transparent"
                        icon={<DeleteRegular />}
                        aria-label={`Remove ${denominationLabel(row.denominationMinor, currency)}`}
                        disabled={pending}
                        onClick={() => onRemove(row.denominationMinor)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {correction ? (
          <Text size={200} className={styles.muted}>
            The correction keeps {formatInstant(correction.asOf)} — the moment counted — and
            supersedes the current observation without deleting it. The earlier row stays readable
            and valid for its asOf.
          </Text>
        ) : (
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

        <div className={styles.badgeRow}>
          <Button appearance="primary" disabled={pending || error !== null} onClick={onSubmit}>
            {pending ? 'Saving…' : correction ? 'Save correction' : 'Record count'}
          </Button>
          {correction ? (
            <Button appearance="secondary" disabled={pending} onClick={onCancelCorrection}>
              Cancel correction
            </Button>
          ) : onCancel ? (
            <Button appearance="secondary" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          {error !== null ? (
            <Text size={200} role="alert">
              {error}
            </Text>
          ) : (
            <Text size={200} className={styles.muted}>
              Live total {formatMoneyMinor(totalMinor, currency)}
            </Text>
          )}
        </div>
      </div>
    </section>
  );
}
