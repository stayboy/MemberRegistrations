import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Tab,
  TabList,
  Text,
  Tooltip,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArchiveRegular,
  ArrowUndoRegular,
  CheckmarkCircleFilled,
  ContactCardRegular,
  DeleteRegular,
  EditRegular,
  MoneyRegular,
  PeopleAddRegular,
  PeopleRegular,
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
  endSubscription,
  fetchMemberDetail,
  getMemberShepherding,
  listMinistries,
  purgeMember,
  removeCoverage,
  removeMemberMinistry,
  removeMemberRelationship,
  restoreMember,
  type RelationshipInput,
  type SubscriptionInput,
} from '../api/members';
import { endAssignment } from '../api/shepherding';
import { useSession } from '../auth/SessionProvider';
import { AssignShepherdDialog } from '../components/AssignShepherdDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContactsDialog } from '../components/ContactsDialog';
import { PageFrame } from '../components/PageFrame';
import type { PageAction } from '../components/PageActions';
import { memberInitials, memberLabel, memberLabelFromName, memberName } from '../format/member';
import { isNotFoundError } from '../format/member-form';
import { contactsAction } from '../overview/cards';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { MemberAttendanceTab } from './MemberAttendanceTab';
import { errorMessage } from './member-detail-errors';
import { useMemberDetailStyles } from './member-detail-styles';
import { MemberOverviewTab } from './MemberOverviewTab';
import { MemberShepherdingTab } from './MemberShepherdingTab';
import { MemberSubscriptionsTab } from './MemberSubscriptionsTab';

type MemberTab = 'overview' | 'attendance' | 'subscriptions' | 'shepherding';

/**
 * Member-detail shell (FR-29): the header, actions, detail query and every
 * mutation, plus the four Fluent tabs. Tab bodies live in page-local siblings;
 * shared dialogs (contacts, archive and purge) stay here.
 */
export function MemberDetailPage() {
  const styles = useMemberDetailStyles();
  const { formatDate, formatInstantTitle } = useDateTimeFormat();
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
  const verifiedLabel = member.verifiedAt ? `Verified · ${formatDate(member.verifiedAt)}` : null;
  const titleAddon = {
    leading: (
      <Avatar
        name={memberName(member)}
        initials={memberInitials(member)}
        color="colorful"
        size={32}
        data-testid="member-header-avatar"
      />
    ),
    trailing: (
      <span className={styles.titleBadges}>
        {verifiedLabel ? (
          <Tooltip content={verifiedLabel} relationship="description">
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
