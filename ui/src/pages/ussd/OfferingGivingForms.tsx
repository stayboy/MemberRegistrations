import {
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
} from '@fluentui/react-components';
import { useState } from 'react';
import type { EventOfferingItem } from '../../api/events';
import { MemberPicker } from '../../components/MemberPicker';
import { shiftUtcDate } from '../../format/date-window';
import { utcToday } from '../../format/member-form';
import { idempotencyKey, parseMoneyMinor } from '../../format/offering-counts';
import { formatMoneyMinor } from '../../format/welfare';
import { OfferingSelect } from './OfferingSelect';
import { useUssdStyles } from './ussd-styles';

export interface GiftSubmission {
  readonly memberNo: string;
  readonly offeringId: string;
  readonly sessionDate: string;
  readonly amountMinor: number;
  readonly idempotencyKey: string;
}

export interface PledgeSubmission {
  readonly memberNo: string;
  readonly offeringId: string;
  readonly amountMinor: number;
  readonly expectedOn: string;
  readonly officerMemberNo?: string;
  readonly idempotencyKey: string;
}

/**
 * The member-announced offertory form (the existing contribution route with
 * `channel: manual`). The member is chosen with the shared picker, so a typed
 * number is not the only way (FR-26a); no contact value is shown. It is
 * separate from the counted cash.
 */
export function AnnouncedOffertoryForm({
  offerings,
  defaultSessionDate,
  currency,
  pending,
  notice,
  error,
  onSubmit,
  onCancel,
}: {
  offerings: readonly EventOfferingItem[];
  defaultSessionDate: string;
  currency: string;
  pending: boolean;
  notice: string | null;
  error: string | null;
  onSubmit: (input: GiftSubmission) => void;
  onCancel: () => void;
}) {
  const styles = useUssdStyles();
  const [memberNo, setMemberNo] = useState<string | null>(null);
  const [memberTouched, setMemberTouched] = useState(false);
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState(defaultSessionDate);
  const [amount, setAmount] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedOfferingId = offeringId ?? offerings[0]?.offeringId ?? null;
  const selectedCurrency =
    offerings.find((offering) => offering.offeringId === selectedOfferingId)?.terms.currency ??
    currency;
  const amountMinor = parseMoneyMinor(amount);
  const memberMissing = memberTouched && memberNo === null;

  function submit(): void {
    setLocalError(null);
    if (memberNo === null) {
      setMemberTouched(true);
      setLocalError('Pick the member.');
      return;
    }
    if (!selectedOfferingId) {
      setLocalError('Choose the offering the offertory belongs to.');
      return;
    }
    if (amountMinor === null) {
      setLocalError('Enter a positive amount with two decimals at most.');
      return;
    }
    if (!sessionDate) {
      setLocalError('Choose the session date.');
      return;
    }
    onSubmit({
      memberNo,
      offeringId: selectedOfferingId,
      sessionDate,
      amountMinor,
      idempotencyKey: idempotencyKey('manual-gift'),
    });
  }

  return (
    <div className={styles.panelBody}>
      <Text size={200} className={styles.muted}>
        A member-announced offertory recorded through the existing contribution route. It is
        separate from the counted cash and appears in the Offerings totals.
      </Text>
      <MemberPicker
        label="Member"
        value={memberNo}
        disabled={pending}
        validationState={memberMissing ? 'error' : undefined}
        validationMessage={memberMissing ? 'Pick the member.' : undefined}
        onChange={(next) => {
          setMemberNo(next);
          if (next === null) setMemberTouched(true);
        }}
      />
      <OfferingSelect
        offerings={offerings}
        value={selectedOfferingId}
        label="Offertory"
        onChange={setOfferingId}
        disabled={pending}
      />
      <div className={styles.fields}>
        <Field label="Session date">
          <Input
            type="date"
            value={sessionDate}
            disabled={pending}
            onChange={(_, data) => setSessionDate(data.value)}
          />
        </Field>
        <Field label="Amount" hint={`In ${selectedCurrency}; two decimals at most.`}>
          <Input
            value={amount}
            disabled={pending}
            placeholder="e.g. 50.00"
            inputMode="decimal"
            onChange={(_, data) => setAmount(data.value)}
          />
        </Field>
      </div>
      {amountMinor !== null ? (
        <Text size={200} className={styles.muted}>
          {formatMoneyMinor(amountMinor, selectedCurrency)}
        </Text>
      ) : null}
      <div className={styles.badgeRow}>
        <Button appearance="primary" disabled={pending} onClick={submit}>
          {pending ? 'Saving…' : 'Record offertory'}
        </Button>
        <Button appearance="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        {localError ? (
          <Text size={200} role="alert">
            {localError}
          </Text>
        ) : null}
      </div>
      {notice ? (
        <MessageBar intent="success">
          <MessageBarBody>{notice}</MessageBarBody>
        </MessageBar>
      ) : null}
      {error ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The offertory could not be recorded</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      ) : null}
    </div>
  );
}

/**
 * The member-level pledge form. The follow-up officer defaults to the shepherd;
 * the pledge is never merged with the counted cash and appears in the Offerings
 * pledge worklist.
 */
export function PledgeForm({
  offerings,
  currency,
  pending,
  notice,
  error,
  onSubmit,
  onCancel,
}: {
  offerings: readonly EventOfferingItem[];
  currency: string;
  pending: boolean;
  notice: string | null;
  error: string | null;
  onSubmit: (input: PledgeSubmission) => void;
  onCancel: () => void;
}) {
  const styles = useUssdStyles();
  const [memberNo, setMemberNo] = useState<string | null>(null);
  const [memberTouched, setMemberTouched] = useState(false);
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [expectedOn, setExpectedOn] = useState(() => shiftUtcDate(utcToday(), 7) ?? utcToday());
  const [officerMemberNo, setOfficerMemberNo] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedOfferingId = offeringId ?? offerings[0]?.offeringId ?? null;
  const selectedCurrency =
    offerings.find((offering) => offering.offeringId === selectedOfferingId)?.terms.currency ??
    currency;
  const amountMinor = parseMoneyMinor(amount);
  const memberMissing = memberTouched && memberNo === null;

  function submit(): void {
    setLocalError(null);
    if (memberNo === null) {
      setMemberTouched(true);
      setLocalError('Pick the member.');
      return;
    }
    if (!selectedOfferingId) {
      setLocalError('Choose the offering the pledge belongs to.');
      return;
    }
    if (amountMinor === null) {
      setLocalError('Enter a positive amount with two decimals at most.');
      return;
    }
    if (!expectedOn) {
      setLocalError('Choose the expected date.');
      return;
    }
    onSubmit({
      memberNo,
      offeringId: selectedOfferingId,
      amountMinor,
      expectedOn,
      ...(officerMemberNo ? { officerMemberNo } : {}),
      idempotencyKey: idempotencyKey('pledge'),
    });
  }

  return (
    <div className={styles.panelBody}>
      <Text size={200} className={styles.muted}>
        A pledge is a member-level promise followed up by an officer. It is never merged with the
        counted cash and appears in the Offerings pledge worklist.
      </Text>
      <MemberPicker
        label="Member"
        value={memberNo}
        disabled={pending}
        validationState={memberMissing ? 'error' : undefined}
        validationMessage={memberMissing ? 'Pick the member.' : undefined}
        onChange={(next) => {
          setMemberNo(next);
          if (next === null) setMemberTouched(true);
        }}
      />
      <OfferingSelect
        offerings={offerings}
        value={selectedOfferingId}
        label="Pledge offering"
        onChange={setOfferingId}
        disabled={pending}
      />
      <div className={styles.fields}>
        <Field label="Amount" hint={`In ${selectedCurrency}; two decimals at most.`}>
          <Input
            value={amount}
            disabled={pending}
            placeholder="e.g. 100.00"
            inputMode="decimal"
            onChange={(_, data) => setAmount(data.value)}
          />
        </Field>
        <Field label="Expected on">
          <Input
            type="date"
            value={expectedOn}
            disabled={pending}
            onChange={(_, data) => setExpectedOn(data.value)}
          />
        </Field>
        <MemberPicker
          label="Follow-up officer"
          value={officerMemberNo}
          disabled={pending}
          onChange={setOfficerMemberNo}
        />
        <Text size={100} className={styles.muted}>
          Optional; the API defaults to the member's active shepherd.
        </Text>
      </div>
      {amountMinor !== null ? (
        <Text size={200} className={styles.muted}>
          {formatMoneyMinor(amountMinor, selectedCurrency)}
        </Text>
      ) : null}
      <div className={styles.badgeRow}>
        <Button appearance="primary" disabled={pending} onClick={submit}>
          {pending ? 'Saving…' : 'Record pledge'}
        </Button>
        <Button appearance="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        {localError ? (
          <Text size={200} role="alert">
            {localError}
          </Text>
        ) : null}
      </div>
      {notice ? (
        <MessageBar intent="success">
          <MessageBarBody>{notice}</MessageBarBody>
        </MessageBar>
      ) : null}
      {error ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The pledge could not be recorded</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      ) : null}
    </div>
  );
}
