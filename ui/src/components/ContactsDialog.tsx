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
  Tooltip,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  DeleteRegular,
  EditRegular,
  LinkDismissRegular,
  ShieldLockRegular,
} from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError, isUnauthorized } from '../api/errors';
import {
  addContact,
  fetchMemberDetail,
  linkContact,
  listMembers,
  removeContact,
  unlinkContact,
  updateContact,
  type ContactInput,
  type ContactKind,
  type Gender,
  type MemberContact,
} from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from './ConfirmDialog';
import { contactValueKey } from '../format/member-form';
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

/** FR-78 words the link offer; the owner's name and number sit beside it. */
const LINK_OFFER_LABEL = "Link the household's value";

/** FR-78's cascade wording: every member who shares the value loses it too. */
const REMOVE_CONTACT_MESSAGE =
  'This value is removed from this member and from every member who shares it.';

/** FR-78: unlinking drops the value from this member; its owner keeps it. */
const UNLINK_CONTACT_MESSAGE =
  'This value is removed from this member only. It stays with the member who owns it.';

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
  /**
   * FR-78/AC-54: the 409 offer names the owner and offers the link. Only the
   * name and number kept in state are rendered; the owner's record is not.
   */
  linkOffer: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalM,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  /** FR-78: a row in edit mode becomes the add row's one-row form, value only. */
  editCell: {
    minHeight: '42px',
  },
  editRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
  },
  editActions: {
    display: 'flex',
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

/**
 * The value a duplicate `409` names, parsed the way `contactConflictErrors` does:
 * `Contact value "+233 20 000 0004" already belongs to a member`. Anything else
 * (another status, or a 409 that quotes nothing) never becomes a link offer.
 */
function duplicateValue(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  return /"([^"]+)"/.exec(error.message)?.[1] ?? null;
}

function kindLabel(kind: ContactKind): string {
  return CONTACT_KINDS.find((entry) => entry.kind === kind)?.label ?? kind;
}

function kindPlaceholder(kind: ContactKind): string {
  return CONTACT_KINDS.find((entry) => entry.kind === kind)?.placeholder ?? 'Contact value';
}

/**
 * FR-78: the accessible name and the tooltip of a row action carry its verb, its
 * kind and its value, so three glyph-only buttons are told apart by name (FR-81).
 */
function rowActionLabel(verb: 'Edit' | 'Remove' | 'Unlink', contact: MemberContact): string {
  return `${verb} ${contact.kind} ${contact.value}`;
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

/** What a resolved duplicate keeps: nothing else from the owner's record (FR-78, NFR-4). */
interface ContactLinkOffer {
  readonly contactId: string;
  readonly ownerMemberNo: string;
  readonly ownerName: string;
}

/**
 * The add-contact row and its mutation (FR-78, AC-53). It is mounted only when the
 * dialog is editable, so the read-only list call site never creates a write path.
 * One row, no field labels: the drawing's `Dropdown` + `Input` + primary `Add`;
 * the failed add renders directly beneath that row with the entered value kept.
 *
 * AC-54: a `409` for a value another member owns resolves that owner through the
 * existing `contact` filter and offers the household link. The candidates' details
 * are read directly - never through `useQuery` - so no owner record lands in the
 * `['member', …]` cache, and only the three fields above survive the resolution.
 */
function ContactAddForm({ memberNo, onAdded }: { memberNo: string; onAdded: () => void }) {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [kind, setKind] = useState<ContactKind>('phone');
  const [value, setValue] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [offer, setOffer] = useState<ContactLinkOffer | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  /** Guards the offer against a slower resolution for a value the operator has replaced. */
  const resolution = useRef(0);

  const addMutation = useMutation({
    mutationFn: (input: ContactInput) => addContact(baseUrl, token, memberNo, input),
  });

  const linkMutation = useMutation({
    mutationFn: (contactId: string) => linkContact(baseUrl, token, memberNo, contactId),
  });

  async function resolveOwner(quoted: string): Promise<void> {
    const ticket = ++resolution.current;
    setOffer(null);
    setLinkError(null);

    try {
      const page = await listMembers(baseUrl, token, {
        contact: quoted,
        includeSubscriptions: false,
      });

      const owners: ContactLinkOffer[] = [];
      for (const candidate of page.items) {
        // The offer is for a value "owned by another member" (FR-78); a value this
        // member already owns is the plain duplicate and is not read again.
        if (candidate.memberNo === memberNo) continue;

        const { member } = await fetchMemberDetail(baseUrl, token, candidate.memberNo);
        // The filter matches owners and linkers alike, so `linked: false` on a row
        // for the same normalised value is the only discriminator (FR-78).
        const owned = member.contacts.find(
          (contact) =>
            !contact.linked &&
            contactValueKey(contact.kind, contact.value) === contactValueKey(contact.kind, quoted),
        );
        if (owned) {
          owners.push({
            contactId: owned.id,
            ownerMemberNo: member.memberNo,
            ownerName: memberLabel(member),
          });
        }
      }

      if (resolution.current === ticket && owners.length === 1) setOffer(owners[0]!);
    } catch (error) {
      if (isUnauthorized(error)) void signOut();
      // No owner, more than one, or a failed read: the inline error stands alone.
    }
  }

  function clearTransient(): void {
    setAddError(null);
    setOffer(null);
    setLinkError(null);
  }

  function add(): void {
    if (addMutation.isPending) return;

    const trimmed = value.trim();
    if (trimmed.length === 0) return;

    clearTransient();
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
          const quoted = duplicateValue(error);
          if (quoted) void resolveOwner(quoted);
        },
      },
    );
  }

  function link(): void {
    if (!offer || linkMutation.isPending) return;

    setLinkError(null);
    linkMutation.mutate(offer.contactId, {
      onSuccess: () => {
        setValue('');
        clearTransient();
        onAdded();
      },
      onError: (error: unknown) => {
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        // FR-78: the offer stays and the failure sits beneath it.
        setLinkError(errorMessage(error));
      },
    });
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
            clearTransient();
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
      {offer ? (
        <div className={styles.linkOffer}>
          <Text size={200} className={styles.muted}>
            Owned by {offer.ownerName} · {offer.ownerMemberNo}
          </Text>
          <Button
            appearance="primary"
            size="small"
            onClick={link}
            disabled={linkMutation.isPending}
          >
            {LINK_OFFER_LABEL}
          </Button>
          {linkError ? (
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>The value was not linked</MessageBarTitle>
                {linkError}
              </MessageBarBody>
            </MessageBar>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * FR-78/AC-53: `Edit` turns the row into the add row's one-row form with the value
 * prefilled, `Save` and `Cancel`. The kind is not editable this cycle, so only the
 * value is sent; a failed save keeps the entered value under that row.
 */
function ContactEditRow({
  memberNo,
  contact,
  onSaved,
  onCancel,
}: {
  memberNo: string;
  contact: MemberContact;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [value, setValue] = useState(contact.value);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (next: string) =>
      updateContact(baseUrl, token, memberNo, contact.id, { value: next }),
  });

  function save(): void {
    if (saveMutation.isPending) return;

    const trimmed = value.trim();
    if (trimmed.length === 0) return;

    setSaveError(null);
    saveMutation.mutate(trimmed, {
      onSuccess: () => {
        onSaved();
      },
      onError: (error: unknown) => {
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        setSaveError(contactErrorMessage(error, errorMessage(error)));
      },
    });
  }

  return (
    <div className={styles.editRow}>
      <div className={styles.addFields}>
        <Text size={200} className={styles.contactKind}>
          {kindLabel(contact.kind)}
        </Text>
        <Input
          aria-label="Edit contact value"
          value={value}
          onChange={(_, data) => {
            setValue(data.value);
            setSaveError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            }
            if (event.key === 'Escape') onCancel();
          }}
        />
        <div className={styles.editActions}>
          <Button
            appearance="primary"
            onClick={save}
            disabled={saveMutation.isPending || value.trim().length === 0}
          >
            Save
          </Button>
          <Button appearance="secondary" onClick={onCancel} disabled={saveMutation.isPending}>
            Cancel
          </Button>
        </div>
      </div>
      {saveError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The contact was not saved</MessageBarTitle>
            {saveError}
          </MessageBarBody>
        </MessageBar>
      ) : null}
    </div>
  );
}

/** The two destructive row actions; both confirm and both report a failure above the list. */
interface ContactConfirmRequest {
  readonly action: 'remove' | 'unlink';
  readonly contact: MemberContact;
}

/**
 * The remove/unlink mutation and its confirmation. Like the add form it is mounted
 * only for the editable call site. FR-78 puts a failed `Remove` or `Unlink` in the
 * dialog's action error, above the list, with the list unchanged; the confirmation
 * closes first.
 */
function ContactConfirmDialog({
  memberNo,
  request,
  onClose,
  onDone,
  onError,
}: {
  memberNo: string;
  request: ContactConfirmRequest | null;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const remove = request?.action === 'remove';
  const target = request?.contact ?? null;

  const mutation = useMutation({
    mutationFn: (contactId: string) =>
      remove
        ? removeContact(baseUrl, token, memberNo, contactId)
        : unlinkContact(baseUrl, token, memberNo, contactId),
  });

  function confirm(): void {
    if (!target || mutation.isPending) return;

    mutation.mutate(target.id, {
      onSuccess: () => {
        onClose();
        onDone();
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
      title={target ? `${remove ? 'Remove' : 'Unlink'} ${target.value}?` : 'Remove contact?'}
      message={remove ? REMOVE_CONTACT_MESSAGE : UNLINK_CONTACT_MESSAGE}
      confirmLabel={remove ? 'Remove contact' : 'Unlink'}
      busy={mutation.isPending}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}

/**
 * Call sites: MembersPage (contacts action, read-only), MemberDetailPage
 * (the tab-row `View Contacts (n)` button, editable) and ShepherdingRosterPage
 * (contacts action, read-only; the roster passes `displayName` because it has no
 * name split). The
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
  const [confirm, setConfirm] = useState<ContactConfirmRequest | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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
            setConfirm(null);
            setEditingId(null);
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
                      {orderContacts(contacts).map((contact, index) => {
                        const editing = editable && editingId === contact.id;
                        const editLabel = rowActionLabel('Edit', contact);
                        const removeLabel = rowActionLabel('Remove', contact);
                        const unlinkLabel = rowActionLabel('Unlink', contact);

                        return (
                          <li
                            key={contact.id}
                            className={[
                              editing ? styles.editCell : styles.contactRow,
                              index === 0 ? null : styles.contactRowDivided,
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {editing ? (
                              <ContactEditRow
                                memberNo={memberNo}
                                contact={contact}
                                onSaved={() => {
                                  setEditingId(null);
                                  invalidate();
                                }}
                                onCancel={() => setEditingId(null)}
                              />
                            ) : (
                              <>
                                <Text size={200} className={styles.contactKind}>
                                  {kindLabel(contact.kind)}
                                </Text>
                                <Text className={styles.contactValue}>{contact.value}</Text>
                                <div className={styles.contactStatus}>
                                  <Text size={200} className={styles.contactOwner}>
                                    {contact.linked ? `Linked · ${contact.ownerMemberNo}` : 'Owned'}
                                  </Text>
                                  {editable ? (
                                    contact.linked ? (
                                      // FR-78: a linked row carries Unlink and no Remove.
                                      <Tooltip
                                        content={unlinkLabel}
                                        relationship="description"
                                        withArrow
                                      >
                                        <Button
                                          size="small"
                                          appearance="subtle"
                                          icon={<LinkDismissRegular />}
                                          aria-label={unlinkLabel}
                                          disabled={confirm !== null || editingId !== null}
                                          onClick={() => {
                                            setActionError(null);
                                            setConfirm({ action: 'unlink', contact });
                                          }}
                                        />
                                      </Tooltip>
                                    ) : (
                                      <>
                                        <Tooltip
                                          content={editLabel}
                                          relationship="description"
                                          withArrow
                                        >
                                          <Button
                                            size="small"
                                            appearance="subtle"
                                            icon={<EditRegular />}
                                            aria-label={editLabel}
                                            disabled={confirm !== null || editingId !== null}
                                            onClick={() => {
                                              setActionError(null);
                                              setEditingId(contact.id);
                                            }}
                                          />
                                        </Tooltip>
                                        <Tooltip
                                          content={removeLabel}
                                          relationship="description"
                                          withArrow
                                        >
                                          <Button
                                            size="small"
                                            appearance="subtle"
                                            icon={<DeleteRegular />}
                                            aria-label={removeLabel}
                                            disabled={confirm !== null || editingId !== null}
                                            onClick={() => {
                                              setActionError(null);
                                              setConfirm({ action: 'remove', contact });
                                            }}
                                          />
                                        </Tooltip>
                                      </>
                                    )
                                  ) : null}
                                </div>
                              </>
                            )}
                          </li>
                        );
                      })}
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
        <ContactConfirmDialog
          memberNo={memberNo}
          request={confirm}
          onClose={() => setConfirm(null)}
          onDone={invalidate}
          onError={setActionError}
        />
      ) : null}
    </>
  );
}
