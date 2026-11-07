import {
  Badge,
  Button,
  Card,
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
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Textarea,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isUnauthorized } from '../../api/errors';
import { getMember } from '../../api/members';
import { claimStatusLabel, formatMoneyMinor, claimTotalMinor } from '../../format/welfare';
import {
  decideClaim,
  listClaims,
  listMemberWelfareSubscriptions,
  recordClaim,
  type ClaimDecision,
  type WelfareClaim,
  type WelfareSubscription,
} from '../../api/welfare';
import { useSession } from '../../auth/SessionProvider';
import { MemberPicker } from '../../components/MemberPicker';
import { PageFrame } from '../../components/PageFrame';
import { useDateTimeFormat } from '../../shell/DateTimeProvider';
import { useUssdStyles } from './ussd-styles';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function decisionOptions(claim: WelfareClaim): readonly ClaimDecision[] {
  if (claim.status === 'pending') return ['approved', 'rejected'];
  if (claim.status === 'approved') return ['paid'];
  return [];
}

function subscriptionLabel(subscription: WelfareSubscription): string {
  const name = subscription.productName ?? subscription.kind ?? 'Subscription';
  const period =
    subscription.periodStart && subscription.periodEnd
      ? ` · ${subscription.periodStart} to ${subscription.periodEnd}`
      : '';
  return `${name} · ${subscription.source}${period}`;
}

/**
 * USSD → Claims. A claim is recorded against one subscription with an amount
 * and reason; the operator then moves it pending → approved|rejected and
 * approved → paid with a decision note. The API owns the transition rules, so
 * only legal next statuses are offered.
 */
export function UssdClaimsPage() {
  const styles = useUssdStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatInstant } = useDateTimeFormat();
  const queryClient = useQueryClient();
  const token = session?.token ?? '';

  const [memberNo, setMemberNo] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [amountMinor, setAmountMinor] = useState('');
  const [reason, setReason] = useState('');
  const [decideTarget, setDecideTarget] = useState<WelfareClaim | null>(null);
  const [decision, setDecision] = useState<ClaimDecision>('approved');
  const [decisionNote, setDecisionNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const memberQuery = useQuery({
    queryKey: ['member', baseUrl, memberNo ?? ''],
    queryFn: ({ signal }) => getMember(baseUrl, token, memberNo!, signal),
    enabled: Boolean(token) && memberNo !== null,
  });

  const subscriptionsQuery = useQuery({
    queryKey: ['ussd', baseUrl, 'welfare-subscriptions', memberNo ?? ''],
    queryFn: ({ signal }) => listMemberWelfareSubscriptions(baseUrl, token, memberNo!, signal),
    enabled: Boolean(token) && memberNo !== null,
  });

  const subscriptions = subscriptionsQuery.data ?? [];
  const selectedSubscription =
    subscriptions.find((subscription) => subscription.id === subscriptionId) ??
    subscriptions[0] ??
    null;

  const claimsQuery = useQuery({
    queryKey: ['ussd', baseUrl, 'claims', selectedSubscription?.id ?? ''],
    queryFn: ({ signal }) => listClaims(baseUrl, token, selectedSubscription!.id, signal),
    enabled: Boolean(token) && selectedSubscription !== null,
  });

  useEffect(() => {
    if (isUnauthorized(memberQuery.error)) void signOut();
  }, [memberQuery.error, signOut]);

  useEffect(() => {
    if (isUnauthorized(subscriptionsQuery.error) || isUnauthorized(claimsQuery.error)) {
      void signOut();
    }
  }, [subscriptionsQuery.error, claimsQuery.error, signOut]);

  const recordMutation = useMutation({
    mutationFn: () => {
      if (!memberNo || !selectedSubscription) {
        throw new Error('Choose a member and a subscription first.');
      }
      return recordClaim(baseUrl, token, selectedSubscription.id, {
        memberNo,
        amountMinor: Number(amountMinor),
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      setAmountMinor('');
      setReason('');
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'claims'] });
      void queryClient.invalidateQueries({
        queryKey: ['ussd', baseUrl, 'welfare-subscriptions'],
      });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  const decideMutation = useMutation({
    mutationFn: () => {
      if (!selectedSubscription || !decideTarget) {
        throw new Error('Choose a claim first.');
      }
      const note = decisionNote.trim();
      return decideClaim(baseUrl, token, selectedSubscription.id, decideTarget.id, {
        status: decision,
        ...(note.length > 0 ? { note } : {}),
      });
    },
    onSuccess: () => {
      setDecideTarget(null);
      setDecisionNote('');
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'claims'] });
      void queryClient.invalidateQueries({
        queryKey: ['ussd', baseUrl, 'welfare-subscriptions'],
      });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  const claims = claimsQuery.data ?? [];
  const currency = selectedSubscription?.currency ?? 'GHS';
  const amountValid = /^\d+$/.test(amountMinor.trim()) && Number(amountMinor) > 0;

  return (
    <PageFrame
      sectionId="ussd"
      title="USSD welfare claims"
      submenu="Claims"
      description="Record a claim with an amount and reason, then move it through its statuses with a decision note. Total claimed counts approved and paid claims only."
      actions={
        <Button
          icon={<ArrowClockwiseRegular />}
          disabled={!selectedSubscription || claimsQuery.isFetching}
          onClick={() => {
            void claimsQuery.refetch();
          }}
        >
          Refresh
        </Button>
      }
    >
      <div className={styles.page}>
        <Card className={styles.panel}>
          <div className={styles.panelBody}>
            <div className={styles.fields}>
              <div className={styles.field}>
                <MemberPicker
                  value={memberNo}
                  onChange={(next) => {
                    setMemberNo(next);
                    setSubscriptionId(null);
                    setActionError(null);
                  }}
                  label="Member"
                />
              </div>
              <Field label="Subscription" className={styles.field}>
                <Dropdown
                  aria-label="Subscription"
                  placeholder={
                    memberNo === null
                      ? 'Choose a member first'
                      : subscriptions.length === 0
                        ? 'No welfare subscriptions'
                        : 'Choose a subscription'
                  }
                  value={selectedSubscription ? subscriptionLabel(selectedSubscription) : ''}
                  selectedOptions={selectedSubscription ? [selectedSubscription.id] : []}
                  disabled={subscriptions.length === 0}
                  onOptionSelect={(_, data) => {
                    if (data.optionValue) setSubscriptionId(data.optionValue);
                  }}
                >
                  {subscriptions.map((subscription) => (
                    <Option
                      key={subscription.id}
                      value={subscription.id}
                      text={subscriptionLabel(subscription)}
                    >
                      {subscriptionLabel(subscription)}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Badge appearance="tint" color="informative" size="small">
                {memberQuery.data
                  ? `${memberQuery.data.firstName} ${memberQuery.data.lastName}`.trim()
                  : 'No member'}
              </Badge>
            </div>
            {subscriptionsQuery.isError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Subscriptions could not be loaded</MessageBarTitle>
                  {errorMessage(subscriptionsQuery.error)}
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </div>
        </Card>

        {actionError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The claim action failed</MessageBarTitle>
              {actionError}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {!selectedSubscription ? (
          <div className={styles.empty}>
            <Text className={styles.emptyTitle}>No subscription selected</Text>
            <Text size={200} className={styles.muted}>
              Choose a member with a welfare subscription to record and decide claims.
            </Text>
          </div>
        ) : (
          <>
            <section className={styles.panel} aria-label="Record a claim">
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Record a claim</h2>
                <Text size={200} className={styles.muted}>
                  Total claimed {formatMoneyMinor(claimTotalMinor(claims), currency)}
                </Text>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.fields}>
                  <Field
                    label="Amount (minor units)"
                    hint="e.g. 5000 = GHS 50.00"
                    className={styles.field}
                  >
                    <Input
                      type="number"
                      min={1}
                      value={amountMinor}
                      onChange={(_, data) => setAmountMinor(data.value)}
                    />
                  </Field>
                  <Field label="Reason" className={styles.field}>
                    <Textarea
                      value={reason}
                      maxLength={500}
                      resize="vertical"
                      onChange={(_, data) => setReason(data.value)}
                    />
                  </Field>
                </div>
                <div>
                  <Button
                    appearance="primary"
                    disabled={
                      !amountValid || reason.trim().length === 0 || recordMutation.isPending
                    }
                    onClick={() => recordMutation.mutate()}
                  >
                    {recordMutation.isPending ? 'Recording…' : 'Record claim'}
                  </Button>
                </div>
              </div>
            </section>

            <section className={styles.panel} aria-label="Claims">
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Claims</h2>
                <Badge appearance="tint" color="subtle" size="small">
                  {claims.length}
                </Badge>
              </div>
              {claimsQuery.isPending ? (
                <div className={styles.state}>
                  <Spinner label="Loading claims…" />
                </div>
              ) : claimsQuery.isError ? (
                <div className={styles.panelBody}>
                  <MessageBar intent="error">
                    <MessageBarBody>
                      <MessageBarTitle>Claims could not be loaded</MessageBarTitle>
                      {errorMessage(claimsQuery.error)}
                    </MessageBarBody>
                  </MessageBar>
                </div>
              ) : claims.length === 0 ? (
                <div className={styles.empty}>
                  <Text size={200} className={styles.muted}>
                    No claim recorded for this subscription.
                  </Text>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <Table className={styles.table} size="small" aria-label="Claims">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Member</TableHeaderCell>
                        <TableHeaderCell>Amount</TableHeaderCell>
                        <TableHeaderCell>Reason</TableHeaderCell>
                        <TableHeaderCell>Status</TableHeaderCell>
                        <TableHeaderCell>Recorded</TableHeaderCell>
                        <TableHeaderCell>Decision</TableHeaderCell>
                        <TableHeaderCell>Action</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {claims.map((claim) => (
                        <TableRow key={claim.id}>
                          <TableCell>
                            {claim.memberName}{' '}
                            <Text size={200} className={styles.muted}>
                              {claim.memberNo}
                            </Text>
                          </TableCell>
                          <TableCell>{formatMoneyMinor(claim.amountMinor, currency)}</TableCell>
                          <TableCell>{claim.reason}</TableCell>
                          <TableCell>
                            <Badge
                              appearance="tint"
                              color={
                                claim.status === 'paid'
                                  ? 'success'
                                  : claim.status === 'rejected'
                                    ? 'danger'
                                    : claim.status === 'approved'
                                      ? 'brand'
                                      : 'informative'
                              }
                              size="small"
                            >
                              {claimStatusLabel(claim.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Text size={200} className={styles.muted}>
                              {formatInstant(claim.recordedAt)}
                            </Text>
                          </TableCell>
                          <TableCell>
                            {claim.decisionNote ? (
                              <>
                                {claim.decisionNote}
                                <br />
                                <Text size={200} className={styles.muted}>
                                  {claim.decidedBy} ·{' '}
                                  {claim.decidedAt ? formatInstant(claim.decidedAt) : ''}
                                </Text>
                              </>
                            ) : (
                              <Text size={200} className={styles.muted}>
                                —
                              </Text>
                            )}
                          </TableCell>
                          <TableCell>
                            {decisionOptions(claim).length > 0 ? (
                              <Button
                                size="small"
                                appearance="secondary"
                                onClick={() => {
                                  setActionError(null);
                                  setDecision(decisionOptions(claim)[0]);
                                  setDecisionNote(claim.decisionNote ?? '');
                                  setDecideTarget(claim);
                                }}
                              >
                                Decide
                              </Button>
                            ) : (
                              <Text size={200} className={styles.muted}>
                                Closed
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
          </>
        )}
      </div>

      <Dialog
        open={decideTarget !== null}
        onOpenChange={(_, data) => {
          if (!data.open) setDecideTarget(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Decide the claim</DialogTitle>
            <DialogContent>
              <div className={styles.panelBody}>
                <Text size={200} className={styles.muted}>
                  {decideTarget
                    ? `${decideTarget.memberName} · ${formatMoneyMinor(
                        decideTarget.amountMinor,
                        currency,
                      )}`
                    : ''}
                </Text>
                <Field label="Next status">
                  <Dropdown
                    aria-label="Next status"
                    value={claimStatusLabel(decision)}
                    selectedOptions={[decision]}
                    onOptionSelect={(_, data) => {
                      const chosen = data.optionValue as ClaimDecision | undefined;
                      if (chosen) setDecision(chosen);
                    }}
                  >
                    {(decideTarget ? decisionOptions(decideTarget) : []).map((option) => (
                      <Option key={option} value={option} text={claimStatusLabel(option)}>
                        {claimStatusLabel(option)}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
                <Field
                  label="Decision note"
                  hint="Optional, up to 500 characters; stored with the decision."
                >
                  <Textarea
                    value={decisionNote}
                    maxLength={500}
                    resize="vertical"
                    onChange={(_, data) => setDecisionNote(data.value)}
                  />
                </Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                disabled={decideMutation.isPending}
                onClick={() => setDecideTarget(null)}
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                disabled={decideMutation.isPending}
                onClick={() => decideMutation.mutate()}
              >
                {decideMutation.isPending ? 'Saving…' : 'Save decision'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </PageFrame>
  );
}
