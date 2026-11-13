import {
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
} from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { isUnauthorized } from '../api/errors';
import {
  downloadImportTemplate,
  getImportFormats,
  postMemberImport,
  type ImportBatch,
} from '../api/imports';
import { recordBatch } from '../app/import-batches';
import { useSession } from '../auth/SessionProvider';
import { ImportPanel } from '../components/ImportPanel';
import { PageFrame } from '../components/PageFrame';
import { saveBlob } from '../format/download';
import { parseMemberMatrix, readImportMatrix } from '../format/import-file';

const KIND = 'members' as const;

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
      actions={[
        {
          id: 'refresh-columns',
          label: 'Refresh columns',
          onSelect: () => {
            void formatsQuery.refetch();
          },
          disabled: formatsQuery.isFetching,
        },
      ]}
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
          parseFile={async (file) =>
            parseMemberMatrix(await readImportMatrix(file), format.columns)
          }
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
