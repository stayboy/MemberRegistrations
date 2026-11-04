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
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Spinner,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArchiveRegular,
  ArrowUndoRegular,
  ContactCardRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
  PersonAddRegular,
  StopRegular,
} from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, isUnauthorized } from '../api/errors';
import {
  addCoverage,
  addSubscription,
  archiveMember,
  endSubscription,
  fetchMemberDetail,
  purgeMember,
  removeCoverage,
  restoreMember,
  type MemberSubscription,
  type SubscriptionInput,
} from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContactsDialog } from '../components/ContactsDialog';
import { PageFrame } from '../components/PageFrame';
import {
  contactLabel,
  formatDateLong,
  formatDateShort,
  memberInitials,
  memberName,
} from '../format/member';
import { genderLabel, isNotFoundError } from '../format/member-form';
import {
  SUBSCRIPTION_KIND_OPTIONS,
  SUBSCRIPTION_SCOPE_OPTIONS,
  addCoveredMemberNo,
  coveredMemberNosLabel,
  coverageCountLabel,
  createEmptySubscriptionForm,
  subscriptionKindLabel,
  subscriptionRoleLabel,
  subscriptionScopeLabel,
  subscriptionStatusLabel,
  toSubscriptionPayload,
  validateCoverageMemberNo,
  validateSubscriptionForm,
  type SubscriptionFormErrors,
  type SubscriptionFormValues,
} from '../format/subscription';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    width: '100%',
  },
  state: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
    ...shorthands.border('1px', 'dashed', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  identityHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: tokens.spacingHorizontalL,
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  detailLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  detailValue: {
    wordBreak: 'break-word',
  },
  pills: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  rowCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
  },
  rowHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  entryList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  entry: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  dialogGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalL,
  },
  coverage: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalXS,
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
  },
  coveredEditor: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  coveredAdd: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    maxWidth: '360px',
  },
  purgeWarning: {
    color: tokens.colorPaletteRedForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/** 404/409/422 carry a domain reason; show it inside the dialog, not as a banner. */
function inlineActionError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && [404, 409, 422].includes(error.status)) {
    return error.message;
  }
  return fallback;
}

function statusLabel(status: string): string {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Ongoing';
}

function DetailItem({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <div className={styles.detailItem}>
      <Text className={styles.detailLabel}>{label}</Text>
      <Text className={styles.detailValue}>{value || '—'}</Text>
    </div>
  );
}

export function MemberDetailPage() {
  const styles = useStyles();
  const { memberNo: routeMemberNo } = useParams<{ memberNo: string }>();
  const memberNo = routeMemberNo ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [contactsOpen, setContactsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [subscriptionForm, setSubscriptionForm] = useState<SubscriptionFormValues>(() =>
    createEmptySubscriptionForm(),
  );
  const [subscriptionErrors, setSubscriptionErrors] = useState<SubscriptionFormErrors>({});
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [coveredDraft, setCoveredDraft] = useState('');
  const [coveredDraftError, setCoveredDraftError] = useState<string | null>(null);
  const [endTarget, setEndTarget] = useState<MemberSubscription | null>(null);
  const [coverageTarget, setCoverageTarget] = useState<MemberSubscription | null>(null);
  const [coverageMemberNo, setCoverageMemberNo] = useState('');
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [removeCoverageTarget, setRemoveCoverageTarget] = useState<{
    subscription: MemberSubscription;
    memberNo: string;
  } | null>(null);

  const detailQuery = useQuery({
    queryKey: ['member', baseUrl, memberNo],
    queryFn: ({ signal }) => fetchMemberDetail(baseUrl, token, memberNo, signal),
    enabled: Boolean(token) && Boolean(memberNo),
  });

  useEffect(() => {
    if (isUnauthorized(detailQuery.error)) void signOut();
  }, [detailQuery.error, signOut]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
    void queryClient.invalidateQueries({ queryKey: ['member', baseUrl, memberNo] });
  };

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

  function setSubscriptionField<Key extends keyof SubscriptionFormValues>(
    key: Key,
    value: SubscriptionFormValues[Key],
  ): void {
    setSubscriptionForm((current) => ({ ...current, [key]: value }));
    setSubscriptionErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function openAddSubscription(): void {
    setSubscriptionForm(createEmptySubscriptionForm());
    setSubscriptionErrors({});
    setSubscriptionError(null);
    setCoveredDraft('');
    setCoveredDraftError(null);
    setSubscriptionOpen(true);
  }

  function addCoveredMember(): void {
    const result = addCoveredMemberNo(subscriptionForm.coveredMemberNos, coveredDraft);
    if (result.error) {
      setCoveredDraftError(result.error);
      return;
    }

    setSubscriptionField('coveredMemberNos', result.memberNos);
    setCoveredDraft('');
    setCoveredDraftError(null);
  }

  function removeCoveredMember(coveredMemberNo: string): void {
    setSubscriptionField(
      'coveredMemberNos',
      subscriptionForm.coveredMemberNos.filter((memberNo) => memberNo !== coveredMemberNo),
    );
  }

  function submitSubscription(): void {
    if (addSubscriptionMutation.isPending) return;

    const errors = validateSubscriptionForm(subscriptionForm);
    setSubscriptionErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubscriptionError(null);
    addSubscriptionMutation.mutate(toSubscriptionPayload(subscriptionForm), {
      onSuccess: () => {
        setSubscriptionOpen(false);
        invalidate();
      },
      onError: (error: unknown) => {
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        setSubscriptionError(inlineActionError(error, errorMessage(error)));
      },
    });
  }

  function confirmEndSubscription(): void {
    if (!endTarget) return;

    setActionError(null);
    endSubscriptionMutation.mutate(endTarget.id, {
      onSuccess: () => {
        setEndTarget(null);
        invalidate();
      },
      onError: (error: unknown) => {
        // EC-35: an already-ended or missing policy refreshes the list instead
        // of showing a second "Ended" transition.
        setEndTarget(null);
        invalidate();
        failAction(error);
      },
    });
  }

  function openAddCoverage(subscription: MemberSubscription): void {
    setCoverageTarget(subscription);
    setCoverageMemberNo('');
    setCoverageError(null);
  }

  function submitCoverage(): void {
    if (!coverageTarget || addCoverageMutation.isPending) return;

    const message = validateCoverageMemberNo(coverageMemberNo);
    if (message) {
      setCoverageError(message);
      return;
    }

    setCoverageError(null);
    addCoverageMutation.mutate(
      { subscriptionId: coverageTarget.id, coveredMemberNo: coverageMemberNo.trim() },
      {
        onSuccess: () => {
          setCoverageTarget(null);
          invalidate();
        },
        onError: (error: unknown) => {
          if (isUnauthorized(error)) {
            void signOut();
            return;
          }
          setCoverageError(inlineActionError(error, errorMessage(error)));
        },
      },
    );
  }

  function confirmRemoveCoverage(): void {
    if (!removeCoverageTarget) return;

    setActionError(null);
    removeCoverageMutation.mutate(
      {
        subscriptionId: removeCoverageTarget.subscription.id,
        coveredMemberNo: removeCoverageTarget.memberNo,
      },
      {
        onSuccess: () => {
          setRemoveCoverageTarget(null);
          invalidate();
        },
        onError: (error: unknown) => {
          // EC-36: a coverage row already removed refreshes the list.
          setRemoveCoverageTarget(null);
          invalidate();
          failAction(error);
        },
      },
    );
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

  const actions = (
    <>
      <Button
        icon={<EditRegular />}
        onClick={() => {
          navigate(`/members/${encodeURIComponent(memberNo)}/edit`);
        }}
      >
        Edit
      </Button>
      <Button icon={<ContactCardRegular />} onClick={() => setContactsOpen(true)}>
        {contactLabel(member.contactCount)}
      </Button>
      {isArchived ? (
        <Button
          icon={<ArrowUndoRegular />}
          onClick={confirmRestore}
          disabled={restoreMutation.isPending}
        >
          Restore
        </Button>
      ) : (
        <Button
          icon={<ArchiveRegular />}
          onClick={() => setArchiveOpen(true)}
          disabled={archiveMutation.isPending}
        >
          Archive
        </Button>
      )}
      <Button icon={<DeleteRegular />} onClick={() => setPurgeOpen(true)}>
        Purge
      </Button>
    </>
  );

  return (
    <PageFrame
      sectionId="members"
      title={memberName(member)}
      submenu={member.memberNo}
      description="Review the registration, attendance, ministries and coverage. Contacts open only from the explicit Contacts action."
      actions={actions}
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

        <section className={styles.section} aria-labelledby="member-identity-heading">
          <div className={styles.identityHeader}>
            <Avatar
              name={memberName(member)}
              initials={memberInitials(member)}
              color="colorful"
              size={56}
            />
            <div>
              <div className={styles.nameRow}>
                <span className={styles.name}>{memberName(member)}</span>
                {member.isPresbyter ? (
                  <Badge appearance="tint" color="informative">
                    Presbyter
                  </Badge>
                ) : null}
                <Badge appearance="outline" color={isArchived ? 'warning' : 'success'}>
                  {isArchived ? 'Archived' : 'Active'}
                </Badge>
              </div>
              <Text size={200} className={styles.muted}>
                {member.memberNo}
                {member.archivedAt ? ` · archived ${formatDateLong(member.archivedAt)}` : ''}
              </Text>
            </div>
          </div>
          <h2 id="member-identity-heading" className={styles.sectionTitle}>
            Identity
          </h2>
          <div className={styles.detailGrid}>
            <DetailItem label="Member number" value={member.memberNo} />
            <DetailItem label="Gender" value={genderLabel(member.gender)} />
            <DetailItem
              label="Joined"
              value={member.joinedOn ? formatDateLong(member.joinedOn) : '—'}
            />
            <DetailItem label="Place of residence" value={member.placeOfResidence ?? ''} />
            <DetailItem label="Presbyter" value={member.isPresbyter ? 'Yes' : 'No'} />
            <DetailItem
              label="Date of birth"
              value={member.dob ? formatDateLong(member.dob) : '—'}
            />
            <DetailItem label="Other names" value={member.otherNames ?? ''} />
            <DetailItem label="Maiden name" value={member.maidenName ?? ''} />
            <DetailItem label="Alias" value={member.alias ?? ''} />
            <DetailItem label="Address line" value={member.addressLine ?? ''} />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="member-ministries-heading">
          <div className={styles.sectionHeader}>
            <h2 id="member-ministries-heading" className={styles.sectionTitle}>
              Ministries
            </h2>
          </div>
          {member.ministries.length === 0 ? (
            <Text className={styles.muted}>No ministries assigned.</Text>
          ) : (
            <div className={styles.pills}>
              {member.ministries.map((ministry) => (
                <Badge
                  key={ministry.code}
                  appearance="outline"
                  color="informative"
                  title={ministry.name}
                >
                  {ministry.code} · {ministry.name}
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section} aria-labelledby="member-subscriptions-heading">
          <div className={styles.sectionHeader}>
            <h2 id="member-subscriptions-heading" className={styles.sectionTitle}>
              Subscriptions
            </h2>
            <div className={styles.pills}>
              <Text size={200} className={styles.muted}>
                Ending keeps history; coverage is household-only.
              </Text>
              <Button icon={<AddRegular />} onClick={openAddSubscription}>
                Add subscription
              </Button>
            </div>
          </div>
          {member.subscriptions.length === 0 ? (
            <Text className={styles.muted}>No subscriptions.</Text>
          ) : (
            <div className={styles.list}>
              {member.subscriptions.map((subscription) => {
                const isActivePolicyholder =
                  subscription.role === 'policyholder' && subscription.status === 'active';
                const canManageCoverage =
                  isActivePolicyholder && subscription.scope === 'household';

                return (
                  <article key={subscription.id} className={styles.rowCard}>
                    <div className={styles.rowHead}>
                      <div className={styles.pills}>
                        <Text weight="semibold">{subscriptionKindLabel(subscription.kind)}</Text>
                        <Badge
                          appearance="outline"
                          color={subscription.status === 'active' ? 'success' : 'subtle'}
                          size="small"
                        >
                          {subscriptionStatusLabel(subscription.status)}
                        </Badge>
                        <Badge appearance="outline" size="small">
                          {subscriptionRoleLabel(subscription.role)}
                        </Badge>
                      </div>
                      {isActivePolicyholder ? (
                        <div className={styles.pills}>
                          {canManageCoverage ? (
                            <Button
                              size="small"
                              icon={<PersonAddRegular />}
                              onClick={() => openAddCoverage(subscription)}
                            >
                              Add coverage
                            </Button>
                          ) : null}
                          <Button
                            size="small"
                            appearance="secondary"
                            icon={<StopRegular />}
                            onClick={() => {
                              setActionError(null);
                              setEndTarget(subscription);
                            }}
                          >
                            End
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <Text size={200}>
                      {subscriptionScopeLabel(subscription.scope)} ·{' '}
                      {subscriptionRoleLabel(subscription.role)} · Policyholder{' '}
                      {subscription.policyholderMemberNo}
                    </Text>
                    <Text size={200} className={styles.muted}>
                      Started {formatDateLong(subscription.startedOn)}
                      {subscription.endedOn
                        ? ` · Ended ${formatDateLong(subscription.endedOn)}`
                        : ''}
                      {subscription.reference ? ` · Reference ${subscription.reference}` : ''}
                    </Text>
                    {subscription.scope === 'household' ? (
                      <div
                        className={styles.coverage}
                        aria-label={`Coverage: ${coveredMemberNosLabel(
                          subscription.coveredMemberNos,
                        )}`}
                      >
                        <Text size={200} weight="semibold">
                          Coverage · {coverageCountLabel(subscription.coveredMemberNos.length)}
                        </Text>
                        {subscription.coveredMemberNos.length === 0 ? (
                          <Text size={200} className={styles.muted}>
                            No covered members. Add coverage explicitly; it is never derived from
                            relationships.
                          </Text>
                        ) : (
                          <ul className={styles.entryList}>
                            {subscription.coveredMemberNos.map((coveredMemberNo) => (
                              <li key={coveredMemberNo}>
                                <span className={styles.entry}>
                                  <Text size={200}>{coveredMemberNo}</Text>
                                  {canManageCoverage ? (
                                    <Button
                                      size="small"
                                      appearance="transparent"
                                      icon={<DismissRegular />}
                                      aria-label={`Remove coverage for ${coveredMemberNo}`}
                                      onClick={() => {
                                        setActionError(null);
                                        setRemoveCoverageTarget({
                                          subscription,
                                          memberNo: coveredMemberNo,
                                        });
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  ) : null}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <Text size={200} className={styles.muted}>
                        Individual policy: the policyholder is the only covered person.
                      </Text>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className={styles.section} aria-labelledby="member-relationships-heading">
          <div className={styles.sectionHeader}>
            <h2 id="member-relationships-heading" className={styles.sectionTitle}>
              Relationships
            </h2>
          </div>
          {member.relationships.length === 0 ? (
            <Text className={styles.muted}>No relationships recorded.</Text>
          ) : (
            <div className={styles.list}>
              {member.relationships.map((relationship) => (
                <div key={relationship.id} className={styles.rowCard}>
                  <div className={styles.rowHead}>
                    <Link to={`/members/${encodeURIComponent(relationship.memberNo)}`}>
                      {relationship.name || relationship.memberNo}
                    </Link>
                    <div className={styles.pills}>
                      <Badge appearance="outline" size="small">
                        {relationship.type}
                      </Badge>
                      {relationship.isDependent ? (
                        <Badge appearance="outline" color="informative" size="small">
                          Dependent
                        </Badge>
                      ) : null}
                      {relationship.archived ? (
                        <Badge appearance="outline" color="warning" size="small">
                          Archived
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <Text size={200} className={styles.muted}>
                    {relationship.memberNo}
                  </Text>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section} aria-labelledby="member-attendance-heading">
          <div className={styles.sectionHeader}>
            <h2 id="member-attendance-heading" className={styles.sectionTitle}>
              Attendance
            </h2>
          </div>
          {member.attendance.length === 0 ? (
            <Text className={styles.muted}>No attendance recorded.</Text>
          ) : (
            <div className={styles.list}>
              {member.attendance.map((series) => (
                <article key={series.seriesId} className={styles.rowCard}>
                  <div className={styles.rowHead}>
                    <Text weight="semibold">{series.seriesName}</Text>
                    <Badge appearance="outline" size="small">
                      {statusLabel(series.status)}
                    </Badge>
                  </div>
                  <Text size={200}>
                    {series.attended} attended / {series.expected} expected / {series.remaining}{' '}
                    remaining
                    {series.ministry ? ` · ${series.ministry}` : ''}
                  </Text>
                  {series.entries.length === 0 ? (
                    <Text size={200} className={styles.muted}>
                      No attendance entries.
                    </Text>
                  ) : (
                    <ul className={styles.entryList} aria-label={`${series.seriesName} entries`}>
                      {series.entries.map((entry) => (
                        <li key={entry.id}>
                          <span className={styles.entry}>
                            <Text size={200}>{formatDateShort(entry.date)}</Text>
                            <Text size={100} className={styles.muted}>
                              {entry.source}
                            </Text>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <ContactsDialog member={member} open={contactsOpen} onOpenChange={setContactsOpen} editable />

      <ConfirmDialog
        open={archiveOpen}
        title={`Archive ${member.memberNo}?`}
        message="The member leaves active views and history is preserved. An active shepherding assignment must be reassigned first. You can restore the member from the archived list."
        confirmLabel="Archive member"
        busy={archiveMutation.isPending}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveOpen(false)}
      />

      <Dialog
        open={subscriptionOpen}
        onOpenChange={(_, data) => {
          if (!data.open && !addSubscriptionMutation.isPending) setSubscriptionOpen(false);
        }}
      >
        <DialogSurface aria-label="Add subscription">
          <DialogBody>
            <DialogTitle>Add subscription</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <Text size={200}>
                The policyholder is {memberName(member)} ({member.memberNo}). A subscription is
                created on the policyholder and ended, never deleted. Household coverage can be
                selected here or added explicitly after creation; an individual policy offers none.
              </Text>
              {subscriptionError ? (
                <MessageBar intent="error">
                  <MessageBarBody>
                    <MessageBarTitle>The subscription was not added</MessageBarTitle>
                    {subscriptionError}
                  </MessageBarBody>
                </MessageBar>
              ) : null}
              <div className={styles.dialogGrid}>
                <Field
                  label="Kind"
                  required
                  validationState={subscriptionErrors.kind ? 'error' : 'none'}
                  validationMessage={subscriptionErrors.kind}
                >
                  <Dropdown
                    value={subscriptionKindLabel(subscriptionForm.kind)}
                    selectedOptions={subscriptionForm.kind ? [subscriptionForm.kind] : []}
                    onOptionSelect={(_, data) => {
                      const next = SUBSCRIPTION_KIND_OPTIONS.find(
                        (option) => option.value === data.optionValue,
                      );
                      if (next) setSubscriptionField('kind', next.value);
                    }}
                  >
                    {SUBSCRIPTION_KIND_OPTIONS.map((option) => (
                      <Option key={option.value} value={option.value}>
                        {option.label}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
                <Field
                  label="Scope"
                  required
                  validationState={subscriptionErrors.scope ? 'error' : 'none'}
                  validationMessage={subscriptionErrors.scope}
                >
                  <Dropdown
                    value={subscriptionScopeLabel(subscriptionForm.scope)}
                    selectedOptions={subscriptionForm.scope ? [subscriptionForm.scope] : []}
                    onOptionSelect={(_, data) => {
                      const next = SUBSCRIPTION_SCOPE_OPTIONS.find(
                        (option) => option.value === data.optionValue,
                      );
                      if (next) setSubscriptionField('scope', next.value);
                    }}
                  >
                    {SUBSCRIPTION_SCOPE_OPTIONS.map((option) => (
                      <Option key={option.value} value={option.value}>
                        {option.label}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
                <Field
                  label="Reference"
                  validationState={subscriptionErrors.reference ? 'error' : 'none'}
                  validationMessage={subscriptionErrors.reference}
                  hint="Policy or member number"
                >
                  <Input
                    value={subscriptionForm.reference}
                    onChange={(_, data) => setSubscriptionField('reference', data.value)}
                  />
                </Field>
                <Field
                  label="Started on"
                  required
                  validationState={subscriptionErrors.startedOn ? 'error' : 'none'}
                  validationMessage={subscriptionErrors.startedOn}
                  hint="Defaults to today (UTC)"
                >
                  <Input
                    type="date"
                    value={subscriptionForm.startedOn}
                    onChange={(_, data) => setSubscriptionField('startedOn', data.value)}
                  />
                </Field>
              </div>
              {subscriptionForm.scope === 'household' ? (
                <Field
                  label="Covered members"
                  hint="Household coverage only. Add an existing member number; coverage is never derived from relationships."
                  validationState={
                    coveredDraftError || subscriptionErrors.coveredMemberNos ? 'error' : 'none'
                  }
                  validationMessage={coveredDraftError ?? subscriptionErrors.coveredMemberNos}
                >
                  <div className={styles.coveredEditor}>
                    <div className={styles.coveredAdd}>
                      <Input
                        value={coveredDraft}
                        placeholder="M-1002"
                        aria-label="Member number to cover"
                        onChange={(_, data) => {
                          setCoveredDraft(data.value);
                          setCoveredDraftError(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addCoveredMember();
                          }
                        }}
                      />
                      <Button
                        appearance="secondary"
                        onClick={addCoveredMember}
                        disabled={coveredDraft.trim().length === 0}
                      >
                        Add
                      </Button>
                    </div>
                    {subscriptionForm.coveredMemberNos.length === 0 ? (
                      <Text size={200} className={styles.muted}>
                        No covered members yet.
                      </Text>
                    ) : (
                      <ul className={styles.entryList} aria-label="Covered members">
                        {subscriptionForm.coveredMemberNos.map((coveredMemberNo) => (
                          <li key={coveredMemberNo}>
                            <span className={styles.entry}>
                              <Text size={200}>{coveredMemberNo}</Text>
                              <Button
                                size="small"
                                appearance="transparent"
                                icon={<DismissRegular />}
                                aria-label={`Remove covered member ${coveredMemberNo}`}
                                onClick={() => removeCoveredMember(coveredMemberNo)}
                              >
                                Remove
                              </Button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Field>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => setSubscriptionOpen(false)}
                disabled={addSubscriptionMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={submitSubscription}
                disabled={addSubscriptionMutation.isPending}
              >
                Add subscription
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={coverageTarget !== null}
        onOpenChange={(_, data) => {
          if (!data.open && !addCoverageMutation.isPending) setCoverageTarget(null);
        }}
      >
        <DialogSurface aria-label="Add coverage">
          <DialogBody>
            <DialogTitle>Add coverage</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              {coverageTarget ? (
                <Text size={200}>
                  Add an active member to {subscriptionKindLabel(coverageTarget.kind)}
                  {coverageTarget.reference ? ` ${coverageTarget.reference}` : ''}. Coverage is
                  household-only, and only the policyholder can add it. Adding the same member twice
                  returns 409.
                </Text>
              ) : null}
              {coverageError ? (
                <MessageBar intent="error">
                  <MessageBarBody>
                    <MessageBarTitle>Coverage was not added</MessageBarTitle>
                    {coverageError}
                  </MessageBarBody>
                </MessageBar>
              ) : null}
              <Field
                label="Member number"
                required
                hint="Type the exact member number; a member search picker is deferred to a later pass."
              >
                <Input
                  value={coverageMemberNo}
                  placeholder="M-1002"
                  onChange={(_, data) => {
                    setCoverageMemberNo(data.value);
                    setCoverageError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitCoverage();
                    }
                  }}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => setCoverageTarget(null)}
                disabled={addCoverageMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={submitCoverage}
                disabled={addCoverageMutation.isPending || coverageMemberNo.trim().length === 0}
              >
                Add coverage
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <ConfirmDialog
        open={endTarget !== null}
        title={
          endTarget
            ? `End ${subscriptionKindLabel(endTarget.kind)} subscription?`
            : 'End subscription?'
        }
        message={
          endTarget
            ? `The policy${endTarget.reference ? ` ${endTarget.reference}` : ''} ends on the server. The subscription and its coverage history remain readable; there is no hard delete.`
            : ''
        }
        confirmLabel="End subscription"
        busy={endSubscriptionMutation.isPending}
        onConfirm={confirmEndSubscription}
        onCancel={() => setEndTarget(null)}
      />

      <ConfirmDialog
        open={removeCoverageTarget !== null}
        title={
          removeCoverageTarget
            ? `Remove ${removeCoverageTarget.memberNo} from coverage?`
            : 'Remove coverage?'
        }
        message={
          removeCoverageTarget
            ? `${removeCoverageTarget.memberNo} stops being covered by ${subscriptionKindLabel(
                removeCoverageTarget.subscription.kind,
              )}${removeCoverageTarget.subscription.reference ? ` ${removeCoverageTarget.subscription.reference}` : ''}. The removal is recorded with a date; the coverage history is preserved.`
            : ''
        }
        confirmLabel="Remove coverage"
        busy={removeCoverageMutation.isPending}
        onConfirm={confirmRemoveCoverage}
        onCancel={() => setRemoveCoverageTarget(null)}
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
        <DialogSurface aria-label={`Purge ${member.memberNo}`}>
          <DialogBody>
            <DialogTitle>Purge {member.memberNo}?</DialogTitle>
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
