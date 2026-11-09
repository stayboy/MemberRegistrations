import {
  Badge,
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
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
  MAX_LINES,
  MAX_PIECES,
  customRowCount,
  denominationLabel,
  gridDenominations,
  hasDenominationCatalogue,
  parseMoneyMinor,
  positivePieces,
  positiveRowCount,
  type CountRowDraft,
  type DenominationOverride,
} from '../../format/offering-counts';
import { formatMoneyMinor } from '../../format/welfare';
import { useUssdStyles } from './ussd-styles';

const OVER_CAP_MESSAGE = `A piece count must be ${MAX_PIECES.toLocaleString()} or fewer.`;

function isOverCap(pieces: string): boolean {
  const trimmed = pieces.trim();
  return /^\d+$/.test(trimmed) && Number(trimmed) > MAX_PIECES;
}

/**
 * The single-pass denomination entry for one count: one number input per
 * configured denomination (notes before coins, descending), a free-form one-off
 * add, an editable one-off table, a live total and Record or Correct. The page
 * owns the request and the rows; this component is presentational.
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
  overrides = [],
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
  /** Slice B's enable/position setting; omitted keeps the catalogue defaults. */
  overrides?: readonly DenominationOverride[];
}) {
  const styles = useUssdStyles();
  const [customAmount, setCustomAmount] = useState('');
  const customMinor = parseMoneyMinor(customAmount);

  const configured = gridDenominations(currency, overrides);
  const configuredMinors = new Set(configured.map((entry) => entry.denominationMinor));
  const hasGrid = configured.length > 0;
  const catalogueExists = hasDenominationCatalogue(currency);
  const oneOffRows = rows.filter((row) => !configuredMinors.has(row.denominationMinor));
  const overCapMinors = new Set(
    rows.filter((row) => isOverCap(row.pieces)).map((row) => row.denominationMinor),
  );
  const counted = configured.reduce((total, entry) => {
    const row = rows.find((draft) => draft.denominationMinor === entry.denominationMinor);
    return row && positivePieces(row.pieces) ? total + 1 : total;
  }, 0);
  const customRows = customRowCount(rows, currency, overrides);
  const positiveRows = positiveRowCount(rows);
  const atLineCap = positiveRows >= MAX_LINES;
  const gridError = overCapMinors.size > 0 ? OVER_CAP_MESSAGE : null;

  function renderCell(entry: (typeof configured)[number]) {
    const row = rows.find((draft) => draft.denominationMinor === entry.denominationMinor);
    const pieces = row?.pieces ?? '';
    const overCap = overCapMinors.has(entry.denominationMinor);
    return (
      <div
        key={entry.denominationMinor}
        className={overCap ? `${styles.denominationCell} ${styles.denominationCellInvalid}` : styles.denominationCell}
      >
        <Field label={denominationLabel(entry.denominationMinor, currency)}>
          <Input
            type="number"
            min={0}
            max={MAX_PIECES}
            inputMode="numeric"
            value={pieces}
            disabled={pending}
            aria-label={`Pieces of ${denominationLabel(entry.denominationMinor, currency)}`}
            aria-invalid={overCap || undefined}
            onChange={(_, data) => onPiecesChange(entry.denominationMinor, data.value)}
          />
        </Field>
        <Text size={200} className={styles.denominationValue}>
          {formatMoneyMinor(entry.denominationMinor * (Number(pieces) || 0), currency)}
        </Text>
      </div>
    );
  }

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
        {hasGrid ? (
          <>
            {(['note', 'coin'] as const).map((kind) => {
              const entries = configured.filter((entry) => entry.kind === kind);
              if (entries.length === 0) return null;
              return (
                <div key={kind} className={styles.denominationGroup}>
                  <Text size={200} className={styles.muted}>
                    {currency} {kind === 'note' ? 'notes' : 'coins'}
                  </Text>
                  <div className={styles.denominationGrid}>
                    {entries.map((entry) => renderCell(entry))}
                  </div>
                </div>
              );
            })}
            <Text size={200} className={styles.muted}>
              {counted} of {configured.length} denominations counted; the blank rows stay visible.
            </Text>
          </>
        ) : (
          <MessageBar intent="info">
            <MessageBarBody>
              {catalogueExists ? (
                <strong>
                  All denominations for {currency} are hidden; enter one-off rows.
                </strong>
              ) : (
                <strong>No denominations are configured for {currency}.</strong>
              )}
            </MessageBarBody>
          </MessageBar>
        )}

        {gridError !== null ? (
          <Text size={200} role="alert" className={styles.errorText}>
            {gridError}
          </Text>
        ) : null}

        <div className={styles.customAdd}>
          <div className={styles.customField}>
            <Field label="Custom denomination">
              <Input
                value={customAmount}
                disabled={pending}
                placeholder="e.g. 25.50"
                inputMode="decimal"
                onChange={(_, data) => setCustomAmount(data.value)}
              />
            </Field>
          </div>
          <Button
            icon={<AddRegular />}
            appearance="secondary"
            disabled={pending || customMinor === null || atLineCap}
            onClick={() => {
              if (customMinor === null || atLineCap) return;
              onAddDenomination(customMinor);
              setCustomAmount('');
            }}
          >
            Add row
          </Button>
          <Text size={200} className={`${styles.muted} ${styles.customHint}`}>
            In {currency}; two decimals at most. Adds one piece; a value that matches a configured
            row sums into it; any other value becomes a one-off row.
          </Text>
        </div>

        {oneOffRows.length > 0 ? (
          <>
            <div className={styles.oneOffHeader}>
              <Text size={200} className={styles.muted}>
                One-off rows
              </Text>
              <Text size={200} className={styles.muted}>
                One-off rows: {customRows}
              </Text>
            </div>
            <div className={styles.tableWrap}>
              <Table size="small" aria-label="One-off rows">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Denomination</TableHeaderCell>
                    <TableHeaderCell>Pieces</TableHeaderCell>
                    <TableHeaderCell>Value</TableHeaderCell>
                    <TableHeaderCell>Remove</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {oneOffRows.map((row) => {
                    const overCap = overCapMinors.has(row.denominationMinor);
                    return (
                      <TableRow key={row.denominationMinor}>
                        <TableCell>{denominationLabel(row.denominationMinor, currency)}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={MAX_PIECES}
                            value={row.pieces}
                            disabled={pending}
                            aria-label={`Pieces of ${denominationLabel(row.denominationMinor, currency)}`}
                            aria-invalid={overCap || undefined}
                            onChange={(_, data) =>
                              onPiecesChange(row.denominationMinor, data.value)
                            }
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
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}

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
      </div>

      <div className={styles.panelFoot}>
        <div className={styles.footerStatus}>
          <Text size={200} className={styles.muted}>
            Live total {formatMoneyMinor(totalMinor, currency)}
          </Text>
          {error !== null ? (
            <Text size={200} role="alert" className={styles.errorText}>
              {error}
            </Text>
          ) : null}
        </div>
        <div className={styles.badgeRow}>
          {correction ? (
            <Button appearance="secondary" disabled={pending} onClick={onCancelCorrection}>
              Cancel
            </Button>
          ) : onCancel ? (
            <Button appearance="secondary" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            appearance="primary"
            disabled={pending || overCapMinors.size > 0}
            onClick={onSubmit}
          >
            {pending ? 'Saving…' : correction ? 'Save correction' : 'Record count'}
          </Button>
        </div>
      </div>
    </section>
  );
}
