import {
  Badge,
  Button,
  Card,
  Divider,
  Field,
  Input,
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
  tokens,
} from '@fluentui/react-components';
import { SearchRegular } from '@fluentui/react-icons';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { isUnauthorized } from '../api/errors';
import { getImportBatch, type ImportBatch } from '../api/imports';
import { clearBatches, readBatches, type StoredImportBatch } from '../app/import-batches';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)',
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
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
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
  mono: {
    fontFamily: tokens.fontFamilyMonospace,
    overflowWrap: 'anywhere',
  },
  lookupForm: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  lookupField: {
    flex: '1 1 240px',
    minWidth: '200px',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalXL,
    textAlign: 'center',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function BatchResult({ batch }: { batch: ImportBatch }) {
  const styles = useStyles();

  return (
    <Card className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Batch</h2>
        <Badge
          appearance="tint"
          color={batch.kind === 'members' ? 'brand' : 'informative'}
          size="medium"
        >
          {batch.kind}
        </Badge>
      </div>
      <Table size="small" aria-label="Import batch">
        <TableBody>
          <TableRow>
            <TableCell>
              <Text weight="semibold">Batch id</Text>
            </TableCell>
            <TableCell className={styles.mono}>{batch.id}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Text weight="semibold">Kind</Text>
            </TableCell>
            <TableCell>{batch.kind}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Text weight="semibold">Rows</Text>
            </TableCell>
            <TableCell>{batch.rowCount}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Text weight="semibold">Checksum</Text>
            </TableCell>
            <TableCell className={styles.mono}>{batch.checksum}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Text weight="semibold">Created</Text>
            </TableCell>
            <TableCell>{formatTimestamp(batch.createdAt)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Text weight="semibold">Actor</Text>
            </TableCell>
            <TableCell>{batch.actor}</TableCell>
          </TableRow>
          {batch.sessionDate ? (
            <TableRow>
              <TableCell>
                <Text weight="semibold">Session date</Text>
              </TableCell>
              <TableCell>{batch.sessionDate}</TableCell>
            </TableRow>
          ) : null}
          {typeof batch.written === 'number' ? (
            <TableRow>
              <TableCell>
                <Text weight="semibold">Rows written</Text>
              </TableCell>
              <TableCell>{batch.written}</TableCell>
            </TableRow>
          ) : null}
          {typeof batch.skipped === 'number' ? (
            <TableRow>
              <TableCell>
                <Text weight="semibold">Rows skipped</Text>
              </TableCell>
              <TableCell>{batch.skipped}</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </Card>
  );
}

export function ImportBatchesPage() {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [batches, setBatches] = useState<StoredImportBatch[]>(() => {
    try {
      return readBatches(window.sessionStorage);
    } catch {
      return [];
    }
  });
  const [batchId, setBatchId] = useState('');

  const lookup = useMutation({
    mutationFn: (id: string) => getImportBatch(baseUrl, token, id),
    onError: (error: unknown) => {
      if (isUnauthorized(error)) void signOut();
    },
  });

  function submit(event: FormEvent): void {
    event.preventDefault();
    const id = batchId.trim();
    if (!id || lookup.isPending) return;
    lookup.mutate(id);
  }

  function lookupBatch(id: string): void {
    setBatchId(id);
    lookup.mutate(id);
  }

  function clear(): void {
    try {
      clearBatches(window.sessionStorage);
    } catch {
      // A locked-down session store has nothing to clear.
    }
    setBatches([]);
  }

  return (
    <PageFrame
      sectionId="imports"
      title="Batch lookup"
      submenu="Batch lookup"
      description="Resolve a batch id through the API, and review the batches this tab created. The API keeps no list endpoint, so this is not server-side history."
    >
      <div className={styles.grid}>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>This tab&apos;s imports</h2>
            <Badge appearance="tint" color="informative" size="medium">
              {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
            </Badge>
          </div>
          <Text size={200} className={styles.muted}>
            Only the batch id, kind, row count and timestamp are stored. Rows and file contents are
            never kept.
          </Text>

          {batches.length === 0 ? (
            <div className={styles.empty}>
              <Text weight="semibold">No imports from this tab yet</Text>
              <Text size={200} className={styles.muted}>
                A confirmed member or attendance import appears here for this browser tab.
              </Text>
            </div>
          ) : (
            <div>
              <Table size="small" aria-label="Batches from this tab">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Batch id</TableHeaderCell>
                    <TableHeaderCell>Kind</TableHeaderCell>
                    <TableHeaderCell>Rows</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell>
                      <span className={styles.muted}>Actions</span>
                    </TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className={styles.mono}>{batch.id}</TableCell>
                      <TableCell>{batch.kind}</TableCell>
                      <TableCell>{batch.rowCount}</TableCell>
                      <TableCell>{formatTimestamp(batch.createdAt)}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          appearance="subtle"
                          icon={<SearchRegular />}
                          aria-label={`Look up batch ${batch.id}`}
                          onClick={() => lookupBatch(batch.id)}
                          disabled={lookup.isPending}
                        >
                          Look up
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {batches.length > 0 ? (
            <div className={styles.actions}>
              <Button appearance="secondary" onClick={clear}>
                Clear this tab&apos;s list
              </Button>
            </div>
          ) : null}
        </Card>

        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>Look up a batch id</h2>
          <Text size={200} className={styles.muted}>
            Any batch id resolves through <code>GET /v1/imports/:batchId</code>, including one from
            another tab.
          </Text>
          <form className={styles.lookupForm} onSubmit={submit}>
            <Field className={styles.lookupField} label="Batch id">
              <Input
                value={batchId}
                placeholder="Batch id"
                onChange={(_, data) => setBatchId(data.value)}
                disabled={lookup.isPending}
              />
            </Field>
            <Button
              type="submit"
              appearance="primary"
              icon={<SearchRegular />}
              disabled={lookup.isPending || batchId.trim().length === 0}
            >
              Look up
            </Button>
          </form>
          {lookup.isPending ? <Spinner size="tiny" label="Looking up the batch…" /> : null}
          {lookup.isError ? (
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>The batch could not be loaded</MessageBarTitle>
                {errorMessage(lookup.error)}
              </MessageBarBody>
            </MessageBar>
          ) : null}
          <Divider />
          <Text size={200} className={styles.muted}>
            Batch ids are opaque. A 404 means the id is unknown to this API, not that the import was
            undone.
          </Text>
        </Card>
      </div>

      {lookup.data ? <BatchResult batch={lookup.data} /> : null}
    </PageFrame>
  );
}
