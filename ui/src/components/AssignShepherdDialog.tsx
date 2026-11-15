import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { assignMember, type AssignmentInput } from '../api/shepherding';
import { isUnauthorized } from '../api/errors';
import { useSession } from '../auth/SessionProvider';
import { MemberPicker } from './MemberPicker';
import { currentAssignmentOf, validateReason, type CurrentAssignment } from '../format/shepherding';
import { useDateTimeFormat } from '../shell/DateTimeProvider';

const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  note: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  conflictActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    paddingTop: tokens.spacingVerticalS,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
});

export interface AssignShepherdTarget {
  readonly memberNo: string;
  readonly memberName?: string;
  readonly currentAssignment?: {
    readonly assignmentId: string;
    readonly officerMemberNo: string;
    readonly officerName?: string;
    readonly assignedOn: string;
  } | null;
}

/** The officer a member is assigned to when the dialog opens from that officer's roster. */
export interface AssignShepherdOfficer {
  readonly memberNo: string;
  readonly memberName?: string;
}

export interface AssignShepherdDialogProps {
  /** The member being assigned when the member is already known (member detail, a roster row). */
  readonly memberNo?: string;
  readonly memberName?: string;
  /**
   * Assign-to-this-officer mode (the roster's page action): the officer is fixed and the
   * member is chosen here instead. Mutually exclusive with `memberNo`; the officer field
   * and the member field swap, and the POST body is unchanged.
   */
  readonly fixedOfficer?: AssignShepherdOfficer;
  readonly currentAssignment?: AssignShepherdTarget['currentAssignment'];
  readonly onClose: () => void;
  readonly onAssigned: () => void;
}

/**
 * Call sites: MemberDetailPage (assign when there is no shepherd, reassign when
 * there is one), ShepherdingRosterPage (reassign a roster row) and the roster's
 * `Assign member` page action (`fixedOfficer`: assign a chosen member to that
 * officer). Feature component: it owns the assignment POST and the 409 consent
 * round trip; the caller owns invalidation through `onAssigned`.
 *
 * A `409` with `currentAssignment` names the current officer and pauses; the
 * retry is an explicit click and carries the returned id (FR-63, AC-37).
 */
export function AssignShepherdDialog({
  memberNo,
  memberName,
  fixedOfficer,
  currentAssignment,
  onClose,
  onAssigned,
}: AssignShepherdDialogProps) {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate } = useDateTimeFormat();
  const token = session?.token ?? '';

  const [officerMemberNo, setOfficerMemberNo] = useState<string | null>(
    fixedOfficer?.memberNo ?? null,
  );
  const [chosenMemberNo, setChosenMemberNo] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [officerError, setOfficerError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<CurrentAssignment | null>(null);
  const [replaceAssignmentId, setReplaceAssignmentId] = useState<string | undefined>(
    currentAssignment?.assignmentId,
  );

  // In fixed-officer mode the member is the picker; otherwise the member is the subject.
  const targetMemberNo = memberNo ?? chosenMemberNo;

  const assignMutation = useMutation({
    mutationFn: (input: AssignmentInput) => assignMember(baseUrl, token, input),
  });

  function submit(nextReplaceAssignmentId = replaceAssignmentId): void {
    if (assignMutation.isPending) return;

    const reasonMessage = validateReason(reason);
    setReasonError(reasonMessage);
    setOfficerError(officerMemberNo ? null : 'Choose the officer who will shepherd this member.');
    setMemberError(targetMemberNo ? null : 'Choose the member this officer will shepherd.');

    if (reasonMessage || !officerMemberNo || !targetMemberNo) return;

    setFormError(null);
    assignMutation.mutate(
      {
        officerMemberNo,
        memberNo: targetMemberNo,
        reason: reason.trim(),
        ...(nextReplaceAssignmentId ? { replaceAssignmentId: nextReplaceAssignmentId } : {}),
      },
      {
        onSuccess: () => {
          onAssigned();
          onClose();
        },
        onError: (error: unknown) => {
          if (isUnauthorized(error)) {
            void signOut();
            return;
          }

          const stale = currentAssignmentOf(error);
          if (stale) {
            setConflict(stale);
            return;
          }

          setFormError(
            error instanceof Error && error.message.trim()
              ? error.message
              : 'Check the API connection and try again.',
          );
        },
      },
    );
  }

  const title = fixedOfficer
    ? 'Assign a member'
    : currentAssignment
      ? 'Reassign member'
      : 'Assign a shepherd';

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open && !assignMutation.isPending) onClose();
      }}
    >
      <DialogSurface aria-label={title}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent className={styles.content}>
            {fixedOfficer ? (
              <div className={styles.note}>
                <Text weight="semibold">Officer</Text>
                <Text size={200}>
                  {fixedOfficer.memberName
                    ? `${fixedOfficer.memberName} · ${fixedOfficer.memberNo}`
                    : fixedOfficer.memberNo}
                </Text>
                <Text size={200} className={styles.muted}>
                  The new assignment starts today and the member leaves the unassigned pool.
                </Text>
              </div>
            ) : (
              <Text size={200} className={styles.muted}>
                {memberName ? `${memberName} · ${memberNo}` : memberNo}
              </Text>
            )}

            {fixedOfficer ? (
              <MemberPicker
                label="Member"
                value={chosenMemberNo}
                onChange={(value) => {
                  setChosenMemberNo(value);
                  setMemberError(null);
                  setConflict(null);
                  setFormError(null);
                }}
                excludeMemberNo={fixedOfficer.memberNo}
                validationState={memberError ? 'error' : 'none'}
                validationMessage={memberError ?? undefined}
              />
            ) : null}

            {currentAssignment ? (
              <div className={styles.note}>
                <Text weight="semibold">Current shepherd</Text>
                <Text size={200}>
                  {currentAssignment.officerName
                    ? `${currentAssignment.officerName} · ${currentAssignment.officerMemberNo}`
                    : currentAssignment.officerMemberNo}{' '}
                  · assigned {formatDate(currentAssignment.assignedOn)}
                </Text>
                <Text size={200} className={styles.muted}>
                  Saving ends this assignment on the new assignment&apos;s start date and keeps the
                  pastoral history.
                </Text>
              </div>
            ) : null}

            {fixedOfficer ? null : (
              <MemberPicker
                label="Officer"
                value={officerMemberNo}
                onChange={(value) => {
                  setOfficerMemberNo(value);
                  setOfficerError(null);
                  setConflict(null);
                  setFormError(null);
                }}
                excludeMemberNo={memberNo}
                validationState={officerError ? 'error' : 'none'}
                validationMessage={officerError ?? undefined}
              />
            )}

            <Field
              label="Reason"
              hint="3–500 characters. The reason is stored on the assignment and its history."
              validationState={reasonError ? 'error' : 'none'}
              validationMessage={reasonError ?? undefined}
            >
              <Textarea
                value={reason}
                resize="vertical"
                rows={3}
                onChange={(_, data) => {
                  setReason(data.value);
                  setReasonError(null);
                  setConflict(null);
                  setFormError(null);
                }}
              />
            </Field>
            <Text size={100} className={styles.muted}>
              {reason.trim().length}/500
            </Text>

            {formError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The assignment was not saved</MessageBarTitle>
                  {formError}
                </MessageBarBody>
              </MessageBar>
            ) : null}

            {conflict ? (
              <MessageBar intent="warning">
                <MessageBarBody>
                  <MessageBarTitle>This member already has a shepherd</MessageBarTitle>
                  Member {targetMemberNo} is currently shepherded by officer{' '}
                  {conflict.officerMemberNo}{' '}
                  (the wire carries no name), assigned {formatDate(conflict.assignedOn)}.
                  Reassigning ends that assignment and keeps its history. Confirm to resend with the
                  current assignment.
                  <div className={styles.conflictActions}>
                    <Button
                      appearance="primary"
                      size="small"
                      onClick={() => {
                        setConflict(null);
                        setReplaceAssignmentId(conflict.id);
                        submit(conflict.id);
                      }}
                      disabled={assignMutation.isPending}
                    >
                      Reassign and end the current assignment
                    </Button>
                    <Button
                      appearance="secondary"
                      size="small"
                      onClick={() => setConflict(null)}
                      disabled={assignMutation.isPending}
                    >
                      Keep the current shepherd
                    </Button>
                  </div>
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={assignMutation.isPending}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={() => submit()}
              disabled={assignMutation.isPending || conflict !== null}
            >
              {currentAssignment || replaceAssignmentId ? 'Reassign' : 'Assign'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
