import { Button, MessageBar, MessageBarBody, MessageBarTitle, Spinner, Text } from '@fluentui/react-components';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import { listEvents } from '../api/events';
import {
  downloadImportTemplate,
  getImportFormats,
  postAttendanceImport,
  type ImportBatch,
} from '../api/imports';
import { recordBatch } from '../app/import-batches';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';
import {
  AttendanceWorkspace,
  EVENT_LIMIT,
  KIND,
  errorMessage,
} from '../features/attendance-import/AttendanceWorkspace';
import { saveBlob } from '../format/download';
import { importableEvents, initialRange } from '../format/occurrence';

export function ImportsAttendancePage() {
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const seriesId = searchParams.get('series')?.trim() || undefined;

  const [range, setRange] = useState(() => initialRange(searchParams));
  const rangeValid = range.from <= range.to;

  const eventsQuery = useQuery({
    queryKey: ['events', baseUrl, range.from, range.to, seriesId ?? ''],
    queryFn: ({ signal }) =>
      listEvents(baseUrl, token, {
        from: range.from,
        to: range.to,
        seriesId,
        limit: EVENT_LIMIT,
        signal,
      }),
    enabled: Boolean(token) && rangeValid,
    // Keeps the previous window visible while a new window loads, so a range
    // edit can never unmount the workspace below.
    placeholderData: keepPreviousData,
  });

  const formatsQuery = useQuery({
    queryKey: ['import-formats', baseUrl],
    queryFn: ({ signal }) => getImportFormats(baseUrl, token, signal),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (isUnauthorized(eventsQuery.error) || isUnauthorized(formatsQuery.error)) void signOut();
  }, [eventsQuery.error, formatsQuery.error, signOut]);

  const events = useMemo(() => importableEvents(eventsQuery.data ?? []), [eventsQuery.data]);
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

    // The member detail's attendance line and any open members list.
    void queryClient.invalidateQueries({ queryKey: ['member', baseUrl] });
    void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });

    // The prefix covers an open session report, the event detail's present/expected column and the
    // list counts.
    void queryClient.invalidateQueries({ queryKey: ['events', baseUrl] });
    // The series detail's summary tile and the imports batch list (AC-7).
    void queryClient.invalidateQueries({ queryKey: ['series', baseUrl] });
    void queryClient.invalidateQueries({ queryKey: ['imports', baseUrl] });
  }

  return (
    <PageFrame
      sectionId="imports"
      title="Attendance registry"
      submenu="Attendance registry"
      description="Upload attendance for one event session. Choose the session first; the file's optional datetime must fall on it. A bad file changes nothing."
      actions={[
        {
          id: 'refresh',
          kind: 'utility',
          label: 'Refresh',
          icon: <ArrowClockwiseRegular />,
          onSelect: () => {
            void eventsQuery.refetch();
            void formatsQuery.refetch();
          },
          disabled: eventsQuery.isFetching || formatsQuery.isFetching,
        },
      ]}
    >
      {eventsQuery.data === undefined ? (
        eventsQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Events could not be loaded</MessageBarTitle>
              <Text size={200}>{errorMessage(eventsQuery.error)}</Text>
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void eventsQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : (
          <Spinner label="Loading events…" />
        )
      ) : (
        <AttendanceWorkspace
          events={events}
          range={range}
          onRangeChange={setRange}
          format={format}
          formatsPending={formatsQuery.isPending}
          formatsError={formatsQuery.error}
          onRetryFormats={() => {
            void formatsQuery.refetch();
          }}
          downloadTemplate={async () => {
            const template = await downloadImportTemplate(baseUrl, token, KIND, format?.filename);
            saveBlob(template.blob, template.filename);
          }}
          commitRows={(occurrence, rows) =>
            postAttendanceImport(baseUrl, token, {
              eventId: occurrence.eventId,
              sessionDate: occurrence.sessionDate,
              rows,
            })
          }
          endSession={(occurrence) =>
            postAttendanceImport(baseUrl, token, {
              eventId: occurrence.eventId,
              sessionDate: occurrence.sessionDate,
              rows: [],
              ended: true,
            })
          }
          onCommitted={onCommitted}
        />
      )}
    </PageFrame>
  );
}

