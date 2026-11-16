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
  InfoLabel,
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
import { DeleteRegular, ShieldLockRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, isUnauthorized } from '../api/errors';
import {
  addContact,
  fetchMemberDetail,
  removeContact,
  type ContactInput,
  type ContactKind,
  type Gender,
  type MemberContact,
} from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from './ConfirmDialog';
import { memberInitials, memberLabel } from '../format/member';

/**
 * FR-78 fixes the flat list's order: the contract's kind order first, then
 * `displayOrder` within a kind. This array is both that order and the kind's
 * visible name; the placeholder is the drawing's wording for the add row.
 */
const CONTACT_KINDS: readonly { kind: ContactKind; label: string; placeholder: string }[] = [
  { kind: 'phone', label: 'Phone', placeholder: 'Phone number' },
  { kind: 'email', label: 'Email', placeholder: 'Email address' },
  { kind: 'whatsapp', label: 'WhatsApp', placeholder: 'WhatsApp number' },
];

/**
 * FR-78 fixes this copy exactly, as one string: the note above the list says why
 * the values appeared and where they came from. Do not reword or truncate it.
 */
const CONTACT_PRIVACY_NOTE =
  'Contact values are shown only after this explicit action. The members list returns a count, not the values; opening this dialog is the only way to see them here.';

/**
 * FR-78/FR-81 fix the note's information affordance and its tooltip content to one
 * string. The button carries it as `aria-label` and as the tooltip body; the explicit
 * label is required because Fluent associates `aria-describedby` only while the
 * tooltip is open.
 */
const CONTACT_OWNERSHIP_INFO =
  'Owned values belong to this member. Linked values are shared from another member and stay with its owner.';

const useStyles = makeStyles({
  // FR-78: a 600 px surface, capped at the viewport so a narrow screen never scrolls sideways.
  dialogSurface: {
    width: '600px',
    maxWidth: '100%',
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  dialogMember: {
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
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  note: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalM,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  /** The drawing's leading shield-lock glyph; it sits on the note's first text line. */
  noteIcon: {
    flexShrink: 0,
    fontSize: '20px',
    color: tokens.colorNeutralForeground2,
  },
  /**
   * FR-78: one bordered container holds every value; the rows are separated by a
   * divider rather than by gaps between separate boxes.
   */
  contactList: {
    display: 'flex',
    flexDirection: 'column',
    // A real <ul>: the list container keeps its box by resetting the element's own
    // marker, indent and block margin, and the implicit `list` role stays.
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  // FR-78: the 42 px row rhythm is the drawing's; Fluent's spacing tokens have no
  // 42 px step, so the floor stays literal and the padding keeps the token scale.
  // The kind leads in a fixed muted column, the value takes the room left, and the
  // owner/linked status sits at the row's right.
  contactRow: {
    display: 'grid',
    gridTemplateColumns: '84px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minHeight: '42px',
    padding: `0 ${tokens.spacingHorizontalM}`,
  },
  contactRowDivided: {
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
  },
  contactKind: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  contactValue: {
    wordBreak: 'break-all',
  },
  contactStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    whiteSpace: 'nowrap',
  },
  contactOwner: {
    color: tokens.colorNeutralForeground3,
  },
  /** The add row sits above the list, with its error directly under it (AC-53). */
  addForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  addFields: {
    display: 'grid',
    gridTemplateColumns: '150px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
});

export interface ContactsDialogMember {
  memberNo: string;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  gender?: Gender;
  age?: number | null;
  /** A caller-composed label (for example the roster's `memberLabel`) wins. */
  displayName?: string | null;
  isPresbyter?: boolean;
}

function contactDisplayName(member: ContactsDialogMember): string {
  const displayName = member.displayName?.trim();
  return displayName && displayName.length > 0 ? displayName : memberLabel(member);
}

function contactInitials(member: ContactsDialogMember): string {
  if (member.firstName.trim() || member.lastName.trim()) return memberInitials(member);

  const displayName = member.displayName?.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!displayName) return '?';

  const parts = displayName.split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return `${first}${last}`.toUpperCase() || '?';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/** A 409 is a duplicate value and a 422 is an invalid value; both are inline. */
function contactErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && (error.status === 409 || error.status === 422)) {
    return error.message;
  }
  return fallback;
}

function kindLabel(kind: ContactKind): string {
  return CONTACT_KINDS.find((entry) => entry.kind === kind)?.label ?? kind;
}

function kindPlaceholder(kind: ContactKind): string {
  return CONTACT_KINDS.find((entry) => entry.kind === kind)?.placeholder ?? 'Contact value';
}

/**
 * FR-78: the contract's kind order first, then `displayOrder` within a kind, so
 * the response's own preference order survives. One flat list, one sort.
 */
function orderContacts(contacts: readonly MemberContact[]): MemberContact[] {
  const rank = new Map(CONTACT_KINDS.map((entry, index) => [entry.kind, index]));
  return contacts
    .slice()
    .sort(
      (left, right) =>
        (rank.get(left.kind) ?? 0) - (rank.get(right.kind) ?? 0) ||
        left.displayOrder - right.displayOrder,
    );
}

/**
 * The add-contact row and its mutation (FR-78, AC-53). It is mounted only when the
 * dialog is editable, so the read-only list call site never creates a write path.
 * One row, no field labels: the drawing's `Dropdown` + `Input` + primary `Add`;
 * the failed add renders directly beneath that row with the entered value kept.
 */
function ContactAddForm({ memberNo, onAdded }: { memberNo: string; onAdded: () => void }) {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [kind, setKind] = useState<ContactKind>('phone');
  const [value, setValue] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: (input: ContactInput) => addContact(baseUrl, token, memberNo, input),
  });

  function add(): void {
    if (addMutation.isPending) return;

    const trimmed = value.trim();
    if (trimmed.length === 0) return;

    setAddError(null);
    addMutation.mutate(
      { kind, value: trimmed },
      {
        onSuccess: () => {
          setValue('');
          onAdded();
        },
        onError: (error: unknown) => {
          if (isUnauthorized(error)) {
            void signOut();
            return;
          }
          setAddError(contactErrorMessage(error, errorMessage(error)));
        },
      },
    );
  }

  return (
    <div className={styles.addForm}>
      <div className={styles.addFields}>
        <Dropdown
          aria-label="Kind"
          value={kindLabel(kind)}
          selectedOptions={[kind]}
          onOptionSelect={(_, data) => {
            const next = CONTACT_KINDS.find((entry) => entry.kind === data.optionValue);
            if (next) setKind(next.kind);
          }}
        >
          {CONTACT_KINDS.map((entry) => (
            <Option key={entry.kind} value={entry.kind}>
              {entry.label}
            </Option>
          ))}
        </Dropdown>
        <Input
          aria-label="Contact value"
          placeholder={kindPlaceholder(kind)}
          value={value}
          onChange={(_, data) => {
            setValue(data.value);
            setAddError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button
          appearance="primary"
          onClick={add}
          disabled={addMutation.isPending || value.trim().length === 0}
        >
          Add
        </Button>
      </div>
      {addError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The contact was not added</MessageBarTitle>
            {addError}
          </MessageBarBody>
        </MessageBar>
      ) : null}
    </div>
  );
}

/**
 * The remove-contact mutation and confirmation. Like the add form it is mounted
 * only for the editable call site.
 */
function ContactRemoveDialog({
  memberNo,
  target,
  onClose,
  onRemoved,
  onError,
}: {
  memberNo: string;
  target: MemberContact | null;
  onClose: () => void;
  onRemoved: () => void;
  onError: (message: string) => void;
}) {
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const removeMutation = useMutation({
    mutationFn: (contactId: string) => removeContact(baseUrl, token, memberNo, contactId),
  });

  function confirmRemove(): void {
    if (!target || removeMutation.isPending) return;

    removeMutation.mutate(target.id, {
      onSuccess: () => {
        onClose();
        onRemoved();
      },
      onError: (error: unknown) => {
        onClose();
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        onError(errorMessage(error));
      },
    });
  }

  return (
    <ConfirmDialog
      open={target !== null}
      title={target ? `Remove ${target.value}?` : 'Remove contact?'}
      message="The value is removed from this member. A linked value belongs to another member and stays with its owner."
      confirmLabel="Remove contact"
      busy={removeMutation.isPending}
      onConfirm={confirmRemove}
      onCancel={onClose}
    />
  );
}

/**
 * Call sites: MembersPage (contacts action, read-only), MemberDetailPage
 * (contacts action, editable) and ShepherdingRosterPage (contacts action,
 * read-only; the roster passes `displayName` because it has no name split). The
 * list dialog is one flat list of values with their owner/linked status and
 * cannot add, remove, copy or edit them (FR-78, AC-47); the detail dialog is
 * editable because opening the member is already an explicit action (FR-29, AC-53).
 * All call sites share the `['member', baseUrl, memberNo]` cache key.
 */
export function ContactsDialog({
  member,
  open,
  onOpenChange,
  onOpenMember,
  editable = false,
}: {
  member: ContactsDialogMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When present, show an "Open member" action. */
  onOpenMember?: (memberNo: string) => void;
  /** Defaults to false: the list dialog is read-only (FR-78). */
  editable?: boolean;
}) {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const memberNo = member?.memberNo ?? '';
  const queryClient = useQueryClient();

  const [actionError, setActionError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberContact | null>(null);

  const detail = useQuery({
    queryKey: ['member', baseUrl, memberNo],
    queryFn: ({ signal }) => fetchMemberDetail(baseUrl, token, memberNo, signal),
    enabled: open && member !== null && Boolean(token),
  });

  useEffect(() => {
    if (isUnauthorized(detail.error)) void signOut();
  }, [detail.error, signOut]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['member', baseUrl, memberNo] });
    void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
  };

  const contacts = detail.data?.member.contacts ?? [];

  return (
    <>
      <Dialog
        open={open && member !== null}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setActionError(null);
            setRemoveTarget(null);
          }
          onOpenChange(data.open);
        }}
      >
        <DialogSurface className={styles.dialogSurface} aria-label="Contacts">
          <DialogBody>
            <DialogTitle>Contacts</DialogTitle>
            {member ? (
              <>
                <DialogContent className={styles.dialogContent}>
                  <div className={styles.dialogMember}>
                    <Avatar
                      name={contactDisplayName(member)}
                      initials={contactInitials(member)}
                      color="colorful"
                      size={40}
                    />
                    <div>
                      <div className={styles.nameRow}>
                        <Text weight="semibold">{contactDisplayName(member)}</Text>
                        {member.isPresbyter ? (
                          <Badge appearance="tint" color="informative" size="small">
                            Presbyter
                          </Badge>
                        ) : null}
                      </div>
                      <Text size={200} className={styles.muted}>
                        {member.memberNo}
                      </Text>
                    </div>
                  </div>

                  {/*
                    FR-78: the note is the dialog's single information affordance, and the
                    note's own copy is the `InfoLabel`'s label, so the button sits inline at
                    the end of the sentence instead of on a line of its own. The button
                    carries the ownership sentence as its `aria-label` and its tooltip
                    (FR-81); Fluent also wires `aria-labelledby` to the label it is handed.
                  */}
                  <div className={styles.note}>
                    <ShieldLockRegular className={styles.noteIcon} aria-hidden />
                    <InfoLabel
                      size="small"
                      info={{ children: CONTACT_OWNERSHIP_INFO }}
                      infoButton={{ 'aria-label': CONTACT_OWNERSHIP_INFO }}
                    >
                      {CONTACT_PRIVACY_NOTE}
                    </InfoLabel>
                  </div>

                  {editable && actionError ? (
                    <MessageBar intent="error">
                      <MessageBarBody>
                        <MessageBarTitle>The contact was not changed</MessageBarTitle>
                        {actionError}
                      </MessageBarBody>
                    </MessageBar>
                  ) : null}

                  {/* AC-53: the add row sits above the list, never below it. */}
                  {editable && !detail.isPending && !detail.isError ? (
                    <ContactAddForm
                      key={open ? 'add-open' : 'add-closed'}
                      memberNo={memberNo}
                      onAdded={invalidate}
                    />
                  ) : null}

                  {detail.isPending ? (
                    <Spinner size="small" label="Loading contacts…" />
                  ) : detail.isError ? (
                    <MessageBar intent="error">
                      <MessageBarBody>
                        <MessageBarTitle>Contacts could not be loaded</MessageBarTitle>
                        {errorMessage(detail.error)}
                        <Button
                          size="small"
                          appearance="transparent"
                          onClick={() => {
                            void detail.refetch();
                          }}
                        >
                          Retry
                        </Button>
                      </MessageBarBody>
                    </MessageBar>
                  ) : contacts.length === 0 ? (
                    <Text className={styles.muted}>No contacts recorded for this member.</Text>
                  ) : (
                    <ul className={styles.contactList}>
                      {orderContacts(contacts).map((contact, index) => (
                        <li
                          key={contact.id}
                          className={
                            index === 0
                              ? styles.contactRow
                              : `${styles.contactRow} ${styles.contactRowDivided}`
                          }
                        >
                          <Text size={200} className={styles.contactKind}>
                            {kindLabel(contact.kind)}
                          </Text>
                          <Text className={styles.contactValue}>{contact.value}</Text>
                          {contact.linked ? (
                            <Text size={200} className={styles.contactOwner}>
                              Linked · {contact.ownerMemberNo}
                            </Text>
                          ) : (
                            <div className={styles.contactStatus}>
                              <Text size={200} className={styles.contactOwner}>
                                Owned
                              </Text>
                              {editable ? (
                                <Button
                                  size="small"
                                  appearance="subtle"
                                  icon={<DeleteRegular />}
                                  aria-label={`Remove ${contact.value}`}
                                  onClick={() => {
                                    setActionError(null);
                                    setRemoveTarget(contact);
                                  }}
                                >
                                  Remove
                                </Button>
                              ) : null}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </DialogContent>
                <DialogActions>
                  <Button appearance="secondary" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                  {onOpenMember ? (
                    <Button
                      appearance="primary"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenMember(member.memberNo);
                      }}
                    >
                      Open member
                    </Button>
                  ) : null}
                </DialogActions>
              </>
            ) : null}
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {editable ? (
        <ContactRemoveDialog
          memberNo={memberNo}
          target={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onRemoved={invalidate}
          onError={setActionError}
        />
      ) : null}
    </>
  );
}
