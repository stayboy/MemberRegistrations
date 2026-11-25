import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { previewEvent, type EventPreview, type EventPreviewInput } from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { useDateTimeFormat } from '../shell/DateTimeProvider';

const PREVIEW_SETTLE_MS = 350;

const useStyles = makeStyles({
  block: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalM,
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
  },
  summaryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  summary: {
    color: tokens.colorNeutralForeground2,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  table: {
    width: '100%',
  },
  countCell: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
});

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export interface SchedulePreviewProps {
  /**
   * The rule or period exactly as the create will send it, memoised by the
   * caller so the settle timer is not reset by unrelated typing. Null when
   * there is nothing to resolve (a standalone event, or an incomplete rule).
   */
  readonly input: EventPreviewInput | null;
  /** The rule in words, for the dialog's context line. */
  readonly context?: string;
  /** The settled preview, so the caller can show the first date and its counts. */
  readonly onPreview?: (preview: EventPreview | undefined) => void;
}

/**
 * The resolved dates are a **preview, not an input** (FR-42b, AC-63a). The form
 * carries one line - the range, the number of dates and the first date's
 * intersection count - and a **Preview dates** control. Both take their numbers
 * from `POST /v1/events/preview`: the summary once the rule settles (a short
 * debounce, never on every keystroke) and the dialog on every open. Nothing
 * here expands a rule or counts a member, and a failed preview never disables
 * Save.
 */
export function SchedulePreview({ input, context, onPreview }: SchedulePreviewProps) {
  const styles = useStyles();
  const { formatDate, formatRange } = useDateTimeFormat();
  const { baseUrl, session } = useSession();
  const token = session?.token ?? '';
  const [settled, setSettled] = useState<EventPreviewInput | null>(input);
  const [dialogOpen, setDialogOpen] = useState(false);

  // AC-63a: a short settle, so a rule edited keystroke by keystroke produces one
  // fetch rather than one per character.
  useEffect(() => {
    const timer = setTimeout(() => setSettled(input), PREVIEW_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const settledKey = settled ? JSON.stringify(settled) : '';
  const summaryQuery = useQuery({
    queryKey: ['events', 'preview', baseUrl, settledKey],
    queryFn: ({ signal }) => previewEvent(baseUrl, token, settled as EventPreviewInput, signal),
    enabled: Boolean(token) && settled !== null,
  });

  const preview = summaryQuery.data;
  const firstDate = preview?.occurrences[0]?.date;
  const firstCount = preview?.occurrences[0]?.expected;

  useEffect(() => {
    onPreview?.(preview);
  }, [preview, onPreview]);

  const summary = preview
    ? preview.occurrences.length === 0
      ? 'No dates resolve in the next 90 days'
      : `${plural(preview.occurrences.length, 'date', 'dates')} · ${formatRange(
          firstDate,
          preview.occurrences[preview.occurrences.length - 1]?.date,
        )} · ${plural(firstCount ?? 0, 'member', 'members')} on ${formatDate(firstDate)}`
    : null;

  const emptyIntersection =
    preview !== undefined &&
    preview.occurrences.length > 0 &&
    preview.occurrences.every((occurrence) => occurrence.expected === 0);

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <h3 className={styles.title}>Resolved dates</h3>
        <div className={styles.summaryRow}>
          <Text size={200} className={styles.summary} aria-live="polite">
            {summaryQuery.isFetching && !preview ? 'Resolving the dates…' : (summary ?? '—')}
          </Text>
          <Button appearance="secondary" onClick={() => setDialogOpen(true)}>
            Preview dates
          </Button>
        </div>
      </div>

      {summaryQuery.isError ? (
        <Text size={200} className={styles.muted}>
          The preview is unavailable. Save is unaffected; the dialog will try again when it opens.
        </Text>
      ) : null}

      {emptyIntersection ? (
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>No member matches every audience at these dates</MessageBarTitle>
            Saving is allowed: the emptiness is the data, and the detail will report 0 expected.
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {dialogOpen ? (
        <PreviewDialog input={input} context={context} onClose={() => setDialogOpen(false)} />
      ) : null}
    </div>
  );
}

/** The full table, fetched on open (AC-63a): never an inline table on the form. */
function PreviewDialog({
  input,
  context,
  onClose,
}: {
  readonly input: EventPreviewInput | null;
  readonly context?: string;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const { formatDate } = useDateTimeFormat();
  const { baseUrl, session } = useSession();
  const token = session?.token ?? '';
  const key = input ? JSON.stringify(input) : '';

  // A distinct key from the summary's, with no cache lifetime, so every open is
  // a fresh read of the current rule.
  const query = useQuery<EventPreview>({
    queryKey: ['events', 'preview', 'dialog', baseUrl, key],
    queryFn: ({ signal }) =>
      input
        ? previewEvent(baseUrl, token, input, signal)
        : Promise.reject(new Error('The rule is not complete yet.')),
    enabled: Boolean(token) && input !== null,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface aria-label="Preview dates">
        <DialogBody>
          <DialogTitle>Preview dates</DialogTitle>
          <DialogContent className={styles.dialogContent}>
            {context ? (
              <Text size={200} className={styles.muted}>
                {context}
              </Text>
            ) : null}

            {input === null ? (
              <Text>Choose the rule or period first; there is nothing to resolve yet.</Text>
            ) : null}

            {query.isPending && input !== null ? <Spinner label="Resolving the dates…" /> : null}

            {query.isError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The dates could not be resolved</MessageBarTitle>
                  {query.error instanceof Error && query.error.message.trim()
                    ? query.error.message
                    : 'Check the API connection and try again.'}
                </MessageBarBody>
              </MessageBar>
            ) : null}

            {query.data ? (
              query.data.occurrences.length === 0 ? (
                <Text>No dates resolve in the next 90 days.</Text>
              ) : (
                <Table size="small" aria-label="Resolved dates" className={styles.table}>
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Date</TableHeaderCell>
                      <TableHeaderCell className={styles.countCell}>Members</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.occurrences.map((occurrence) => (
                      <TableRow key={occurrence.date}>
                        <TableCell>{formatDate(occurrence.date)}</TableCell>
                        <TableCell className={styles.countCell}>{occurrence.expected}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : null}

            <Text size={200} className={styles.muted}>
              Members is the intersection at that date: a member appears only when they match every
              audience. Fetched from POST /v1/events/preview when this dialog opened; nothing is
              saved until you commit. Range and count mean the preview&apos;s 90-day window, not
              every date the rule could ever produce.
            </Text>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
