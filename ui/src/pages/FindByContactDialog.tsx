import {
  Avatar,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { SearchRegular } from '@fluentui/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, isUnauthorized } from '../api/errors';
import { listMembers, type MemberSummary } from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { ContactsDialog } from '../components/ContactsDialog';
import { contactLabel, memberInitials, memberName } from '../format/member';

const MIN_CONTACT_LENGTH = 3;

const useStyles = makeStyles({
  dialogSurface: {
    maxWidth: '720px',
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  searchRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalM,
  },
  field: {
    flex: 1,
  },
  note: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalM,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minWidth: '220px',
  },
  tableWrap: {
    overflowX: 'auto',
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/**
 * Find by contact (FR-79, AC-48). The entered value lives only in this
 * component's state: it is never written to the URL or web storage, and closing
 * the dialog clears both the input and the cached result. The main member search
 * remains name/number only.
 */
export function FindByContactDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const queryClient = useQueryClient();

  const [contact, setContact] = useState('');
  const [submittedContact, setSubmittedContact] = useState('');
  const [contactsFor, setContactsFor] = useState<MemberSummary | null>(null);

  const trimmed = contact.trim();
  const canSearch = trimmed.length >= MIN_CONTACT_LENGTH;

  const searchQuery = useQuery({
    queryKey: ['members', baseUrl, 'contact-search', submittedContact],
    queryFn: ({ signal }) =>
      listMembers(baseUrl, token, {
        contact: submittedContact,
        includeSubscriptions: false,
        limit: 25,
        signal,
      }),
    enabled: open && submittedContact.length >= MIN_CONTACT_LENGTH && Boolean(token),
  });

  useEffect(() => {
    if (isUnauthorized(searchQuery.error)) void signOut();
  }, [searchQuery.error, signOut]);

  function close(): void {
    setContact('');
    setSubmittedContact('');
    setContactsFor(null);
    queryClient.removeQueries({ queryKey: ['members', baseUrl, 'contact-search'] });
    onOpenChange(false);
  }

  function search(): void {
    if (!canSearch) return;
    if (trimmed === submittedContact) {
      void searchQuery.refetch();
      return;
    }
    setSubmittedContact(trimmed);
  }

  const results = searchQuery.data?.items ?? [];
  const notFound = searchQuery.error instanceof ApiError && searchQuery.error.status === 404;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(_, data) => {
          if (!data.open) close();
        }}
      >
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle>Find by contact</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <div className={styles.note}>
                <Text size={200}>
                  Search by a contact value only. The main search covers name or member number; this
                  value is not saved, added to the URL or written to browser storage.
                </Text>
              </div>

              <div className={styles.searchRow}>
                <Field
                  className={styles.field}
                  label="Contact value"
                  hint="A phone number, WhatsApp number or email address (at least 3 characters)."
                >
                  <Input
                    value={contact}
                    placeholder="Phone number or email address"
                    contentBefore={<SearchRegular />}
                    onChange={(_, data) => setContact(data.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        search();
                      }
                    }}
                  />
                </Field>
                <Button
                  appearance="primary"
                  icon={<SearchRegular />}
                  onClick={search}
                  disabled={!canSearch || searchQuery.isFetching}
                >
                  Search
                </Button>
              </div>

              {!canSearch && trimmed.length > 0 ? (
                <Text size={200} className={styles.muted}>
                  Enter at least {MIN_CONTACT_LENGTH} characters.
                </Text>
              ) : null}

              {searchQuery.isPending && submittedContact ? (
                <Spinner label="Searching contacts…" />
              ) : searchQuery.isError ? (
                <MessageBar intent="error">
                  <MessageBarBody>
                    <MessageBarTitle>
                      {notFound ? 'No member matches that contact' : 'The search failed'}
                    </MessageBarTitle>
                    {errorMessage(searchQuery.error)}
                    <Button
                      size="small"
                      appearance="transparent"
                      onClick={() => {
                        void searchQuery.refetch();
                      }}
                    >
                      Retry
                    </Button>
                  </MessageBarBody>
                </MessageBar>
              ) : submittedContact && results.length === 0 ? (
                <MessageBar intent="info">
                  <MessageBarBody>
                    <MessageBarTitle>No member has that contact value</MessageBarTitle>
                    Check the number or address and try again. Contact lookup searches stored
                    contact values only.
                  </MessageBarBody>
                </MessageBar>
              ) : results.length > 0 ? (
                <div className={styles.tableWrap}>
                  <Table size="small" aria-label="Contact search results">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Member</TableHeaderCell>
                        <TableHeaderCell>Member no.</TableHeaderCell>
                        <TableHeaderCell>Contacts</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((member) => {
                        const name = memberName(member);
                        return (
                          <TableRow key={member.memberNo}>
                            <TableCell>
                              <div className={styles.identity}>
                                <Avatar
                                  name={name}
                                  initials={memberInitials(member)}
                                  color="colorful"
                                  size={28}
                                />
                                <Text weight="semibold">{name}</Text>
                              </div>
                            </TableCell>
                            <TableCell>{member.memberNo}</TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                appearance="transparent"
                                aria-label={`${contactLabel(member.contactCount)} for ${name}`}
                                onClick={() => setContactsFor(member)}
                              >
                                {contactLabel(member.contactCount)}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={close}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <ContactsDialog
        member={contactsFor}
        open={contactsFor !== null}
        onOpenChange={(next) => {
          if (!next) setContactsFor(null);
        }}
      />
    </>
  );
}
