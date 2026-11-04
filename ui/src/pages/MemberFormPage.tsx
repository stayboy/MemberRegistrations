import {
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
  Switch,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { DismissRegular, SaveRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  createMember,
  fetchMemberDetail,
  updateMember,
  type MemberDetailResult,
  type MemberInput,
  type MemberUpdateInput,
} from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';
import {
  GENDER_OPTIONS,
  createEmptyMemberForm,
  fromMemberDetail,
  isStaleConflictError,
  memberNoConflictMessage,
  mergeKeptValues,
  toCreatePayload,
  toUpdatePayload,
  validateMemberForm,
  type MemberFormErrors,
  type MemberFormValues,
} from '../format/member-form';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sectionHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  sectionTitle: {
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  note: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  helper: {
    color: tokens.colorNeutralForeground3,
  },
  state: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function MemberFormView({
  isEdit,
  memberNo,
  initial,
  initialEtag,
  onFetchLatest,
}: {
  isEdit: boolean;
  memberNo: string;
  initial: MemberFormValues;
  initialEtag: string | null;
  onFetchLatest?: () => Promise<MemberDetailResult>;
}) {
  const styles = useStyles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [values, setValues] = useState<MemberFormValues>(initial);
  const [original, setOriginal] = useState<MemberFormValues>(initial);
  const [currentEtag, setCurrentEtag] = useState<string | null>(initialEtag);
  const [errors, setErrors] = useState<MemberFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [keptWarning, setKeptWarning] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const createMutation = useMutation({
    mutationFn: (input: MemberInput) => createMember(baseUrl, token, input),
  });

  const updateMutation = useMutation({
    mutationFn: (variables: { input: MemberUpdateInput; etag: string | null }) =>
      updateMember(baseUrl, token, memberNo, variables.input, variables.etag),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending || syncing;

  function setField<Key extends keyof MemberFormValues>(
    key: Key,
    value: MemberFormValues[Key],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function submit(): void {
    if (isSaving) return;

    setFormError(null);
    setKeptWarning(false);

    const nextErrors = validateMemberForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (!isEdit) {
      createMutation.mutate(toCreatePayload(values), {
        onSuccess: (created) => {
          void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
          navigate(`/members/${encodeURIComponent(created.memberNo)}`);
        },
        onError: (error: unknown) => {
          if (isUnauthorized(error)) {
            void signOut();
            return;
          }
          const memberNoMessage = memberNoConflictMessage(error);
          if (memberNoMessage) {
            setErrors({ memberNo: memberNoMessage });
            return;
          }
          setFormError(errorMessage(error));
        },
      });
      return;
    }

    const payload = toUpdatePayload(values, original);
    if (Object.keys(payload).length === 0) {
      setFormError('No changes to save.');
      return;
    }

    updateMutation.mutate(
      { input: payload, etag: currentEtag },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
          void queryClient.invalidateQueries({ queryKey: ['member', baseUrl, memberNo] });
          navigate(`/members/${encodeURIComponent(memberNo)}`);
        },
        onError: (error: unknown) => {
          if (isUnauthorized(error)) {
            void signOut();
            return;
          }
          if (isStaleConflictError(error)) {
            setConflictOpen(true);
            return;
          }
          setFormError(errorMessage(error));
        },
      },
    );
  }

  /**
   * Copy-after-reload (FR-26). "Keep my changes" captures the form first, then
   * fetches the latest record and re-applies the kept values with the fresh
   * ETag, so the next save is a normal update rather than another 409.
   * "Reload latest" discards the kept values and starts from the server copy.
   */
  async function applyLatest(mode: 'keep' | 'reload'): Promise<void> {
    if (!onFetchLatest || syncing) return;

    setConflictOpen(false);
    setFormError(null);
    setKeptWarning(false);
    const kept = values;
    setSyncing(true);

    try {
      const latest = await onFetchLatest();
      const serverValues = fromMemberDetail(latest.member);
      setOriginal(serverValues);

      if (mode === 'keep') {
        const merged = mergeKeptValues(latest, kept);
        setValues(merged.values);
        setCurrentEtag(merged.etag);
        setKeptWarning(true);
      } else {
        setValues(serverValues);
        setCurrentEtag(latest.etag);
      }

      setErrors({});
    } catch (error) {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setFormError(errorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  function cancel(): void {
    if (isEdit) navigate(`/members/${encodeURIComponent(memberNo)}`);
    else navigate('/members');
  }

  const title = isEdit ? 'Edit member' : 'Add member';
  const description = isEdit
    ? 'Update the registration. Member number is permanent, and contacts are managed separately from the Contacts action.'
    : 'Create a registration. The API returns 201 with a Location header for the new member. Subscriptions and contacts are added after the member exists.';

  return (
    <PageFrame
      sectionId="members"
      title={title}
      submenu={isEdit ? 'Edit member' : 'Add member'}
      description={description}
      actions={
        <>
          <Button icon={<DismissRegular />} appearance="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button icon={<SaveRegular />} appearance="primary" onClick={submit} disabled={isSaving}>
            {isEdit ? 'Save changes' : 'Create member'}
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        noValidate
      >
        {formError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The member was not saved</MessageBarTitle>
              {formError}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {keptWarning ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>Your changes are still here</MessageBarTitle>
              The record changed on the server, so the latest version was loaded with a fresh
              version marker. Your values were kept; review the form and save again to update the
              server copy.
            </MessageBarBody>
          </MessageBar>
        ) : null}

        <section className={styles.section} aria-labelledby="member-identity-heading">
          <div className={styles.sectionHeader}>
            <h2 id="member-identity-heading" className={styles.sectionTitle}>
              Identity
            </h2>
            <Text size={200} className={styles.helper}>
              Member number is permanent and unique. Names are required; other names and alias are
              optional.
            </Text>
          </div>

          <div className={styles.grid}>
            <Field
              label="Member number"
              required
              validationState={errors.memberNo ? 'error' : 'none'}
              validationMessage={errors.memberNo}
              hint={isEdit ? undefined : '1–32 letters, digits, hyphens or underscores.'}
            >
              <Input
                value={values.memberNo}
                disabled={isEdit}
                onChange={(_, data) => setField('memberNo', data.value)}
              />
            </Field>

            <Field
              label="First name"
              required
              validationState={errors.firstName ? 'error' : 'none'}
              validationMessage={errors.firstName}
            >
              <Input
                value={values.firstName}
                onChange={(_, data) => setField('firstName', data.value)}
              />
            </Field>

            <Field
              label="Last name"
              required
              validationState={errors.lastName ? 'error' : 'none'}
              validationMessage={errors.lastName}
            >
              <Input
                value={values.lastName}
                onChange={(_, data) => setField('lastName', data.value)}
              />
            </Field>

            <Field
              label="Other names"
              validationState={errors.otherNames ? 'error' : 'none'}
              validationMessage={errors.otherNames}
            >
              <Input
                value={values.otherNames}
                onChange={(_, data) => setField('otherNames', data.value)}
              />
            </Field>

            <Field label="Gender">
              <Dropdown
                value={
                  GENDER_OPTIONS.find((option) => option.value === values.gender)?.label ??
                  'Undisclosed'
                }
                selectedOptions={[values.gender]}
                onOptionSelect={(_, data) => {
                  const next = GENDER_OPTIONS.find((option) => option.value === data.optionValue);
                  if (next) setField('gender', next.value);
                }}
              >
                {GENDER_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
            </Field>

            <Field
              label="Date of birth"
              validationState={errors.dob ? 'error' : 'none'}
              validationMessage={errors.dob}
              hint="UTC calendar date"
            >
              <Input
                type="date"
                value={values.dob}
                onChange={(_, data) => setField('dob', data.value)}
              />
            </Field>

            <Field
              label="Maiden name"
              validationState={errors.maidenName ? 'error' : 'none'}
              validationMessage={errors.maidenName}
            >
              <Input
                value={values.maidenName}
                onChange={(_, data) => setField('maidenName', data.value)}
              />
            </Field>

            <Field
              label="Alias"
              validationState={errors.alias ? 'error' : 'none'}
              validationMessage={errors.alias}
            >
              <Input value={values.alias} onChange={(_, data) => setField('alias', data.value)} />
            </Field>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="member-residence-heading">
          <div className={styles.sectionHeader}>
            <h2 id="member-residence-heading" className={styles.sectionTitle}>
              Contact and residence
            </h2>
            <Text size={200} className={styles.helper}>
              A contact value is normalised by kind and checked for uniqueness by the API.
            </Text>
          </div>

          <div className={styles.grid}>
            <Field
              label="Place of residence"
              validationState={errors.placeOfResidence ? 'error' : 'none'}
              validationMessage={errors.placeOfResidence}
            >
              <Input
                value={values.placeOfResidence}
                onChange={(_, data) => setField('placeOfResidence', data.value)}
              />
            </Field>

            <Field
              label="Address line"
              validationState={errors.addressLine ? 'error' : 'none'}
              validationMessage={errors.addressLine}
            >
              <Input
                value={values.addressLine}
                onChange={(_, data) => setField('addressLine', data.value)}
              />
            </Field>
          </div>

          <div className={styles.note}>
            <Text size={200}>
              Contacts are not part of this form, so contact values never appear inline in the
              member grid.{' '}
              {isEdit
                ? 'Use the Contacts action on the member record.'
                : 'Add contacts from the member record after creation.'}
            </Text>
            {isEdit ? (
              <Link to={`/members/${encodeURIComponent(memberNo)}`}>Open member record</Link>
            ) : null}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="member-church-heading">
          <div className={styles.sectionHeader}>
            <h2 id="member-church-heading" className={styles.sectionTitle}>
              Church
            </h2>
            <Text size={200} className={styles.helper}>
              Presbyter is a flag, not a ministry: it makes the member eligible to shepherd.
              Ministries are assigned by code on the member record.
            </Text>
          </div>

          <div className={styles.grid}>
            <Field
              label="Joined on"
              validationState={errors.joinedOn ? 'error' : 'none'}
              validationMessage={errors.joinedOn}
              hint="Defaults to today (UTC)"
            >
              <Input
                type="date"
                value={values.joinedOn}
                onChange={(_, data) => setField('joinedOn', data.value)}
              />
            </Field>

            <Field label="Presbyter" hint="Eligible to hold a shepherding roster">
              <Switch
                checked={values.isPresbyter}
                onChange={(_, data) => setField('isPresbyter', data.checked)}
                label={values.isPresbyter ? 'Yes' : 'No'}
              />
            </Field>
          </div>

          <Text size={200} className={styles.helper}>
            The API validates member-number and contact uniqueness. A duplicate member number
            returns 409 and is shown against the member-number field. Subscriptions are added from
            the member&apos;s Subscriptions view after creation.
          </Text>
        </section>
      </form>

      <Dialog
        open={conflictOpen}
        onOpenChange={(_, data) => {
          if (!data.open) setConflictOpen(false);
        }}
      >
        <DialogSurface aria-label="The member changed on the server">
          <DialogBody>
            <DialogTitle>This member changed on the server</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <Text>
                Your edit was not saved, because someone else changed this member after you opened
                it. Nothing was overwritten.
              </Text>
              <Text size={200} className={styles.helper}>
                Reload the latest version to start from the current record, or keep your changes on
                top of the latest version. Either way the next save uses the current server version.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => {
                  void applyLatest('keep');
                }}
                disabled={syncing}
              >
                Keep my changes
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  void applyLatest('reload');
                }}
                disabled={syncing}
              >
                Reload latest
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </PageFrame>
  );
}

export function MemberFormPage() {
  const styles = useStyles();
  const { memberNo: routeMemberNo } = useParams<{ memberNo?: string }>();
  const isEdit = Boolean(routeMemberNo);
  const memberNo = routeMemberNo ?? '';
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const detailQuery = useQuery({
    queryKey: ['member', baseUrl, memberNo],
    queryFn: ({ signal }) => fetchMemberDetail(baseUrl, token, memberNo, signal),
    enabled: isEdit && Boolean(token),
  });

  useEffect(() => {
    if (isUnauthorized(detailQuery.error)) void signOut();
  }, [detailQuery.error, signOut]);

  /** Fetches the current server copy; the conflict dialog applies it (FR-26). */
  async function loadLatest(): Promise<MemberDetailResult> {
    const result = await detailQuery.refetch();
    if (result.isError) {
      throw result.error ?? new Error('The latest member version could not be loaded.');
    }
    if (!result.data) {
      throw new Error('The latest member version could not be loaded.');
    }
    return result.data;
  }

  if (!isEdit) {
    return (
      <MemberFormView
        key="new-member"
        isEdit={false}
        memberNo=""
        initial={createEmptyMemberForm()}
        initialEtag={null}
      />
    );
  }

  if (detailQuery.isPending) {
    return (
      <PageFrame sectionId="members" title="Edit member" submenu="Edit member">
        <div className={styles.state}>
          <Spinner label="Loading member…" />
        </div>
      </PageFrame>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <PageFrame sectionId="members" title="Edit member" submenu="Edit member">
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The member could not be loaded</MessageBarTitle>
            {errorMessage(detailQuery.error)}
            <Button
              size="small"
              appearance="transparent"
              onClick={() => {
                void detailQuery.refetch();
              }}
            >
              Retry
            </Button>
          </MessageBarBody>
        </MessageBar>
        <Button as="a" href="#/members" appearance="secondary">
          Back to members
        </Button>
      </PageFrame>
    );
  }

  const { member, etag } = detailQuery.data;

  return (
    <MemberFormView
      key={member.memberNo}
      isEdit
      memberNo={member.memberNo}
      initial={fromMemberDetail(member)}
      initialEtag={etag}
      onFetchLatest={loadLatest}
    />
  );
}
