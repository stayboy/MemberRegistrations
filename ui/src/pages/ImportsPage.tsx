import {
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
} from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readSheet } from 'read-excel-file/browser';
import { useEffect } from 'react';
import { isUnauthorized } from '../api/errors';
import {
  downloadImportTemplate,
  getImportFormats,
  postMemberImport,
  type ImportBatch,
  type ImportFormatColumn,
  type MemberImportRow,
} from '../api/imports';
import { recordBatch } from '../app/import-batches';
import { useSession } from '../auth/SessionProvider';
import { ImportPanel } from '../components/ImportPanel';
import { PageFrame } from '../components/PageFrame';
import { parseMemberCsv, parseMemberMatrix, type ParsedImportRows } from '../format/import-file';

const KIND = 'members' as const;

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Reads either the CSV text or the downloaded `.xlsx` workbook into the same
 * member row shapes. Neither parser is imported by the shell or another route.
 */
async function parseMemberFile(
  file: File,
  columns: readonly ImportFormatColumn[],
): Promise<ParsedImportRows<MemberImportRow>> {
  if (/\.xlsx$/i.test(file.name)) {
    const matrix = await readSheet(file);
    return parseMemberMatrix(matrix, columns);
  }
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    return parseMemberCsv(await file.text(), columns);
  }
  throw new Error('Choose a .csv file or the downloaded .xlsx template.');
}

export function ImportsPage() {
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const queryClient = useQueryClient();

  const formatsQuery = useQuery({
    queryKey: ['import-formats', baseUrl],
    queryFn: ({ signal }) => getImportFormats(baseUrl, token, signal),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (isUnauthorized(formatsQuery.error)) void signOut();
  }, [formatsQuery.error, signOut]);

  const format = formatsQuery.data?.find((candidate) => candidate.kind === KIND);

  function onCommitted(batch: ImportBatch): void {
    try {
      recordBatch(window.sessionStorage, {
        id: batch.id,
        kind: batch.kind,
        rowCount: batch.rowCount,
        createdAt: batch.createdAt,
      });
    } catch {
      // A locked-down session store must not fail a successful import.
    }

    void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
    // Refresh any open member detail so imported changes appear immediately.
    void queryClient.invalidateQueries({ queryKey: ['member', baseUrl] });
  }

  return (
    <PageFrame
      sectionId="imports"
      title="Member database"
      submenu="Member database"
      description="Import the member database export. Rows are matched on memberNo; a blank optional cell leaves the stored value unchanged. A bad file changes nothing."
      actions={
        <Button
          onClick={() => {
            void formatsQuery.refetch();
          }}
          disabled={formatsQuery.isFetching}
        >
          Refresh columns
        </Button>
      }
    >
      {formatsQuery.isPending ? (
        <Spinner label="Loading the import contract…" />
      ) : formatsQuery.isError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The import contract could not be loaded</MessageBarTitle>
            <Text size={200}>
              {formatsQuery.error instanceof Error && formatsQuery.error.message.trim()
                ? formatsQuery.error.message
                : 'Check the API connection and try again.'}
            </Text>
            <Button
              size="small"
              appearance="transparent"
              onClick={() => {
                void formatsQuery.refetch();
              }}
            >
              Retry
            </Button>
          </MessageBarBody>
        </MessageBar>
      ) : format ? (
        <ImportPanel
          columns={format.columns}
          templateFilename={format.filename}
          rowNoun="members"
          downloadTemplate={async () => {
            const template = await downloadImportTemplate(baseUrl, token, KIND, format.filename);
            saveBlob(template.blob, template.filename);
          }}
          parseFile={(file) => parseMemberFile(file, format.columns)}
          commitRows={(rows) => postMemberImport(baseUrl, token, rows)}
          onCommitted={onCommitted}
        />
      ) : (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The member import format is not published</MessageBarTitle>
            The API did not return a <code>members</code> format. Retry the request or check the API
            version.
          </MessageBarBody>
        </MessageBar>
      )}
    </PageFrame>
  );
}
