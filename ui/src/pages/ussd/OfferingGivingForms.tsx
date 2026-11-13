import {
  Badge,
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
import { officerNoteProblem, OFFICER_NOTE_MAX_LENGTH } from '../../format/follow-up';
import { memberLabelFromName } from '../../format/member';
import { utcToday } from '../../format/member-form';
import { idempotencyKey, parseMoneyMinor } from '../../format/offering-counts';
import { formatMoneyMinor } from '../../format/welfare';
import { useFollowUpDefault, type FollowUpDefault } from '../../hooks/useFollowUpDefault';
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
  /**
   * The instruction note for whoever follows up. Optional, and independent of `officerMemberNo`: it
   * is sent whenever it is non-empty, whether the officer is named or left to the shepherd's default.
   */
  readonly officerReason?: string;
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
  officerError,
  onSubmit,
  onCancel,
  onOfficerValueChange,
}: {
  offerings: readonly EventOfferingItem[];
  currency: string;
  pending: boolean;
  notice: string | null;
  error: string | null;
  /**
   * The API's officer rejection when it belongs on the officer field rather than the error bar
   * (`officerProblemMessage`). The page owns it: it clears it on the next submit, on success, on
   * close and — through `onOfficerValueChange` — when the value it describes is replaced. A
   * `validation_error` naming `officerReason` lands here too: the form blocks a note over the API's
   * cap itself and never sends a whitespace-only one, so a lone server-side note rejection has no
   * separate state to describe, and the pair is acted on as a unit from the officer field.
   */
  officerError?: string | null;
  /**
   * Called when the picked member or the picked officer changes — the two moments the API's officer
   * message stops describing the value on screen. The page owns that message and the form owns the
   * picks, so the form reports the change and the page clears its state; the form cannot clear a
   * prop itself. Typing the note does not fire it: the note is a general instruction for whoever
   * follows up, not part of the picked value.
   */
  onOfficerValueChange?: () => void;
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
  const [officerTouched, setOfficerTouched] = useState(false);
  // The instruction note for whoever follows up. Optional and independent of the officer: it may be
  // written for the member's shepherd just as well as for a named presbyter.
  const [note, setNote] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const followUp = useFollowUpDefault(memberNo);

  const selectedOfferingId = offeringId ?? offerings[0]?.offeringId ?? null;
  const selectedCurrency =
    offerings.find((offering) => offering.offeringId === selectedOfferingId)?.terms.currency ??
    currency;
  const amountMinor = parseMoneyMinor(amount);
  const memberMissing = memberTouched && memberNo === null;
  const checkingShepherd = followUp.status === 'loading';
  // FR-26a: with an active shepherd the officer stays optional (empty means "that shepherd"); with
  // none, or when the default could not be read, the operator has to name one.
  const officerRequired = requiresOfficer(followUp);
  const officerMissing = officerTouched && officerRequired && officerMemberNo === null;
  // The officer field's own state sentence is passed to the picker so Fluent's `Field` points the
  // control's `aria-describedby` at it. The warning states keep their `MessageBar` (it announces
  // itself); these two are the states that used to sit beside the input as an unrelated sibling.
  const officerHint = followUpHint(followUp);
  const noteProblem = noteTouched ? officerNoteProblem(note) : null;
  // A local validation outranks the API's answer for the same field: it describes the value the
  // operator is looking at now.
  const officerMessage = officerMissing ? 'Pick the follow-up officer.' : (officerError ?? null);

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
    // Evaluated against the summary current at submit (FR-26a), not the state when the member was
    // picked: a refetch may have answered since.
    if (requiresOfficer(followUp) && officerMemberNo === null) {
      setOfficerTouched(true);
      setLocalError(
        followUp.status === 'error'
          ? "The member's shepherd could not be checked; pick the follow-up officer."
          : 'This member has no active shepherd; pick the follow-up officer.',
      );
      return;
    }
    // The note is optional, so an empty one never blocks the submit; only the API's maximum does.
    const trimmedNote = note.trim();
    if (officerNoteProblem(note) !== null) {
      setNoteTouched(true);
      return;
    }
    onSubmit({
      memberNo,
      offeringId: selectedOfferingId,
      amountMinor,
      expectedOn,
      ...(officerMemberNo !== null ? { officerMemberNo } : {}),
      ...(trimmedNote !== '' ? { officerReason: trimmedNote } : {}),
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
          // Any change of the picked value clears the officer, including MemberPicker clearing its
          // own selection to null while typing (MemberPicker.tsx:101) and the same member being
          // re-picked after a clear. Over-clearing is deliberate: the officer validation belonged
          // to the value it was shown for, and carrying a stale officer to another member (silently
          // overriding that member's shepherd default) is the direction that matters. The note is
          // written about *this* member's follow-up, so it goes with the member too. The page's
          // API officer message goes with the member for the same reason.
          if (next !== memberNo) {
            setOfficerMemberNo(null);
            setOfficerTouched(false);
            setNote('');
            setNoteTouched(false);
            onOfficerValueChange?.();
          }
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
          disabled={pending || checkingShepherd}
          hint={officerHint}
          validationState={officerMessage ? 'error' : undefined}
          validationMessage={officerMessage ?? undefined}
          onChange={(next) => {
            setOfficerMemberNo(next);
            if (next !== officerMemberNo) onOfficerValueChange?.();
            // The note no longer belongs to the picked officer — it may instruct the member's
            // shepherd just as well — so clearing the pick (MemberPicker does it while typing)
            // leaves the draft alone. The member change above is what resets it.
          }}
        />
        <Field
          label="Note for the follow-up officer"
          hint={`Optional — up to ${OFFICER_NOTE_MAX_LENGTH} characters. Tells whoever follows up how it should be done.`}
          validationState={noteProblem ? 'error' : undefined}
          validationMessage={noteProblem ?? undefined}
        >
          <Input value={note} disabled={pending} onChange={(_, data) => setNote(data.value)} />
        </Field>
      </div>
      <FollowUpSummary followUp={followUp} />
      <Text size={100} className={styles.muted}>
        The follow-up officer must be an active presbyter.
      </Text>
      {amountMinor !== null ? (
        <Text size={200} className={styles.muted}>
          {formatMoneyMinor(amountMinor, selectedCurrency)}
        </Text>
      ) : null}
      <div className={styles.badgeRow}>
        <Button appearance="primary" disabled={pending || checkingShepherd} onClick={submit}>
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

function requiresOfficer(followUp: FollowUpDefault): boolean {
  return followUp.status === 'error' || (followUp.status === 'ready' && followUp.shepherd === null);
}

/** The warning bar's sentence for the no-shepherd state; the picker's hint repeats it (see below). */
const NO_SHEPHERD_SENTENCE =
  'This member has no active presbyter assigned, so choose who follows up this pledge.';

/** The sentence for the state that disables the officer field. */
const CHECKING_SHEPHERD_SENTENCE =
  "Checking the member's shepherd; the field stays disabled until the shepherd is known.";

/**
 * The officer field's own hint (FR-26a): why the field is disabled while the default is being read,
 * why an officer has to be named when the read failed, and why it has to be named when the member
 * has no shepherd.
 *
 * `MessageBar` renders `role="group"`, not a live region, so its text is not announced on its own.
 * The no-shepherd sentence is therefore passed here as well: the field is enabled in that state, so
 * the hint is reachable as its description. The loading hint stays for the same reason, but the
 * field is disabled then, so `FollowUpSummary` announces that state from a live region.
 */
function followUpHint(followUp: FollowUpDefault): string | undefined {
  if (followUp.status === 'loading') return CHECKING_SHEPHERD_SENTENCE;
  if (followUp.status === 'error') {
    return 'The follow-up default is unavailable, so an officer is required.';
  }
  if (followUp.status === 'ready' && followUp.shepherd === null) return NO_SHEPHERD_SENTENCE;
  return undefined;
}

/**
 * The follow-up line under the officer field (FR-26a). Naming the shepherd is the point: the
 * operator learns who the API will record before submitting, and the absence of one before the
 * API's `422 officer_required` answers.
 */
function FollowUpSummary({ followUp }: { followUp: FollowUpDefault }) {
  const styles = useUssdStyles();

  // The live region is mounted for the life of the form and its **text** changes when the check
  // starts: a region inserted together with its content is commonly not announced, because the
  // screen reader is watching a node that did not exist when the change happened. Empty while there
  // is nothing to say.
  const announcement = followUp.status === 'loading' ? CHECKING_SHEPHERD_SENTENCE : '';

  // The field is disabled and its hint unreachable while the check runs, so the running check is
  // announced from this visually hidden polite live region instead. The hint still carries it for
  // the pointer.
  const liveRegion = (
    <div role="status" aria-live="polite" className={styles.visuallyHidden}>
      {announcement}
    </div>
  );

  if (followUp.status === 'idle') return liveRegion;
  if (followUp.status === 'loading') return liveRegion;

  if (followUp.status === 'error') {
    return (
      <>
        {liveRegion}
        <div className={styles.badgeRow}>
          <Badge appearance="outline" color="danger" size="small">
            Required
          </Badge>
        </div>
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>The member&rsquo;s shepherd could not be checked.</MessageBarTitle>
            Choose who follows up; the officer is required until the default is known.
          </MessageBarBody>
        </MessageBar>
      </>
    );
  }

  const shepherd = followUp.shepherd;
  if (!shepherd) {
    return (
      <>
        {liveRegion}
        <div className={styles.badgeRow}>
          <Badge appearance="outline" color="danger" size="small">
            Required
          </Badge>
        </div>
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>No active shepherd.</MessageBarTitle>
            {NO_SHEPHERD_SENTENCE}
          </MessageBarBody>
        </MessageBar>
      </>
    );
  }

  return (
    <>
      {liveRegion}
      <div className={styles.badgeRow}>
        <Badge appearance="outline" size="small">
          Optional
        </Badge>
        <Text size={200}>
          {`Shepherd ${shepherd.memberNo} · ${memberLabelFromName(
            shepherd.name || shepherd.memberNo,
            shepherd.gender,
            shepherd.age,
          )} is this member's active shepherd, and the officer recorded when the field is left empty.`}
        </Text>
      </div>
    </>
  );
}
