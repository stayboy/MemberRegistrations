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

const CONTACT_GROUPS: readonly { kind: ContactKind; label: string }[] = [
  { kind: 'phone', label: 'Phone' },
  { kind: 'email', label: 'Email' },
  { kind: 'whatsapp', label: 'WhatsApp' },
];

/**
 * FR-78 fixes this copy exactly, as one string: the note above the groups says
 * why the values appeared and where they came from. Do not reword or truncate it.
 */
const CONTACT_PRIVACY_NOTE =
  'Contact values are shown only after this explicit action. The members list returns a count, not the values; opening this dialog is the only way to see them here.';

/**
 * FR-78/FR-81 fix the group affordance's accessible name and its tooltip content
 * to one string. The explicit `aria-label` is what carries it: Fluent associates
 * `aria-describedby` only while the tooltip is open.
 */
const CONTACT_GROUP_INFO =
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
  contactGroups: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  contactGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  /**
   * The group title keeps heading semantics (it is an `<h3>`, as the drawing shows)
   * and the Fluent `InfoLabel` sits beside it, so the heading's accessible name stays
   * the group name while the info button carries the FR-78 description (FR-81).
   */
  contactGroupHeading: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  contactGroupTitle: {
    margin: 0,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase300,
  },
  // FR-78: the 42 px row rhythm is the drawing's; Fluent's spacing tokens have no
  // 42 px step, so the floor stays literal and the padding keeps the token scale.
  contactRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    minHeight: '42px',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
  },
  contactValue: {
    wordBreak: 'break-all',
  },
  contactActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  contactOwner: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
  addForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalM,
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
  },
  addFields: {
    display: 'grid',
    gridTemplateColumns: 'minmax(140px, 1fr) minmax(180px, 2fr) auto',
    alignItems: 'end',
    gap: tokens.spacingHorizontalM,
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
  return CONTACT_GROUPS.find((group) => group.kind === kind)?.label ?? kind;
}

/**
 * The add-contact form and its mutation. It is mounted only when the dialog is
 * editable, so the read-only list call site never creates a write path (FR-78).
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
      <Text weight="semibold">Add contact</Text>
      {addError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The contact was not added</MessageBarTitle>
            {addError}
          </MessageBarBody>
        </MessageBar>
      ) : null}
      <div className={styles.addFields}>
        <Field label="Kind">
          <Dropdown
            value={kindLabel(kind)}
            selectedOptions={[kind]}
            onOptionSelect={(_, data) => {
              const next = CONTACT_GROUPS.find((group) => group.kind === data.optionValue);
              if (next) setKind(next.kind);
            }}
          >
            {CONTACT_GROUPS.map((group) => (
              <Option key={group.kind} value={group.kind}>
                {group.label}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <Field label="Value" hint="Normalised by kind; a duplicate returns 409.">
          <Input
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
        </Field>
        <Button
          appearance="primary"
          onClick={add}
          disabled={addMutation.isPending || value.trim().length === 0}
        >
          Add
        </Button>
      </div>
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
 * list dialog shows grouped values and their owner/linked status but cannot add
 * or remove them (FR-78, AC-47); the detail dialog is editable because opening
 * the member is already an explicit action (FR-29). All call sites share the
 * `['member', baseUrl, memberNo]` cache key.
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

                  <div className={styles.note}>
                    <ShieldLockRegular className={styles.noteIcon} aria-hidden />
                    <Text size={200}>{CONTACT_PRIVACY_NOTE}</Text>
                  </div>

                  {editable && actionError ? (
                    <MessageBar intent="error">
                      <MessageBarBody>
                        <MessageBarTitle>The contact was not changed</MessageBarTitle>
                        {actionError}
                      </MessageBarBody>
                    </MessageBar>
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
                    <div className={styles.contactGroups}>
                      {CONTACT_GROUPS.map((group) => {
                        const items = contacts
                          .filter((contact) => contact.kind === group.kind)
                          .slice()
                          .sort((left, right) => left.displayOrder - right.displayOrder);
                        if (items.length === 0) return null;

                        return (
                          <section
                            key={group.kind}
                            className={styles.contactGroup}
                            aria-label={group.label}
                          >
                            <div className={styles.contactGroupHeading}>
                              <h3 className={styles.contactGroupTitle}>{group.label}</h3>
                              {/*
                                The InfoLabel carries no text of its own: the heading holds the
                                group name, so Fluent's default `aria-labelledby` (which would name
                                the button after the group) resolves to nothing and the explicit
                                `aria-label` above is what the button announces (FR-78, FR-81).
                              */}
                              <InfoLabel
                                size="small"
                                info={{ children: CONTACT_GROUP_INFO }}
                                infoButton={{ 'aria-label': CONTACT_GROUP_INFO }}
                              />
                            </div>
                            {items.map((contact) => (
                              <div key={contact.id} className={styles.contactRow}>
                                <Text className={styles.contactValue}>{contact.value}</Text>
                                {contact.linked ? (
                                  <Text size={200} className={styles.contactOwner}>
                                    Linked · {contact.ownerMemberNo}
                                  </Text>
                                ) : (
                                  <div className={styles.contactActions}>
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
                              </div>
                            ))}
                          </section>
                        );
                      })}
                    </div>
                  )}

                  {editable && !detail.isPending && !detail.isError ? (
                    <ContactAddForm
                      key={open ? 'add-open' : 'add-closed'}
                      memberNo={memberNo}
                      onAdded={invalidate}
                    />
                  ) : null}
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
