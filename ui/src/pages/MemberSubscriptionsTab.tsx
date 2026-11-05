import {
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
  Text,
} from '@fluentui/react-components';
import { AddRegular, DismissRegular, PersonAddRegular, StopRegular } from '@fluentui/react-icons';
import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import { isUnauthorized } from '../api/errors';
import type { MemberDetail, MemberSubscription, SubscriptionInput } from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MemberPicker } from '../components/MemberPicker';
import { memberLabel } from '../format/member';
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
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { errorMessage, inlineActionError } from './member-detail-errors';
import { useMemberDetailStyles } from './member-detail-styles';

export interface MemberSubscriptionsTabProps {
  readonly member: MemberDetail;
  readonly addSubscriptionMutation: UseMutationResult<
    MemberSubscription,
    unknown,
    SubscriptionInput
  >;
  readonly endSubscriptionMutation: UseMutationResult<void, unknown, string>;
  readonly addCoverageMutation: UseMutationResult<
    void,
    unknown,
    { subscriptionId: string; coveredMemberNo: string }
  >;
  readonly removeCoverageMutation: UseMutationResult<
    void,
    unknown,
    { subscriptionId: string; coveredMemberNo: string }
  >;
  readonly onInvalidate: () => void;
  readonly onActionError: (message: string) => void;
  readonly onClearActionError: () => void;
}

/**
 * Member-detail **Subscriptions** tab (FR-29, FR-72): the existing list, add and
 * end actions, and household coverage. MemberDetailPage owns every query and
 * mutation; this tab owns only its dialogs and form state. Coverage members are
 * picked from `MemberPicker`, never derived from relationships.
 */
export function MemberSubscriptionsTab({
  member,
  addSubscriptionMutation,
  endSubscriptionMutation,
  addCoverageMutation,
  removeCoverageMutation,
  onInvalidate,
  onActionError,
  onClearActionError,
}: MemberSubscriptionsTabProps) {
  const styles = useMemberDetailStyles();
  const { signOut } = useSession();
  const { formatDate } = useDateTimeFormat();

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

  function failAction(error: unknown): void {
    if (isUnauthorized(error)) {
      void signOut();
      return;
    }
    onActionError(errorMessage(error));
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
        onInvalidate();
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

    endSubscriptionMutation.mutate(endTarget.id, {
      onSuccess: () => {
        setEndTarget(null);
        onInvalidate();
      },
      onError: (error: unknown) => {
        // EC-35: an already-ended or missing policy refreshes the list instead
        // of showing a second "Ended" transition.
        setEndTarget(null);
        onInvalidate();
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
          onInvalidate();
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

    removeCoverageMutation.mutate(
      {
        subscriptionId: removeCoverageTarget.subscription.id,
        coveredMemberNo: removeCoverageTarget.memberNo,
      },
      {
        onSuccess: () => {
          setRemoveCoverageTarget(null);
          onInvalidate();
        },
        onError: (error: unknown) => {
          // EC-36: a coverage row already removed refreshes the list.
          setRemoveCoverageTarget(null);
          onInvalidate();
          failAction(error);
        },
      },
    );
  }

  return (
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
            const canManageCoverage = isActivePolicyholder && subscription.scope === 'household';

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
                          onClearActionError();
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
                  Started {formatDate(subscription.startedOn)}
                  {subscription.endedOn ? ` · Ended ${formatDate(subscription.endedOn)}` : ''}
                  {subscription.reference ? ` · Reference ${subscription.reference}` : ''}
                </Text>
                {subscription.scope === 'household' ? (
                  <div
                    className={styles.coverage}
                    aria-label={`Coverage: ${coveredMemberNosLabel(subscription.coveredMemberNos)}`}
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
                                    onClearActionError();
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
                The policyholder is {memberLabel(member)}. A subscription is created on the
                policyholder and ended, never deleted. Household coverage can be selected here or
                added explicitly after creation; an individual policy offers none.
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
                <div className={styles.coveredEditor}>
                  <Text size={200} className={styles.muted}>
                    Household coverage only. Pick an existing member; coverage is never derived from
                    relationships.
                  </Text>
                  <div className={styles.coveredAdd}>
                    <div className={styles.addField}>
                      <MemberPicker
                        value={coveredDraft || null}
                        onChange={(memberNo) => {
                          setCoveredDraft(memberNo ?? '');
                          setCoveredDraftError(null);
                        }}
                        label="Covered member"
                        excludeMemberNo={member.memberNo}
                        validationState={
                          coveredDraftError || subscriptionErrors.coveredMemberNos
                            ? 'error'
                            : 'none'
                        }
                        validationMessage={coveredDraftError ?? subscriptionErrors.coveredMemberNos}
                      />
                    </div>
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
              <MemberPicker
                value={coverageMemberNo || null}
                onChange={(memberNo) => {
                  setCoverageMemberNo(memberNo ?? '');
                  setCoverageError(null);
                }}
                label="Member"
                excludeMemberNo={member.memberNo}
              />
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
    </section>
  );
}
