import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Tab,
  TabList,
  Text,
  Textarea,
  Tooltip,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArchiveRegular,
  ArrowUndoRegular,
  CallRegular,
  ChatRegular,
  CheckmarkCircleFilled,
  CheckmarkCircleRegular,
  ContactCardRegular,
  DeleteRegular,
  DismissCircleRegular,
  EditRegular,
  MailRegular,
  MoneyRegular,
  PeopleAddRegular,
  PeopleRegular,
  ShieldCheckmarkRegular,
} from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  addCoverage,
  addMemberMinistry,
  addMemberRelationship,
  addSubscription,
  archiveMember,
  confirmMember,
  endSubscription,
  fetchMemberDetail,
  getMemberShepherding,
  listMinistries,
  purgeMember,
  removeCoverage,
  removeMemberMinistry,
  removeMemberRelationship,
  requestMemberVerification,
  restoreMember,
  revokeMemberVerification,
  type RelationshipInput,
  type SubscriptionInput,
} from '../api/members';
import { endAssignment } from '../api/shepherding';
import { useSession } from '../auth/SessionProvider';
import { AssignShepherdDialog } from '../components/AssignShepherdDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContactsDialog } from '../components/ContactsDialog';
import { MemberAvatar } from '../components/MemberAvatar';
import { PageFrame } from '../components/PageFrame';
import type { PageAction } from '../components/PageActions';
import { memberInitials, memberLabel, memberLabelFromName, memberName } from '../format/member';
import { isNotFoundError } from '../format/member-form';
import { contactsAction } from '../overview/cards';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { MemberAttendanceTab } from './MemberAttendanceTab';
import { errorMessage, verificationErrorMessage } from './member-detail-errors';
import { useMemberDetailStyles } from './member-detail-styles';
import { MemberOverviewTab } from './MemberOverviewTab';
import { MemberShepherdingTab } from './MemberShepherdingTab';
import { MemberSubscriptionsTab } from './MemberSubscriptionsTab';

type MemberTab = 'overview' | 'attendance' | 'subscriptions' | 'shepherding';

/** The three channels a verification code can take (MR-24). */
type IssuedChannel = 'phone' | 'whatsapp' | 'email';

/** MR-34: the badge names the proof a contact carries. */
function channelLabel(channel: IssuedChannel): string {
  if (channel === 'email') return 'Email';
  if (channel === 'whatsapp') return 'WhatsApp';
  return 'Phone';
}

/** The word the sent dialog's lead uses: "the member's email", not "the Email". */
function channelNoun(channel: IssuedChannel): string {
  if (channel === 'email') return 'email';
  if (channel === 'whatsapp') return 'WhatsApp';
  return 'phone';
}

function channelIcon(channel: IssuedChannel) {
  if (channel === 'email') return <MailRegular aria-hidden />;
  if (channel === 'whatsapp') return <ChatRegular aria-hidden />;
  return <CallRegular aria-hidden />;
}

/** FR-25b's sent-dialog note: the one completion surface, never the code. */
function completionNote(channel: IssuedChannel, masked: string): string {
  const channelName = channel === 'phone' ? 'SMS' : channelLabel(channel);
  return `${channelName} is completed on the member acceptance page: open the link we sent to ${masked} and enter the six-digit code. The code is never shown here, and the officer never sees it.`;
}

/**
 * Member-detail shell (FR-29): the header, actions, detail query and every
 * mutation, plus the four Fluent tabs. Tab bodies live in page-local siblings;
 * shared dialogs (contacts, archive and purge) stay here.
 */
export function MemberDetailPage() {
  const styles = useMemberDetailStyles();
  const { formatDate, formatInstantTime, formatInstantTitle } = useDateTimeFormat();
  const { memberNo: routeMemberNo } = useParams<{ memberNo: string }>();
  const memberNo = routeMemberNo ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [activeTab, setActiveTab] = useState<MemberTab>('overview');
  const [contactsOpen, setContactsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [endAssignmentOpen, setEndAssignmentOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [revokeVerificationOpen, setRevokeVerificationOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** MR-3: a menu action that owns its surface focuses that surface's own add control. */

  const detailQuery = useQuery({
    queryKey: ['member', baseUrl, memberNo],
    queryFn: ({ signal }) => fetchMemberDetail(baseUrl, token, memberNo, signal),
    enabled: Boolean(token) && Boolean(memberNo),
  });

  const ministriesQuery = useQuery({
    queryKey: ['ministries', baseUrl],
    queryFn: ({ signal }) => listMinistries(baseUrl, token, signal),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });

  const shepherdingQuery = useQuery({
    queryKey: ['member', baseUrl, memberNo, 'shepherding'],
    queryFn: ({ signal }) => getMemberShepherding(baseUrl, token, memberNo, signal),
    enabled: Boolean(token) && Boolean(memberNo) && activeTab === 'shepherding',
  });

  useEffect(() => {
    if (
      isUnauthorized(detailQuery.error) ||
      isUnauthorized(ministriesQuery.error) ||
      isUnauthorized(shepherdingQuery.error)
    ) {
      void signOut();
    }
  }, [detailQuery.error, ministriesQuery.error, shepherdingQuery.error, signOut]);

  /** MR-3: the menu switches to the tab that owns the mutation and focuses its own
   * Add control, so the menu never duplicates a form. The focus runs after the tab
   * switch has committed. */
  function focusAddControl(target: 'ministries' | 'relationships' | 'subscription'): void {
    const ids = {
      ministries: 'member-ministries-add',
      relationships: 'member-relationships-add',
      subscription: 'member-subscription-add',
    } as const;
    window.requestAnimationFrame(() => {
      document.getElementById(ids[target])?.focus();
    });
  }

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['member', baseUrl, memberNo] });
    void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
  }, [queryClient, baseUrl, memberNo]);

  const invalidateShepherding = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['member', baseUrl, memberNo] });
    void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
    void queryClient.invalidateQueries({ queryKey: ['shepherding', baseUrl] });
  }, [queryClient, baseUrl, memberNo]);

  const archiveMutation = useMutation({
    mutationFn: () => archiveMember(baseUrl, token, memberNo),
  });

  const restoreMutation = useMutation({
    mutationFn: () => restoreMember(baseUrl, token, memberNo),
  });

  const purgeMutation = useMutation({
    mutationFn: () => purgeMember(baseUrl, token, memberNo),
  });

  const addSubscriptionMutation = useMutation({
    mutationFn: (input: SubscriptionInput) => addSubscription(baseUrl, token, memberNo, input),
  });

  const endSubscriptionMutation = useMutation({
    mutationFn: (subscriptionId: string) =>
      endSubscription(baseUrl, token, memberNo, subscriptionId),
  });

  const addCoverageMutation = useMutation({
    mutationFn: (variables: { subscriptionId: string; coveredMemberNo: string }) =>
      addCoverage(baseUrl, token, variables.subscriptionId, variables.coveredMemberNo),
  });

  const removeCoverageMutation = useMutation({
    mutationFn: (variables: { subscriptionId: string; coveredMemberNo: string }) =>
      removeCoverage(baseUrl, token, variables.subscriptionId, variables.coveredMemberNo),
  });

  const addMinistryMutation = useMutation({
    mutationFn: (code: string) => addMemberMinistry(baseUrl, token, memberNo, code),
  });

  const removeMinistryMutation = useMutation({
    mutationFn: (code: string) => removeMemberMinistry(baseUrl, token, memberNo, code),
  });

  const addRelationshipMutation = useMutation({
    mutationFn: (input: RelationshipInput) =>
      addMemberRelationship(baseUrl, token, memberNo, input),
  });

  const removeRelationshipMutation = useMutation({
    mutationFn: (relationshipId: string) =>
      removeMemberRelationship(baseUrl, token, memberNo, relationshipId),
  });

  const endAssignmentMutation = useMutation({
    mutationFn: (assignmentId: string) => endAssignment(baseUrl, token, assignmentId),
  });

  const verifyMutation = useMutation({
    mutationFn: () => requestMemberVerification(baseUrl, token, memberNo),
    // A code leaves the record unchanged, but the brief asks for the member
    // queries to be refreshed on either verification action.
    onSuccess: invalidate,
  });

  const revokeVerificationMutation = useMutation({
    mutationFn: () => revokeMemberVerification(baseUrl, token, memberNo),
  });

  const confirmMutation = useMutation({
    mutationFn: (reason: string) => confirmMember(baseUrl, token, memberNo, reason),
  });

  const member = detailQuery.data?.member;
  const isArchived = Boolean(member?.archivedAt);

  function failAction(error: unknown): void {
    if (isUnauthorized(error)) {
      void signOut();
      return;
    }
    setActionError(errorMessage(error));
  }

  function confirmArchive(): void {
    setActionError(null);
    archiveMutation.mutate(undefined, {
      onSuccess: () => {
        setArchiveOpen(false);
        invalidate();
        navigate('/members');
      },
      onError: (error: unknown) => {
        setArchiveOpen(false);
        failAction(error);
      },
    });
  }

  function confirmRestore(): void {
    setActionError(null);
    restoreMutation.mutate(undefined, {
      onSuccess: () => {
        invalidate();
      },
      onError: failAction,
    });
  }

  function confirmPurge(): void {
    setActionError(null);
    purgeMutation.mutate(undefined, {
      onSuccess: () => {
        setPurgeOpen(false);
        invalidate();
        navigate(isArchived ? '/members/archived' : '/members');
      },
      onError: (error: unknown) => {
        setPurgeOpen(false);
        failAction(error);
      },
    });
  }

  function confirmEndAssignment(): void {
    const assignmentId = shepherdingQuery.data?.shepherd?.assignmentId;
    if (!assignmentId || endAssignmentMutation.isPending) return;

    setActionError(null);
    endAssignmentMutation.mutate(assignmentId, {
      onSuccess: () => {
        setEndAssignmentOpen(false);
        invalidateShepherding();
      },
      onError: (error: unknown) => {
        setEndAssignmentOpen(false);
        failAction(error);
      },
    });
  }

  /** MR-29: the officer action sends at once, with no channel choice. */
  function startVerification(): void {
    setActionError(null);
    verifyMutation.reset();
    setVerifyOpen(true);
    verifyMutation.mutate();
  }

  /** MR-31: confirm the consequence before withdrawing the proofs and confirmation. */
  function confirmRevokeVerification(): void {
    setActionError(null);
    revokeVerificationMutation.mutate(undefined, {
      onSuccess: () => {
        setRevokeVerificationOpen(false);
        invalidate();
      },
      onError: (error: unknown) => {
        setRevokeVerificationOpen(false);
        failAction(error);
      },
    });
  }

  /** MR-52: the officer confirmation records the typed reason, never a code. */
  function submitConfirmation(): void {
    setConfirmTouched(true);
    const reason = confirmReason.trim();
    if (!reason) return;
    setActionError(null);
    confirmMutation.mutate(reason, {
      onSuccess: () => {
        setConfirmOpen(false);
        setConfirmReason('');
        setConfirmTouched(false);
        invalidate();
      },
      onError: (error: unknown) => {
        setConfirmOpen(false);
        failAction(error);
      },
    });
  }

  if (detailQuery.isPending) {
    return (
      <PageFrame sectionId="members" title="Member record" submenu={memberNo}>
        <div className={styles.state}>
          <Spinner label="Loading member…" />
        </div>
      </PageFrame>
    );
  }

  if (detailQuery.isError || !member) {
    const notFound = isNotFoundError(detailQuery.error);
    return (
      <PageFrame sectionId="members" title="Member record" submenu={memberNo}>
        <MessageBar intent={notFound ? 'warning' : 'error'}>
          <MessageBarBody>
            <MessageBarTitle>
              {notFound ? 'Member not found' : 'The member could not be loaded'}
            </MessageBarTitle>
            {notFound
              ? `No member with number ${memberNo} is available in this view.`
              : errorMessage(detailQuery.error)}
            <Button
              size="small"
              appearance="transparent"
              onClick={() => {
                void detailQuery.refetch();
              }}
            >
              Retry
            </Button>
          </MessageBarBody>
        </MessageBar>
        <Button as="a" href="#/members" appearance="secondary">
          Back to members
        </Button>
      </PageFrame>
    );
  }

  const contacts = contactsAction(member.contactCount);
  // MR-34: the badge names the most recent proof. An imported legacy
  // `members.verified_at` never reaches the DTO, so it renders nothing.
  const proofs = [
    ...member.verifiedContacts.map((contact) => ({
      key: contact.id,
      label: channelLabel(contact.channel),
      detail: `${channelLabel(contact.channel)} ${contact.masked}`,
      at: contact.verifiedAt,
    })),
    ...(member.confirmedAt
      ? [
          {
            key: 'officer-confirmation',
            label: 'Officer',
            detail: 'Officer confirmed',
            at: member.confirmedAt,
          },
        ]
      : []),
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
  const latestProof = proofs[0] ?? null;
  const verifiedLabel = latestProof
    ? `Verified · ${latestProof.label} · ${formatDate(latestProof.at)}`
    : null;
  const verifiedTitle = proofs
    .map((proof) => `${proof.detail} · ${formatDate(proof.at)}`)
    .join('; ');
  // MR-24/AC-MR46: the send is offered while any owned contact still lacks a
  // proof; a proven contact is skipped by the resolver rather than blocking the
  // action. An officer confirmation means there is nothing left to prove.
  const provenContactIds = new Set(member.verifiedContacts.map((contact) => contact.id));
  const hasUnprovenContact = member.contacts.some(
    (contact) =>
      !contact.linked &&
      (contact.kind === 'email' || contact.kind === 'whatsapp' || contact.kind === 'phone') &&
      !provenContactIds.has(contact.id),
  );
  const titleAddon = {
    leading: (
      <MemberAvatar
        memberNo={member.memberNo}
        photoUpdatedAt={member.photoUpdatedAt}
        name={memberName(member)}
        initials={memberInitials(member)}
        size={32}
        data-testid="member-header-avatar"
      />
    ),
    trailing: (
      <span className={styles.titleBadges}>
        {verifiedLabel ? (
          <Tooltip content={verifiedTitle} relationship="description">
            <Badge
              appearance="filled"
              color="brand"
              icon={<CheckmarkCircleFilled aria-hidden />}
              aria-label={verifiedLabel}
              data-testid="member-verified"
            />
          </Tooltip>
        ) : null}
        {member.isPresbyter ? (
          <Badge appearance="tint" color="informative">
            Presbyter
          </Badge>
        ) : null}
        <Badge
          appearance="outline"
          color={isArchived ? 'warning' : 'success'}
          title={member.archivedAt ? formatInstantTitle(member.archivedAt) : undefined}
        >
          {isArchived ? 'Archived' : 'Active'}
        </Badge>
      </span>
    ),
  };

  const actions: PageAction[] = [
    {
      id: 'edit',
      kind: 'verb',
      label: 'Edit',
      icon: <EditRegular />,
      primary: true,
      onSelect: () => {
        navigate(`/members/${encodeURIComponent(memberNo)}/edit`);
      },
    },
    {
      id: 'contacts',
      kind: 'verb',
      label: 'View contacts',
      icon: <ContactCardRegular />,
      onSelect: () => {
        setActionError(null);
        setContactsOpen(true);
      },
    },
    {
      id: 'assign-shepherd',
      kind: 'verb',
      label: 'Assign shepherd',
      icon: <PeopleAddRegular />,
      onSelect: () => {
        setActionError(null);
        setAssignOpen(true);
      },
    },
    {
      id: 'add-ministry',
      kind: 'verb',
      label: 'Add ministry',
      icon: <AddRegular />,
      onSelect: () => {
        setActiveTab('overview');
        focusAddControl('ministries');
      },
    },
    {
      id: 'add-relationship',
      kind: 'verb',
      label: 'Add relationship',
      icon: <PeopleRegular />,
      onSelect: () => {
        setActiveTab('overview');
        focusAddControl('relationships');
      },
    },
    {
      id: 'add-subscription',
      kind: 'verb',
      label: 'Add subscription',
      icon: <MoneyRegular />,
      onSelect: () => {
        setActiveTab('subscriptions');
        focusAddControl('subscription');
      },
    },
    ...(!isArchived && member.confirmedAt === null && hasUnprovenContact
      ? [
          {
            id: 'verify-membership',
            kind: 'verb' as const,
            label: 'Verify membership',
            icon: <CheckmarkCircleRegular />,
            onSelect: startVerification,
            disabled: verifyMutation.isPending,
          },
        ]
      : []),
    ...(!isArchived && member.confirmedAt === null
      ? [
          {
            id: 'confirm-member',
            kind: 'verb' as const,
            label: 'Confirm member',
            icon: <ShieldCheckmarkRegular />,
            onSelect: () => {
              setActionError(null);
              setConfirmReason('');
              setConfirmTouched(false);
              setConfirmOpen(true);
            },
            disabled: confirmMutation.isPending,
          },
        ]
      : []),
    ...(proofs.length > 0
      ? [
          {
            id: 'revoke-verification',
            kind: 'verb' as const,
            label: 'Revoke verification',
            icon: <DismissCircleRegular />,
            onSelect: () => {
              setActionError(null);
              setRevokeVerificationOpen(true);
            },
            disabled: revokeVerificationMutation.isPending,
          },
        ]
      : []),
    isArchived
      ? {
          id: 'restore',
          kind: 'verb',
          label: 'Restore',
          icon: <ArrowUndoRegular />,
          onSelect: confirmRestore,
          disabled: restoreMutation.isPending,
          destructive: true,
        }
      : {
          id: 'archive',
          kind: 'verb',
          label: 'Archive',
          icon: <ArchiveRegular />,
          onSelect: () => setArchiveOpen(true),
          disabled: archiveMutation.isPending,
          destructive: true,
        },
    {
      id: 'purge',
      kind: 'verb',
      label: 'Purge',
      icon: <DeleteRegular />,
      onSelect: () => setPurgeOpen(true),
      destructive: true,
    },
  ];

  return (
    <PageFrame
      sectionId="members"
      title={memberLabel(member)}
      submenu={member.memberNo}
      description="Review the registration, attendance, ministries and coverage."
      actions={actions}
      titleAddon={titleAddon}
    >
      <div className={styles.page}>
        {actionError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The action did not complete</MessageBarTitle>
              {actionError}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        <div className={styles.tabRow}>
          <TabList
            selectedValue={activeTab}
            onTabSelect={(_, data) => setActiveTab(data.value as MemberTab)}
            data-testid="member-tabs"
            aria-label="Member record sections"
            className={`${styles.tabs} ${styles.tabRowTabs}`}
          >
            <Tab value="overview">Overview</Tab>
            <Tab value="attendance">Attendance</Tab>
            <Tab value="subscriptions">Welfare &amp; Services</Tab>
            <Tab value="shepherding">Shepherding</Tab>
          </TabList>
          <div className={styles.tabRowEnd}>
            {contacts.show ? (
              <Button appearance="primary" onClick={() => setContactsOpen(true)}>
                {contacts.label}
              </Button>
            ) : (
              <Text size={200} className={styles.muted}>
                {contacts.label}
              </Text>
            )}
          </div>
        </div>

        <div className={styles.tabBody}>
          {activeTab === 'overview' ? (
            <MemberOverviewTab
              member={member}
              ministries={ministriesQuery.data ?? []}
              ministriesLoading={ministriesQuery.isFetching}
              ministriesError={ministriesQuery.isError ? errorMessage(ministriesQuery.error) : null}
              addMinistryMutation={addMinistryMutation}
              removeMinistryMutation={removeMinistryMutation}
              addRelationshipMutation={addRelationshipMutation}
              removeRelationshipMutation={removeRelationshipMutation}
              onInvalidate={invalidate}
              onViewSubscriptions={() => setActiveTab('subscriptions')}
            />
          ) : null}
          {activeTab === 'attendance' ? <MemberAttendanceTab member={member} /> : null}
          {activeTab === 'subscriptions' ? (
            <MemberSubscriptionsTab
              member={member}
              addSubscriptionMutation={addSubscriptionMutation}
              endSubscriptionMutation={endSubscriptionMutation}
              addCoverageMutation={addCoverageMutation}
              removeCoverageMutation={removeCoverageMutation}
              onInvalidate={invalidate}
              onActionError={setActionError}
              onClearActionError={() => setActionError(null)}
            />
          ) : null}
          {activeTab === 'shepherding' ? (
            <MemberShepherdingTab
              summary={shepherdingQuery.data}
              isPending={shepherdingQuery.isPending}
              isError={shepherdingQuery.isError}
              error={shepherdingQuery.error}
              onRetry={() => {
                void shepherdingQuery.refetch();
              }}
              isArchived={isArchived}
              onAssign={() => {
                setActionError(null);
                setAssignOpen(true);
              }}
              onReassign={() => {
                setActionError(null);
                setAssignOpen(true);
              }}
              onEnd={() => {
                setActionError(null);
                setEndAssignmentOpen(true);
              }}
            />
          ) : null}
        </div>
      </div>

      <ContactsDialog member={member} open={contactsOpen} onOpenChange={setContactsOpen} editable />

      {assignOpen ? (
        <AssignShepherdDialog
          memberNo={member.memberNo}
          memberName={memberLabel(member)}
          currentAssignment={
            shepherdingQuery.data?.shepherd
              ? {
                  assignmentId: shepherdingQuery.data.shepherd.assignmentId,
                  officerMemberNo: shepherdingQuery.data.shepherd.memberNo,
                  officerName: memberLabelFromName(
                    shepherdingQuery.data.shepherd.name,
                    shepherdingQuery.data.shepherd.gender,
                    shepherdingQuery.data.shepherd.age,
                  ),
                  assignedOn: shepherdingQuery.data.shepherd.assignedOn,
                }
              : null
          }
          onClose={() => setAssignOpen(false)}
          onAssigned={invalidateShepherding}
        />
      ) : null}

      <ConfirmDialog
        open={endAssignmentOpen}
        title={`End the assignment for ${memberLabel(member)}?`}
        message="The assignment ends now. The assignment history and every logged call stay readable; the pastoral record is not deleted."
        confirmLabel="End assignment"
        busy={endAssignmentMutation.isPending}
        onConfirm={confirmEndAssignment}
        onCancel={() => setEndAssignmentOpen(false)}
      />

      <ConfirmDialog
        open={archiveOpen}
        title={`Archive ${memberLabel(member)}?`}
        message="The member leaves active views and history is preserved. An active shepherding assignment must be reassigned first. You can restore the member from the archived list."
        confirmLabel="Archive member"
        busy={archiveMutation.isPending}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveOpen(false)}
      />

      <ConfirmDialog
        open={revokeVerificationOpen}
        title={`Revoke the verification for ${memberLabel(member)}?`}
        message="Every contact proof and the officer confirmation are withdrawn, with an audit, and any code waiting is cancelled. The member's contacts stay, and an owned number still identifies them at USSD."
        confirmLabel="Revoke verification"
        busy={revokeVerificationMutation.isPending}
        onConfirm={confirmRevokeVerification}
        onCancel={() => setRevokeVerificationOpen(false)}
      />

      <Dialog
        open={confirmOpen}
        onOpenChange={(_, data) => {
          if (!data.open && !confirmMutation.isPending) setConfirmOpen(false);
        }}
      >
        <DialogSurface aria-label="Confirm member">
          <DialogBody>
            <DialogTitle>Confirm {memberLabel(member)}</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <Text size={200}>
                The confirmation is an officer attestation with your actor, the reason and the
                instant. It records no code and changes no contact.
              </Text>
              <Field
                label="Reason"
                hint="Stored with the confirmation and its withdrawal. The officer never sees or types a code."
                validationState={confirmTouched && !confirmReason.trim() ? 'error' : 'none'}
                validationMessage={
                  confirmTouched && !confirmReason.trim()
                    ? 'Give the reason for the confirmation.'
                    : undefined
                }
              >
                <Textarea
                  value={confirmReason}
                  autoFocus
                  resize="vertical"
                  onChange={(_, data) => {
                    setConfirmReason(data.value);
                    setConfirmTouched(true);
                  }}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                disabled={confirmMutation.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                disabled={confirmMutation.isPending || !confirmReason.trim()}
                onClick={submitConfirmation}
              >
                {confirmMutation.isPending ? 'Confirming…' : 'Confirm member'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={verifyOpen}
        onOpenChange={(_, data) => {
          if (!data.open && !verifyMutation.isPending) setVerifyOpen(false);
        }}
      >
        <DialogSurface aria-label="Verify membership">
          <DialogBody>
            <DialogTitle>Verify membership</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <Text size={200} className={styles.muted} data-testid="verify-context">
                {memberName(member)} · {member.memberNo} ·{' '}
                {proofs.length === 0 ? 'not yet verified' : 'verified'}
              </Text>
              {verifyMutation.isPending ? <Spinner label="Sending the code…" /> : null}
              {verifyMutation.isError ? (
                <MessageBar intent="warning">
                  <MessageBarBody>
                    <MessageBarTitle>The code was not sent</MessageBarTitle>
                    {verificationErrorMessage(verifyMutation.error)}
                  </MessageBarBody>
                </MessageBar>
              ) : null}
              {verifyMutation.isSuccess ? (
                <>
                  <Text data-testid="verify-lead">
                    A six-digit code was sent to the member&apos;s{' '}
                    {channelNoun(verifyMutation.data.destination.channel)} and expires at{' '}
                    {formatInstantTime(verifyMutation.data.expiresAt)}.
                  </Text>
                  <div className={styles.destinationRow} data-testid="verify-destination">
                    <span className={styles.destinationIcon}>
                      {channelIcon(verifyMutation.data.destination.channel)}
                    </span>
                    <Text size={200} className={styles.destinationKind}>
                      {channelLabel(verifyMutation.data.destination.channel)}
                    </Text>
                    <Text className={styles.destinationValue}>
                      {verifyMutation.data.destination.masked}
                    </Text>
                  </div>
                  <Text size={200} className={styles.muted} data-testid="verify-note">
                    {completionNote(
                      verifyMutation.data.destination.channel,
                      verifyMutation.data.destination.masked,
                    )}
                  </Text>
                </>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => setVerifyOpen(false)}
                disabled={verifyMutation.isPending}
              >
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={purgeOpen}
        onOpenChange={(_, data) => {
          if (!data.open && !purgeMutation.isPending) {
            setPurgeOpen(false);
            setPurgeConfirm('');
          }
        }}
      >
        <DialogSurface aria-label={`Purge ${memberLabel(member)}`}>
          <DialogBody>
            <DialogTitle>Purge {memberLabel(member)}?</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <Text className={styles.purgeWarning}>
                This permanently erases the member&apos;s personal data and cannot be undone.
              </Text>
              <Text size={200}>
                The member number stays reserved. Type the exact member number to enable the purge
                action.
              </Text>
              <Input
                value={purgeConfirm}
                aria-label="Type the member number to confirm purge"
                placeholder={member.memberNo}
                onChange={(_, data) => setPurgeConfirm(data.value)}
              />
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => {
                  setPurgeOpen(false);
                  setPurgeConfirm('');
                }}
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={confirmPurge}
                disabled={purgeConfirm !== member.memberNo || purgeMutation.isPending}
              >
                Purge permanently
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </PageFrame>
  );
}
