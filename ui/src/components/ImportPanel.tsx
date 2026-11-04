import {
  Badge,
  Button,
  Card,
  Divider,
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
import { ArrowDownloadRegular, DocumentArrowUpRegular } from '@fluentui/react-icons';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent } from 'react';
import {
  duplicateBlocksCommit,
  importProblemRows,
  isDuplicateImport,
  type ImportBatch,
  type ImportFormatColumn,
} from '../api/imports';
import { isUnauthorized } from '../api/errors';
import { useSession } from '../auth/SessionProvider';
import { checkImportLimits, type ParsedImportRows } from '../format/import-file';

const PREVIEW_ROWS = 5;

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    width: '100%',
  },
  topGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(260px, 2fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 900px)': {
      gridTemplateColumns: '1fr',
    },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
  },
  cardTitle: {
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  tableWrap: {
    overflowX: 'auto',
  },
  dropZone: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
    ...shorthands.border('1px', 'dashed', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  dropHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  dropIcon: {
    fontSize: tokens.fontSizeHero800,
    color: tokens.colorBrandForeground1,
  },
  dropBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  fileName: {
    overflowWrap: 'anywhere',
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  errorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    margin: 0,
    paddingInlineStart: tokens.spacingHorizontalXL,
    maxHeight: '220px',
    overflowY: 'auto',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  footerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  resultValue: {
    fontFamily: tokens.fontFamilyMonospace,
    overflowWrap: 'anywhere',
  },
  center: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalL,
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function previewValue(value: unknown): string {
  if (value === true) return 'TRUE';
  if (value === false) return 'FALSE';
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function rowCell(row: unknown, name: string): unknown {
  if (typeof row !== 'object' || row === null) return undefined;
  return (row as Record<string, unknown>)[name];
}

export interface ImportPanelProps<Row extends object> {
  /** The kind's expected columns from `GET /v1/imports/formats` (FR-41). */
  readonly columns: readonly ImportFormatColumn[];
  /** The API's template filename, used when the response header omits one. */
  readonly templateFilename: string;
  /** Authenticated fetch-to-Blob download wired by the page (never a bare link). */
  readonly downloadTemplate: () => Promise<void>;
  /** Local-only parse; the panel never calls the API before the confirm (FR-34). */
  readonly parseFile: (file: File) => Promise<ParsedImportRows<Row>>;
  /** The confirmed write, owned by this feature component's mutation (FR-40). */
  readonly commitRows: (rows: readonly Row[]) => Promise<ImportBatch>;
  /** Called once after a successful import, for cache invalidation and session storage. */
  readonly onCommitted?: (batch: ImportBatch) => void;
  /** Plural noun for the confirm button; defaults to `rows`. */
  readonly rowNoun?: string;
}

/**
 * The shared import shell: expected columns, template download, local parsing,
 * a preview with row-level reasons, confirm and the batch result. Implements
 * UI spec §5.4 (FR-33–FR-41).
 *
 * Call sites:
 * - `pages/ImportsPage.tsx` — the member database import (ticket 15, first).
 * - the attendance registry screen (ticket 15b, committed second call site).
 *
 * Feature component: it owns the parse state, the commit mutation and the result
 * panel (FR-40). Only the page knows the API paths, so parsing and committing
 * arrive as props; `onCommitted` lets the page invalidate and record the batch.
 * Test ids owned: `import-file`, `import-confirm`, `import-result`.
 *
 * Accessibility contract:
 * - the file picker is a Fluent `Button` labelled “Choose file”;
 * - the preview table is named “Import preview”;
 * - the confirm button is genuinely disabled whenever the preview has row or
 *   limit errors, the file is parsing or a request is in flight;
 * - the result panel is `role="status"` with `aria-live="polite"`, so a
 *   successful batch is announced.
 *
 * Fluent UI v9 has no file-picker component. A hidden native
 * `<input type="file">` triggered by the Fluent `Button` is therefore the
 * sanctioned exception under `AGENTS.md` §16.
 */
export function ImportPanel<Row extends object>({
  columns,
  templateFilename,
  downloadTemplate,
  parseFile,
  commitRows,
  onCommitted,
  rowNoun = 'rows',
}: ImportPanelProps<Row>) {
  const styles = useStyles();
  const { signOut } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const parseSequence = useRef(0);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedImportRows<Row> | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [result, setResult] = useState<ImportBatch | null>(null);

  const commit = useMutation({
    mutationFn: (rows: readonly Row[]) => commitRows(rows),
    onSuccess: (batch) => {
      setResult(batch);
      setParsed(null);
      setParseError(null);
      setFileName(null);
      if (inputRef.current) inputRef.current.value = '';
      onCommitted?.(batch);
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      // A duplicate is final: discard the file and the parsed rows so the same
      // body cannot be re-POSTed, while keeping the API's batch-id message.
      if (duplicateBlocksCommit(error, parsed !== null)) {
        parseSequence.current += 1;
        setParsed(null);
        setParseError(null);
        setFileName(null);
        setIsParsing(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
  });

  async function chooseFile(file: File | null): Promise<void> {
    if (!file) return;

    const sequence = parseSequence.current + 1;
    parseSequence.current = sequence;
    commit.reset();
    setResult(null);
    setParseError(null);
    setParsed(null);
    setFileName(file.name);
    setIsParsing(true);

    try {
      const next = await parseFile(file);
      if (parseSequence.current === sequence) setParsed(next);
    } catch (error) {
      if (parseSequence.current === sequence) setParseError(errorMessage(error));
    } finally {
      if (parseSequence.current === sequence) setIsParsing(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    // Clear the picker so choosing the same file again still fires a change.
    event.target.value = '';
    void chooseFile(file);
  }

  function reset(): void {
    parseSequence.current += 1;
    commit.reset();
    setParsed(null);
    setParseError(null);
    setFileName(null);
    setIsParsing(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function download(): Promise<void> {
    setTemplateError(null);
    setIsDownloading(true);
    try {
      await downloadTemplate();
    } catch (error) {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setTemplateError(errorMessage(error));
    } finally {
      setIsDownloading(false);
    }
  }

  const limitMessage = parsed ? checkImportLimits(parsed.rows) : null;
  const invalidRows = parsed ? new Set(parsed.errors.map((error) => error.row)).size : 0;
  const validRows = parsed ? parsed.rows.length - invalidRows : 0;
  const problemRows = importProblemRows(commit.error);
  const isDuplicate = isDuplicateImport(commit.error);
  const allValid = parsed !== null && parsed.rows.length > 0 && invalidRows === 0 && !limitMessage;
  const canCommit = allValid && !commit.isPending && !isParsing && !isDuplicateImport(commit.error);

  return (
    <div className={styles.panel}>
      <div className={styles.topGrid}>
        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>Expected columns</h2>
          <Text size={200} className={styles.muted}>
            Download the Excel template to get these headers and an example row.
          </Text>
          <div className={styles.tableWrap}>
            <Table size="small" aria-label="Expected import columns">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Column</TableHeaderCell>
                  <TableHeaderCell>Required</TableHeaderCell>
                  <TableHeaderCell>Notes</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {columns.map((column) => (
                  <TableRow key={column.name}>
                    <TableCell>{column.name}</TableCell>
                    <TableCell>
                      <Badge
                        appearance="tint"
                        color={column.required ? 'danger' : 'subtle'}
                        size="small"
                      >
                        {column.required ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {column.notes ??
                        (column.type === 'date'
                          ? 'YYYY-MM-DD'
                          : column.type === 'boolean'
                            ? 'TRUE or FALSE'
                            : '')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>Excel template</h2>
          <Text size={200} className={styles.muted}>
            The workbook has a header row, one example row and a Notes sheet.
          </Text>
          <div>
            <Button
              appearance="primary"
              icon={<ArrowDownloadRegular />}
              onClick={() => {
                void download();
              }}
              disabled={isDownloading || commit.isPending}
            >
              Download Excel template
            </Button>
          </div>
          <Text size={200} className={styles.muted}>
            .xlsx · {columns.length} columns · {templateFilename}
          </Text>
          {templateError ? (
            <MessageBar intent="warning">
              <MessageBarBody>
                <MessageBarTitle>The template could not be downloaded</MessageBarTitle>
                {templateError} The expected columns above are the complete contract; a CSV with the
                same headers is also accepted.
              </MessageBarBody>
            </MessageBar>
          ) : (
            <Text size={200} className={styles.muted}>
              No template? The expected columns are the complete contract; a CSV with the same
              headers is also accepted.
            </Text>
          )}
        </Card>
      </div>

      <Card className={styles.dropZone}>
        <div className={styles.dropHeader}>
          <DocumentArrowUpRegular className={styles.dropIcon} aria-hidden="true" />
          <div className={styles.dropBody}>
            <Text weight="semibold">Choose a CSV or the Excel template</Text>
            <Text size={200} className={styles.muted}>
              .csv or .xlsx · up to 10,000 rows · 1 MB of serialised JSON
            </Text>
          </div>
        </div>
        <div className={styles.fileRow}>
          <Button
            appearance="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={isParsing || commit.isPending}
          >
            Choose file
          </Button>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            data-testid="import-file"
            onChange={onFileChange}
            disabled={isParsing || commit.isPending}
          />
          {fileName ? (
            <Text size={200} className={styles.fileName}>
              Selected: {fileName}
            </Text>
          ) : (
            <Text size={200} className={styles.muted}>
              Nothing is sent until you confirm the preview.
            </Text>
          )}
        </div>
      </Card>

      {isParsing ? (
        <Card className={styles.card}>
          <div className={styles.center}>
            <Spinner label="Reading the file…" />
          </div>
        </Card>
      ) : null}

      {parseError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The file could not be read</MessageBarTitle>
            {parseError}
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {parsed ? (
        <Card className={styles.card}>
          <div className={styles.previewHeader}>
            <div>
              <h2 className={styles.cardTitle}>Preview</h2>
              <Text size={200} className={styles.muted}>
                {parsed.rows.length} {parsed.rows.length === 1 ? 'row' : 'rows'} parsed · no request
                sent yet
              </Text>
            </div>
            <Badge appearance="tint" color={allValid ? 'success' : 'warning'} size="medium">
              {validRows} of {parsed.rows.length} valid
            </Badge>
          </div>

          {invalidRows > 0 ? (
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>
                  {invalidRows} {invalidRows === 1 ? 'row needs' : 'rows need'} attention
                </MessageBarTitle>
                The register is unchanged until every row is valid.
                <ul className={styles.errorList}>
                  {parsed.errors.map((error, index) => (
                    <li key={`${error.row}-${index}`}>
                      Row {error.row}: {error.message}
                    </li>
                  ))}
                </ul>
              </MessageBarBody>
            </MessageBar>
          ) : null}

          {limitMessage ? (
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>This file is over the import limit</MessageBarTitle>
                {limitMessage}
              </MessageBarBody>
            </MessageBar>
          ) : null}

          <div className={styles.tableWrap}>
            <Table size="small" aria-label="Import preview">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Row</TableHeaderCell>
                  {columns.map((column) => (
                    <TableHeaderCell key={column.name}>{column.name}</TableHeaderCell>
                  ))}
                  <TableHeaderCell>Result</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.rows.slice(0, PREVIEW_ROWS).map((row, index) => {
                  const rowNumber = index + 1;
                  const rowErrors = parsed.errors.filter((error) => error.row === rowNumber);
                  return (
                    <TableRow key={rowNumber}>
                      <TableCell>{rowNumber}</TableCell>
                      {columns.map((column) => (
                        <TableCell key={column.name}>
                          {previewValue(rowCell(row, column.name))}
                        </TableCell>
                      ))}
                      <TableCell>
                        {rowErrors.length === 0 ? (
                          <Badge appearance="tint" color="success" size="small">
                            Ready
                          </Badge>
                        ) : (
                          <Text size={200}>
                            {rowErrors.map((error) => error.message).join('; ')}
                          </Text>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {parsed.rows.length > PREVIEW_ROWS ? (
            <Text size={200} className={styles.muted}>
              Showing the first {PREVIEW_ROWS} of {parsed.rows.length} rows.
            </Text>
          ) : null}

          <Divider />

          <div className={styles.footer}>
            <Text size={200} className={styles.muted}>
              Nothing is sent until you confirm. A rejected row changes nothing.
            </Text>
            <div className={styles.footerActions}>
              {commit.isPending ? <Spinner size="tiny" label="Importing…" /> : null}
              <Button appearance="secondary" onClick={reset} disabled={commit.isPending}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                data-testid="import-confirm"
                disabled={!canCommit}
                onClick={() => {
                  if (parsed) commit.mutate(parsed.rows);
                }}
              >
                Import {parsed.rows.length} {rowNoun}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {commit.isError && !isUnauthorized(commit.error) ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>
              {isDuplicate ? 'This file was already imported' : 'The import was rejected'}
            </MessageBarTitle>
            {errorMessage(commit.error)}
            {problemRows.length > 0 ? (
              <ul className={styles.errorList}>
                {problemRows.map((problem, index) => (
                  <li key={`${problem.row}-${index}`}>
                    Row {problem.row}: {problem.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {result ? (
        <Card className={styles.card} data-testid="import-result" role="status" aria-live="polite">
          <div className={styles.previewHeader}>
            <h2 className={styles.cardTitle}>Import complete</h2>
            <Badge appearance="tint" color="success" size="medium">
              Imported
            </Badge>
          </div>
          <Table size="small" aria-label="Import result">
            <TableBody>
              <TableRow>
                <TableCell>
                  <Text weight="semibold">Batch id</Text>
                </TableCell>
                <TableCell className={styles.resultValue}>{result.id}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <Text weight="semibold">Kind</Text>
                </TableCell>
                <TableCell>{result.kind}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <Text weight="semibold">Rows</Text>
                </TableCell>
                <TableCell>{result.rowCount}</TableCell>
              </TableRow>
              {result.written !== undefined && result.written !== null ? (
                <TableRow>
                  <TableCell>
                    <Text weight="semibold">Written</Text>
                  </TableCell>
                  <TableCell>{result.written}</TableCell>
                </TableRow>
              ) : null}
              {result.skipped !== undefined && result.skipped !== null ? (
                <TableRow>
                  <TableCell>
                    <Text weight="semibold">Skipped</Text>
                  </TableCell>
                  <TableCell>{result.skipped}</TableCell>
                </TableRow>
              ) : null}
              <TableRow>
                <TableCell>
                  <Text weight="semibold">Checksum</Text>
                </TableCell>
                <TableCell className={styles.resultValue}>{result.checksum}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <Text weight="semibold">Created</Text>
                </TableCell>
                <TableCell>{new Date(result.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Text size={200} className={styles.muted}>
            The file and the parsed rows were discarded. Only the batch id, kind, row count and
            timestamp stay in this tab&apos;s session list.
          </Text>
          <div className={styles.footerActions}>
            <Button appearance="secondary" onClick={() => setResult(null)}>
              Start another import
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
