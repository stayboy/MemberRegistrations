import {
  Badge,
  Button,
  Card,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular, KeyRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ComponentProps } from 'react';
import { isUnauthorized } from '../../api/errors';
import {
  CODE_PURPOSES,
  CODE_STATUSES,
  issueCode,
  listCodes,
  voidCode,
  type CodePurpose,
  type CodeStatus,
  type IssuedCode,
} from '../../api/ussd';
import { useSession } from '../../auth/SessionProvider';
import {
  EventSessionPicker,
  type EventSessionSelection,
} from '../../components/EventSessionPicker';
import { PageFrame } from '../../components/PageFrame';
import { ReasonDialog } from '../../components/ReasonDialog';
import {
  CODE_TTL_MINUTES,
  codePurposeLabel,
  codeStatusLabel,
  codesRemainingLabel,
} from '../../format/ussd';
import { useDateTimeFormat } from '../../shell/DateTimeProvider';
import { useUssdStyles } from './ussd-styles';

type BadgeColor = ComponentProps<typeof Badge>['color'];

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function statusColor(status: CodeStatus): BadgeColor {
  if (status === 'active') return 'success';
  if (status === 'used') return 'informative';
  if (status === 'expired') return 'subtle';
  return 'danger';
}

const PURPOSE_OPTIONS: readonly { readonly value: CodePurpose; readonly label: string }[] =
  CODE_PURPOSES.map((purpose) => ({ value: purpose, label: codePurposeLabel(purpose) }));

const STATUS_OPTIONS: readonly { readonly value: CodeStatus | ''; readonly label: string }[] = [
  { value: '', label: 'All statuses' },
  ...CODE_STATUSES.map((status) => ({ value: status, label: codeStatusLabel(status) })),
];

/**
 * USSD → Codes. A code is issued against one event session, returned in plain
 * text exactly once with its 15-minute TTL, and listed by status; an active code
 * can be voided with a reason. Redemption stays on the handset.
 */
export function UssdCodesPage() {
  const styles = useUssdStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate, formatInstant } = useDateTimeFormat();
  const queryClient = useQueryClient();
  const token = session?.token ?? '';

  const [selection, setSelection] = useState<EventSessionSelection | null>(null);
  const [purpose, setPurpose] = useState<CodePurpose>('attendance_punch');
  const [status, setStatus] = useState<CodeStatus | ''>('');
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const codesQuery = useQuery({
    queryKey: [
      'ussd',
      baseUrl,
      'codes',
      selection?.eventId ?? '',
      selection?.sessionDate ?? '',
      status,
    ],
    queryFn: ({ signal }) =>
      listCodes(
        baseUrl,
        token,
        selection!.eventId,
        selection!.sessionDate,
        status === '' ? undefined : status,
        signal,
      ),
    enabled: Boolean(token) && selection !== null,
  });

  useEffect(() => {
    if (isUnauthorized(codesQuery.error)) void signOut();
  }, [codesQuery.error, signOut]);

  const issueMutation = useMutation({
    mutationFn: () => {
      if (!selection) throw new Error('Choose an event session first.');
      return issueCode(baseUrl, token, selection.eventId, {
        purpose,
        sessionDate: selection.sessionDate,
      });
    },
    onSuccess: (code) => {
      setActionError(null);
      setIssued(code);
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'codes'] });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  const voidMutation = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      voidCode(baseUrl, token, input.id, input.reason),
    onSuccess: () => {
      setVoidTarget(null);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'codes'] });
    },
    onError: (error: unknown) => {
      setVoidTarget(null);
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  const codes = codesQuery.data ?? [];

  return (
    <PageFrame
      sectionId="ussd"
      title="USSD codes"
      submenu="Codes"
      description="Issue a one-session attendance punch or registration code, read the plain code once, and void an active code with a reason."
      actions={[
        {
          id: 'refresh',
          label: 'Refresh',
          icon: <ArrowClockwiseRegular />,
          disabled: codesQuery.isFetching || !selection,
          onSelect: () => {
            void codesQuery.refetch();
          },
        },
      ]}
    >
      <div className={styles.page}>
        <Card className={styles.panel}>
          <div className={styles.panelBody}>
            <EventSessionPicker
              value={selection}
              onChange={(next) => {
                setSelection(next);
                setIssued(null);
                setActionError(null);
              }}
            />

            <div className={styles.toolbar}>
              <Field label="Purpose" className={styles.field}>
                <Dropdown
                  aria-label="Code purpose"
                  value={codePurposeLabel(purpose)}
                  selectedOptions={[purpose]}
                  disabled={!selection}
                  onOptionSelect={(_, data) => {
                    const chosen = PURPOSE_OPTIONS.find(
                      (option) => option.value === data.optionValue,
                    );
                    if (chosen) setPurpose(chosen.value);
                  }}
                >
                  {PURPOSE_OPTIONS.map((option) => (
                    <Option key={option.value} value={option.value} text={option.label}>
                      {option.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Button
                appearance="primary"
                icon={<KeyRegular />}
                disabled={!selection || issueMutation.isPending}
                onClick={() => issueMutation.mutate()}
              >
                {issueMutation.isPending ? 'Issuing…' : 'Issue code'}
              </Button>
            </div>

            {actionError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The code action failed</MessageBarTitle>
                  {actionError}
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </div>
        </Card>

        {issued ? (
          <section className={styles.codeDisplay} aria-label="Issued code">
            <Text size={200} className={styles.muted}>
              Shown once · {codePurposeLabel(issued.purpose)} · {formatDate(issued.sessionDate)}
            </Text>
            <code className={styles.code}>{issued.code}</code>
            <Text size={200}>
              Expires {formatInstant(issued.expiresAt)} · {codesRemainingLabel(issued.expiresAt)} of
              the {CODE_TTL_MINUTES}-minute TTL
            </Text>
            <Text size={200} className={styles.muted}>
              The API stores only the hash. Copy the code now — it cannot be shown again.
            </Text>
          </section>
        ) : null}

        <section className={styles.panel} aria-label="Codes for the session">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Codes</h2>
            <Field label="Status filter" className={styles.narrowField}>
              <Dropdown
                aria-label="Status filter"
                value={STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'All'}
                selectedOptions={[status]}
                disabled={!selection}
                onOptionSelect={(_, data) => {
                  const chosen = STATUS_OPTIONS.find((option) => option.value === data.optionValue);
                  if (chosen) setStatus(chosen.value);
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value} text={option.label}>
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
            </Field>
          </div>

          {!selection ? (
            <div className={styles.empty}>
              <Text className={styles.emptyTitle}>No session selected</Text>
              <Text size={200} className={styles.muted}>
                Choose an event session above to issue and review codes.
              </Text>
            </div>
          ) : codesQuery.isPending ? (
            <div className={styles.state}>
              <Spinner label="Loading codes…" />
            </div>
          ) : codesQuery.isError ? (
            <div className={styles.panelBody}>
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Codes could not be loaded</MessageBarTitle>
                  {errorMessage(codesQuery.error)}
                </MessageBarBody>
              </MessageBar>
            </div>
          ) : codes.length === 0 ? (
            <div className={styles.empty}>
              <Text className={styles.emptyTitle}>No codes with this status</Text>
              <Text size={200} className={styles.muted}>
                Issue a code above; it stays active for {CODE_TTL_MINUTES} minutes.
              </Text>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <Table className={styles.table} size="small" aria-label="Codes">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Purpose</TableHeaderCell>
                    <TableHeaderCell>Session</TableHeaderCell>
                    <TableHeaderCell>Issued</TableHeaderCell>
                    <TableHeaderCell>Expires</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Used by</TableHeaderCell>
                    <TableHeaderCell>Action</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell>{codePurposeLabel(code.purpose)}</TableCell>
                      <TableCell>{formatDate(code.sessionDate)}</TableCell>
                      <TableCell>{formatInstant(code.issuedAt)}</TableCell>
                      <TableCell>{formatInstant(code.expiresAt)}</TableCell>
                      <TableCell>
                        <Badge appearance="tint" color={statusColor(code.status)} size="small">
                          {codeStatusLabel(code.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {code.usedByMemberNo ? (
                          <Text size={200}>{code.usedByMemberNo}</Text>
                        ) : (
                          <Text size={200} className={styles.muted}>
                            —
                          </Text>
                        )}
                      </TableCell>
                      <TableCell>
                        {code.status === 'active' ? (
                          <Button
                            size="small"
                            appearance="secondary"
                            onClick={() => {
                              setActionError(null);
                              setVoidTarget(code.id);
                            }}
                          >
                            Void
                          </Button>
                        ) : (
                          <Text size={200} className={styles.muted}>
                            —
                          </Text>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      <ReasonDialog
        open={voidTarget !== null}
        title="Void the code"
        label="Reason"
        hint="The reason is recorded with the void. A used, expired or already voided code cannot be voided."
        confirmLabel="Void code"
        required
        pending={voidMutation.isPending}
        onConfirm={(reason) => {
          if (voidTarget) voidMutation.mutate({ id: voidTarget, reason });
        }}
        onClose={() => setVoidTarget(null)}
      />
    </PageFrame>
  );
}
