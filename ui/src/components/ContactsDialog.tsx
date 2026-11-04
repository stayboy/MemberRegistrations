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
import { DeleteRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, isUnauthorized } from '../api/errors';
import {
  addContact,
  fetchMemberDetail,
  removeContact,
  type ContactInput,
  type ContactKind,
  type MemberContact,
} from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from './ConfirmDialog';
import { memberInitials, memberName } from '../format/member';

const CONTACT_GROUPS: readonly { kind: ContactKind; label: string }[] = [
  { kind: 'phone', label: 'Phone' },
  { kind: 'email', label: 'Email' },
  { kind: 'whatsapp', label: 'WhatsApp' },
];

const useStyles = makeStyles({
  dialogSurface: {
    maxWidth: '620px',
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
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalM,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
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
  contactRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
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
  isPresbyter: boolean;
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
 * Call sites: MembersPage (contacts action, read-only) and MemberDetailPage
 * (contacts action, editable). The list dialog shows grouped values and their
 * owner/linked status but cannot add or remove them (FR-78, AC-47); the detail
 * dialog is editable because opening the member is already an explicit action
 * (FR-29). Both call sites share the `['member', baseUrl, memberNo]` cache key.
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
                      name={memberName(member)}
                      initials={memberInitials(member)}
                      color="colorful"
                      size={40}
                    />
                    <div>
                      <div className={styles.nameRow}>
                        <Text weight="semibold">{memberName(member)}</Text>
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
                    <Text size={200}>
                      Contact values are shown only after this explicit action.
                    </Text>
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
                            <Text weight="semibold">{group.label}</Text>
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
