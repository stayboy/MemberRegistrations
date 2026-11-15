import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isUnauthorized } from '../api/errors';
import { downloadImportTemplate, getImportFormats, postAttendanceImport } from '../api/imports';
import { recordBatch } from '../app/import-batches';
import { useSession } from '../auth/SessionProvider';
import {
  AttendanceWorkspace,
  KIND,
  type Occurrence,
} from '../features/attendance-import/AttendanceWorkspace';
import { saveBlob } from '../format/download';

/**
 * The attendance import, opened from a session row (owner, 2026-11-15).
 *
 * The session is fixed: the row that opened it is the one the file must match (FR-36a), so the picker,
 * the date window and the URL seeding have no caller here. Everything else — the expected columns, the
 * parsed preview, the commit and the end-only close — is the workspace the page used, unchanged.
 *
 * The occurrence comes from the row's own event and session, so a panel can never disagree with the row
 * it was opened from.
 */
export function SessionImportPanel({
  open,
  occurrence,
  onClose,
  onImported,
}: {
  open: boolean;
  occurrence: Occurrence;
  onClose: () => void;
  onImported: () => void;
}) {
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  // A fixed session needs no window; the range is the session's own day, so the workspace's picker
  // fields would be inert if it ever rendered them.
  const [range] = useState(() => ({ from: occurrence.date, to: occurrence.date }));

  const formatsQuery = useQuery({
    // The key the member import page uses, so both read one cache.
    queryKey: ['import-formats', baseUrl],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => getImportFormats(baseUrl, token, signal),
    enabled: Boolean(token) && open,
    retry: false,
  });

  useEffect(() => {
    if (isUnauthorized(formatsQuery.error)) signOut();
  }, [formatsQuery.error, signOut]);

  const format = formatsQuery.data?.find((candidate) => candidate.kind === KIND);

  return (
    <Dialog open={open} onOpenChange={(_, data) => (data.open ? undefined : onClose())}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Import attendance</DialogTitle>
          <DialogContent>
            <AttendanceWorkspace
              events={[]}
              range={range}
              onRangeChange={() => {}}
              format={format}
              formatsPending={formatsQuery.isPending}
              formatsError={formatsQuery.error}
              onRetryFormats={() => void formatsQuery.refetch()}
              downloadTemplate={async () => {
                const template = await downloadImportTemplate(
                  baseUrl,
                  token,
                  KIND,
                  format?.filename,
                );
                saveBlob(template.blob, template.filename);
              }}
              commitRows={(target, rows) =>
                postAttendanceImport(baseUrl, token, {
                  eventId: target.eventId,
                  sessionDate: target.sessionDate,
                  rows,
                })
              }
              endSession={(target) =>
                postAttendanceImport(baseUrl, token, {
                  eventId: target.eventId,
                  sessionDate: target.sessionDate,
                  rows: [],
                  ended: true,
                })
              }
              onCommitted={(batch) => {
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
                onImported();
              }}
              fixedOccurrence={occurrence}
            />
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
