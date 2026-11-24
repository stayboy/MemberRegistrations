import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { isUnauthorized } from '../api/errors';
import {
  downloadImportTemplate,
  getImportFormats,
  postAttendanceImport,
  type ImportBatch,
} from '../api/imports';
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
 *
 * The `Dialog` is mounted by the page from its first render and driven by `open` — the surface opens
 * later, when the occurrence resolves — and it always offers a focusable `Close`. A surface that mounts
 * already open, with nothing focusable inside it, focuses the surface itself before tabster registers
 * its modalizer; tabster then marks that modalizer inactive and writes `aria-hidden` on the surface, so
 * the visible dialog leaves the accessibility tree (the deep-link e2e case that used to be parked).
 */
export function SessionImportPanel({
  open,
  occurrence,
  onClose,
  onImported,
  onSessionEnded,
}: {
  open: boolean;
  /** Null until the row or the deep link names an occurrence; the dialog then stays closed. */
  occurrence: Occurrence | null;
  onClose: () => void;
  onImported: () => void;
  /**
   * A close is not an import: the panel stays open on it, showing the session it just ended, so this
   * reports the batch without the close-the-panel path. The page still invalidates what it changed.
   */
  onSessionEnded: (batch: ImportBatch) => void;
}) {
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const sessionDate = occurrence?.date ?? '';
  // A fixed session needs no window; the range is the session's own day, so the workspace's picker
  // fields would be inert if it ever rendered them.
  const range = useMemo(() => ({ from: sessionDate, to: sessionDate }), [sessionDate]);

  const formatsQuery = useQuery({
    // The key the member import page uses, so both read one cache.
    queryKey: ['import-formats', baseUrl],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => getImportFormats(baseUrl, token, signal),
    enabled: Boolean(token) && open && occurrence !== null,
    retry: false,
  });

  useEffect(() => {
    if (isUnauthorized(formatsQuery.error)) signOut();
  }, [formatsQuery.error, signOut]);

  const format = formatsQuery.data?.find((candidate) => candidate.kind === KIND);

  /** FR-39: the batch metadata may stay in this tab; the file's rows never do. */
  function record(batch: ImportBatch): void {
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
  }

  return (
    <Dialog
      open={open && occurrence !== null}
      onOpenChange={(_, data) => (data.open ? undefined : onClose())}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Import attendance</DialogTitle>
          <DialogContent>
            {occurrence ? (
              // Keyed so a second opening starts from its own occurrence, as the conditional mount
              // this replaced used to: the workspace seeds its snapshot once.
              <AttendanceWorkspace
                key={`${occurrence.eventId}:${occurrence.date}`}
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
                  record(batch);
                  onImported();
                }}
                onEnded={(batch) => {
                  record(batch);
                  onSessionEnded(batch);
                }}
                fixedOccurrence={occurrence}
              />
            ) : null}
          </DialogContent>
          <DialogActions>
            {/* A focusable control from the first paint: with none, Fluent focuses the surface while
                the formats read is pending, and tabster deactivates the modalizer. Closing is the
                same path as Escape and the backdrop: the page clears `import` from the URL. */}
            <Button appearance="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
