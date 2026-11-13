import {
  Badge,
  Button,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Spinner,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  endAssignment,
  getRoster,
  listOfficers,
  type OfficerSummary,
  type RosterEntry,
} from '../api/shepherding';
import { useSession } from '../auth/SessionProvider';
import { AssignShepherdDialog } from '../components/AssignShepherdDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContactsDialog, type ContactsDialogMember } from '../components/ContactsDialog';
import { PageFrame } from '../components/PageFrame';
import { contactLabel, memberLabelFromName } from '../format/member';
import { isFollowUp, outcomeLabel, stillInChurchLabel } from '../format/shepherding';
import { LogCallDialog } from './LogCallDialog';
import { DateWindowControl, useDateWindow } from '../components/DateWindowControl';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { useShepherdingStyles } from './shepherding-styles';

type RosterFilter = 'all' | 'never_called' | 'follow_up';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function officersHref(from: string, to: string): string {
  return `/shepherding/officers?from=${from}&to=${to}`;
}

function OfficerPicker({
  officers,
  value,
  onChange,
}: {
  officers: readonly OfficerSummary[];
  value: string;
  onChange: (memberNo: string) => void;
}) {
  const selected = officers.find((officer) => officer.memberNo === value);
  const selectedLabel = selected
    ? memberLabelFromName(selected.name || selected.memberNo, selected.gender, selected.age)
    : '';

  return (
    <Field label="Officer">
      <Dropdown
        aria-label="Officer"
        value={selected ? `${selectedLabel} · ${selected.memberNo}` : ''}
        selectedOptions={value ? [value] : []}
        placeholder="Choose an officer"
        onOptionSelect={(_, data) => {
          if (data.optionValue) onChange(data.optionValue);
        }}
      >
        {officers.map((officer) => {
          const label = memberLabelFromName(
            officer.name || officer.memberNo,
            officer.gender,
            officer.age,
          );
          return (
            <Option
              key={officer.memberNo}
              value={officer.memberNo}
              text={`${label} · ${officer.memberNo}`}
            >
              {label} · {officer.memberNo}
            </Option>
          );
        })}
      </Dropdown>
    </Field>
  );
}

function StillInChurchCell({ entry }: { entry: RosterEntry }) {
  const styles = useShepherdingStyles();
  if (!entry.stillInChurch) return <Text className={styles.muted}>{stillInChurchLabel(null)}</Text>;

  return (
    <Badge
      appearance="outline"
      color={
        entry.stillInChurch === 'yes'
          ? 'success'
          : entry.stillInChurch === 'no'
            ? 'warning'
            : 'subtle'
      }
      size="small"
    >
      {stillInChurchLabel(entry.stillInChurch)}
    </Badge>
  );
}

/**
 * Shepherding → Roster (FR-59/FR-60): one officer's active assignments for the
 * shared window, with the All / Never called / Follow-up filter and the
 * append-only call action. Contact values never render here; the Contacts action
 * opens the shared read-only dialog (Q157, FR-78).
 */
export function ShepherdingRosterPage() {
  const styles = useShepherdingStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate } = useDateTimeFormat();
  const token = session?.token ?? '';
  const [window, setWindow] = useDateWindow();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const officerParam = searchParams.get('officer') ?? '';
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [contactsFor, setContactsFor] = useState<RosterEntry | null>(null);
  const [callFor, setCallFor] = useState<RosterEntry | null>(null);
  const [assignFor, setAssignFor] = useState<RosterEntry | null>(null);
  const [endFor, setEndFor] = useState<RosterEntry | null>(null);

  const officersQuery = useQuery({
    queryKey: ['shepherding', baseUrl, 'officers', window.from, window.to],
    queryFn: ({ signal }) => listOfficers(baseUrl, token, window, signal),
    enabled: Boolean(token),
  });

  const officers = officersQuery.data ?? [];
  const selectedOfficer = officers.find((officer) => officer.memberNo === officerParam);
  const officerKnown = officersQuery.isSuccess && selectedOfficer !== undefined;

  const rosterQuery = useQuery({
    queryKey: ['shepherding', baseUrl, 'roster', officerParam, window.from, window.to],
    queryFn: ({ signal }) => getRoster(baseUrl, token, officerParam, window, signal),
    enabled: Boolean(token) && officerParam.length > 0 && officerKnown,
  });

  useEffect(() => {
    if (isUnauthorized(officersQuery.error) || isUnauthorized(rosterQuery.error)) {
      void signOut();
    }
  }, [officersQuery.error, rosterQuery.error, signOut]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['shepherding', baseUrl] });
  }, [queryClient, baseUrl]);

  const endMutation = useMutation({
    mutationFn: (assignmentId: string) => endAssignment(baseUrl, token, assignmentId),
  });

  function selectOfficer(memberNo: string): void {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.set('officer', memberNo);
        return params;
      },
      { replace: true },
    );
  }

  function confirmEnd(): void {
    if (!endFor || endMutation.isPending) return;

    setActionError(null);
    endMutation.mutate(endFor.assignmentId, {
      onSuccess: () => {
        setEndFor(null);
        invalidate();
      },
      onError: (error: unknown) => {
        setEndFor(null);
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        setActionError(errorMessage(error));
      },
    });
  }

  const entries = rosterQuery.data?.items ?? [];
  const filtered = entries.filter((entry) => {
    if (filter === 'never_called') return entry.lastCalledOn === null;
    if (filter === 'follow_up') return isFollowUp(entry);
    return true;
  });

  const contactsMember: ContactsDialogMember | null = contactsFor
    ? {
        memberNo: contactsFor.memberNo,
        firstName: '',
        lastName: '',
        gender: contactsFor.gender,
        age: contactsFor.age,
        displayName: memberLabelFromName(
          contactsFor.name || contactsFor.memberNo,
          contactsFor.gender,
          contactsFor.age,
        ),
      }
    : null;

  const rosterReady = officerParam.length > 0 && officerKnown;

  return (
    <PageFrame
      sectionId="shepherding"
      title="Shepherding roster"
      submenu="Roster"
      description="One officer's active assignments for the selected window. Calls are append-only; a correction is a new call."
      actions={[
        {
          id: 'refresh',
          label: 'Refresh',
          icon: <ArrowClockwiseRegular />,
          onSelect: () => {
            void rosterQuery.refetch();
            void officersQuery.refetch();
          },
          disabled: rosterQuery.isFetching || officersQuery.isFetching,
        },
      ]}
    >
      <div className={styles.page}>
        <DateWindowControl
          value={window}
          onChange={setWindow}
          label="Shepherding date window"
          hint="UTC dates · calls outside this window are not counted."
        />

        {actionError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The action did not complete</MessageBarTitle>
              {actionError}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {officersQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Officers could not be loaded</MessageBarTitle>
              {errorMessage(officersQuery.error)}
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void officersQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {!officerParam ? (
          <section className={styles.panel} aria-label="Choose an officer">
            <div className={styles.empty}>
              <Text className={styles.emptyTitle}>Choose an officer</Text>
              <Text size={200} className={styles.muted}>
                A roster belongs to one officer. Pick an officer to see their members, or open one
                from the Officers screen.
              </Text>
              <div className={styles.filterRow}>
                <OfficerPicker officers={officers} value={officerParam} onChange={selectOfficer} />
                <Link className={styles.link} to={officersHref(window.from, window.to)}>
                  Back to officers
                </Link>
              </div>
            </div>
          </section>
        ) : officersQuery.isPending ? (
          <div className={styles.state}>
            <Spinner label="Loading officers…" />
          </div>
        ) : officersQuery.isError ? null : !officerKnown ? (
          <section className={styles.panel} aria-label="Choose an officer">
            <div className={styles.empty}>
              <Text className={styles.emptyTitle}>Officer not found in this view</Text>
              <Text size={200} className={styles.muted}>
                {officerParam} is not an active presbyter with an officer roster. Choose another
                officer.
              </Text>
              <div className={styles.filterRow}>
                <OfficerPicker officers={officers} value="" onChange={selectOfficer} />
                <Link className={styles.link} to={officersHref(window.from, window.to)}>
                  Back to officers
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        {rosterReady ? (
          <>
            <div className={styles.filterRow}>
              <Text weight="semibold">
                {selectedOfficer
                  ? memberLabelFromName(
                      selectedOfficer.name || selectedOfficer.memberNo,
                      selectedOfficer.gender,
                      selectedOfficer.age,
                    )
                  : officerParam}
              </Text>
              <Text size={200} className={styles.muted}>
                {selectedOfficer?.memberNo} ·{' '}
                <Link className={styles.link} to={officersHref(window.from, window.to)}>
                  all officers
                </Link>
              </Text>
              <TabList
                selectedValue={filter}
                onTabSelect={(_, data) => setFilter(data.value as RosterFilter)}
                aria-label="Roster filter"
              >
                <Tab value="all">All</Tab>
                <Tab value="never_called">Never called</Tab>
                <Tab value="follow_up">Follow-up</Tab>
              </TabList>
            </div>

            {rosterQuery.isError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The roster could not be loaded</MessageBarTitle>
                  {errorMessage(rosterQuery.error)}
                  <Button
                    size="small"
                    appearance="transparent"
                    onClick={() => {
                      void rosterQuery.refetch();
                    }}
                  >
                    Retry
                  </Button>
                </MessageBarBody>
              </MessageBar>
            ) : null}

            {rosterQuery.isError ? null : (
              <section className={styles.panel} aria-label="Officer roster">
                {rosterQuery.isPending ? (
                  <div className={styles.state}>
                    <Spinner label="Loading roster…" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className={styles.empty}>
                    <Text className={styles.emptyTitle}>
                      {entries.length === 0 ? 'No active assignments' : 'No members match'}
                    </Text>
                    <Text size={200} className={styles.muted}>
                      {entries.length === 0
                        ? 'This officer holds no active assignments in the selected view.'
                        : 'Try All, or widen the date window.'}
                    </Text>
                  </div>
                ) : (
                  <div className={styles.tableWrap}>
                    <Table className={styles.rosterTable} size="small" aria-label="Officer roster">
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell>Member</TableHeaderCell>
                          <TableHeaderCell>Residence</TableHeaderCell>
                          <TableHeaderCell>Contacts</TableHeaderCell>
                          <TableHeaderCell>Attempts</TableHeaderCell>
                          <TableHeaderCell>Conversations</TableHeaderCell>
                          <TableHeaderCell>Last called</TableHeaderCell>
                          <TableHeaderCell>Last outcome</TableHeaderCell>
                          <TableHeaderCell>Still in church</TableHeaderCell>
                          <TableHeaderCell>Latest feedback</TableHeaderCell>
                          <TableHeaderCell>Latest issue</TableHeaderCell>
                          <TableHeaderCell>Actions</TableHeaderCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((entry) => {
                          const label = memberLabelFromName(
                            entry.name || entry.memberNo,
                            entry.gender,
                            entry.age,
                          );
                          return (
                            <TableRow key={entry.assignmentId}>
                              <TableCell>
                                <div className={styles.identity}>
                                  <Link
                                    className={styles.link}
                                    to={`/members/${encodeURIComponent(entry.memberNo)}`}
                                  >
                                    {label}
                                  </Link>
                                  <Text size={200} className={styles.muted}>
                                    {entry.memberNo}
                                  </Text>
                                </div>
                              </TableCell>
                              <TableCell>
                                {entry.placeOfResidence || <Text className={styles.muted}>—</Text>}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="small"
                                  appearance="transparent"
                                  aria-label={`${contactLabel(entry.contactCount)} for ${label}`}
                                  onClick={() => setContactsFor(entry)}
                                >
                                  {contactLabel(entry.contactCount)}
                                </Button>
                              </TableCell>
                              <TableCell>{entry.attempts}</TableCell>
                              <TableCell>{entry.conversations}</TableCell>
                              <TableCell>
                                {entry.lastCalledOn ? (
                                  formatDate(entry.lastCalledOn)
                                ) : (
                                  <Text className={styles.muted}>Never called</Text>
                                )}
                              </TableCell>
                              <TableCell>{outcomeLabel(entry.lastOutcome)}</TableCell>
                              <TableCell>
                                <StillInChurchCell entry={entry} />
                              </TableCell>
                              <TableCell>
                                {entry.latestFeedback ? (
                                  <Text size={200}>{entry.latestFeedback}</Text>
                                ) : (
                                  <Text className={styles.muted}>—</Text>
                                )}
                              </TableCell>
                              <TableCell>
                                {entry.latestIssue ? (
                                  <Text size={200}>{entry.latestIssue}</Text>
                                ) : (
                                  <Text className={styles.muted}>—</Text>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className={styles.actions}>
                                  <Button
                                    size="small"
                                    appearance="primary"
                                    onClick={() => {
                                      setActionError(null);
                                      setCallFor(entry);
                                    }}
                                  >
                                    Log call
                                  </Button>
                                  <Button
                                    size="small"
                                    appearance="secondary"
                                    onClick={() => {
                                      setActionError(null);
                                      setAssignFor(entry);
                                    }}
                                  >
                                    Reassign
                                  </Button>
                                  <Button
                                    size="small"
                                    appearance="subtle"
                                    onClick={() => {
                                      setActionError(null);
                                      setEndFor(entry);
                                    }}
                                  >
                                    End assignment
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            )}
          </>
        ) : null}
      </div>

      <ContactsDialog
        member={contactsMember}
        open={contactsFor !== null}
        onOpenChange={(open) => {
          if (!open) setContactsFor(null);
        }}
      />

      {callFor ? (
        <LogCallDialog
          assignmentId={callFor.assignmentId}
          memberName={memberLabelFromName(
            callFor.name || callFor.memberNo,
            callFor.gender,
            callFor.age,
          )}
          assignedOn={callFor.assignedOn}
          onClose={() => setCallFor(null)}
          onLogged={invalidate}
        />
      ) : null}

      {assignFor ? (
        <AssignShepherdDialog
          memberNo={assignFor.memberNo}
          memberName={memberLabelFromName(
            assignFor.name || assignFor.memberNo,
            assignFor.gender,
            assignFor.age,
          )}
          currentAssignment={{
            assignmentId: assignFor.assignmentId,
            officerMemberNo: selectedOfficer?.memberNo ?? officerParam,
            officerName: selectedOfficer
              ? memberLabelFromName(
                  selectedOfficer.name || selectedOfficer.memberNo,
                  selectedOfficer.gender,
                  selectedOfficer.age,
                )
              : undefined,
            assignedOn: assignFor.assignedOn,
          }}
          onClose={() => setAssignFor(null)}
          onAssigned={invalidate}
        />
      ) : null}

      <ConfirmDialog
        open={endFor !== null}
        title={
          endFor
            ? `End the assignment for ${memberLabelFromName(
                endFor.name || endFor.memberNo,
                endFor.gender,
                endFor.age,
              )}?`
            : 'End assignment?'
        }
        message="The assignment ends now. The assignment history and every logged call stay readable; the pastoral record is not deleted."
        confirmLabel="End assignment"
        busy={endMutation.isPending}
        onConfirm={confirmEnd}
        onCancel={() => setEndFor(null)}
      />
    </PageFrame>
  );
}
