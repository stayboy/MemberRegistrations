import {
  Button,
  Combobox,
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
  Tag,
  TagGroup,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { DismissRegular, OpenRegular, SaveRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  createMember,
  fetchMemberDetail,
  listMinistries,
  subscribeMemberProduct,
  updateMember,
  type MemberDetailResult,
  type MemberInput,
  type MemberUpdateInput,
  type SubscribeProductInput,
} from '../api/members';
import { listWelfareProducts, type WelfareProduct } from '../api/welfare';
import { useSession } from '../auth/SessionProvider';
import { PageFrame } from '../components/PageFrame';
import {
  GENDER_OPTIONS,
  contactConflictErrors,
  createEmptyMemberForm,
  fromMemberDetail,
  isStaleConflictError,
  memberNoConflictMessage,
  mergeKeptValues,
  toCreatePayload,
  toSubscriptionInput,
  toUpdatePayload,
  validateMemberForm,
  validateSubscriptionDraft,
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
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
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
  /** The member exists but its subscription call failed, so the form must not offer a create. */
  const [createdMemberNo, setCreatedMemberNo] = useState<string | null>(null);
  const [subscriptionFailure, setSubscriptionFailure] = useState<string | null>(null);

  // FR-71: the ministries control needs the reference list before it can be used.
  const ministriesQuery = useQuery({
    queryKey: ['ministries', baseUrl],
    queryFn: ({ signal }) => listMinistries(baseUrl, token, signal),
    enabled: Boolean(token) && !isEdit,
  });

  // The product list is the only read a subscription needs before the member exists.
  const productsQuery = useQuery({
    queryKey: ['member-form', baseUrl, 'subscription-products'],
    queryFn: ({ signal }) => listWelfareProducts(baseUrl, token, false, signal),
    enabled: Boolean(token) && !isEdit,
  });

  useEffect(() => {
    if (isUnauthorized(ministriesQuery.error) || isUnauthorized(productsQuery.error))
      void signOut();
  }, [ministriesQuery.error, productsQuery.error, signOut]);

  const createMutation = useMutation({
    mutationFn: (input: MemberInput) => createMember(baseUrl, token, input),
  });

  // FR-29a: the create contract carries no subscription, so it is a second call
  // issued after the member exists and before the navigation happens.
  const subscribeMutation = useMutation({
    mutationFn: (variables: { memberNo: string; input: SubscribeProductInput }) =>
      subscribeMemberProduct(baseUrl, token, variables.memberNo, variables.input),
  });

  const updateMutation = useMutation({
    mutationFn: (variables: { input: MemberUpdateInput; etag: string | null }) =>
      updateMember(baseUrl, token, memberNo, variables.input, variables.etag),
  });

  const isSaving =
    createMutation.isPending || updateMutation.isPending || subscribeMutation.isPending || syncing;

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
    // A created member means the only remaining verb is "Open member record": a
    // second create would 409 on the member number (FR-29a).
    if (isSaving || createdMemberNo) return;

    setFormError(null);
    setKeptWarning(false);

    const chosenProduct = products.find(
      (product) => product.code === values.subscriptionProductCode,
    );
    const nextErrors = {
      ...validateMemberForm(values),
      ...validateSubscriptionDraft(values, chosenProduct?.paymentMode ?? null),
    };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (!isEdit) {
      const subscription = toSubscriptionInput(values);
      createMutation.mutate(toCreatePayload(values), {
        onSuccess: (created) => {
          void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
          if (!subscription) {
            navigate(`/members/${encodeURIComponent(created.memberNo)}`);
            return;
          }
          subscribeMutation.mutate(
            { memberNo: created.memberNo, input: subscription },
            {
              onSuccess: () => {
                void queryClient.invalidateQueries({
                  queryKey: ['member', baseUrl, created.memberNo],
                });
                navigate(`/members/${encodeURIComponent(created.memberNo)}`);
              },
              onError: (error: unknown) => {
                if (isUnauthorized(error)) {
                  void signOut();
                  return;
                }
                // The member exists; only the subscription failed. Name the failure,
                // keep the member, and never claim the registration failed (AC-52).
                setCreatedMemberNo(created.memberNo);
                setSubscriptionFailure(errorMessage(error));
              },
            },
          );
        },
        onError: (error: unknown) => {
          if (isUnauthorized(error)) {
            void signOut();
            return;
          }
          // FR-29a: the create is atomic, so a contact value another member already owns
          // returns 409 against that field; every other entered value stays in the form.
          const contactErrors = contactConflictErrors(error, values);
          if (contactErrors) {
            setErrors(contactErrors);
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
    : 'Create a registration. The API returns 201 with a Location header for the new member. Contacts and ministries travel in that one request; a chosen subscription is added by a second call once the member exists.';

  const activeMinistries = (ministriesQuery.data ?? []).filter((ministry) => ministry.active);
  const products = (productsQuery.data ?? []).filter((product) => product.active);
  const selectedProduct: WelfareProduct | undefined = products.find(
    (product) => product.code === values.subscriptionProductCode,
  );
  const ministryName = (code: string): string =>
    activeMinistries.find((ministry) => ministry.code === code)?.name ?? code;
  const paidByLabel =
    values.subscriptionPaidBy === 'member'
      ? 'Member'
      : values.subscriptionPaidBy === 'church'
        ? 'Church'
        : 'Choose who pays';

  return (
    <PageFrame
      sectionId="members"
      title={title}
      submenu={isEdit ? 'Edit member' : 'Add member'}
      description={description}
      controls={
        createdMemberNo ? (
          // AC-52: the member exists, so the only primary action is opening it. A second
          // create would 409 on the member number that was just registered.
          <Button
            icon={<OpenRegular />}
            appearance="primary"
            onClick={() => navigate(`/members/${encodeURIComponent(createdMemberNo)}`)}
          >
            Open member record
          </Button>
        ) : (
          <>
            <Button icon={<DismissRegular />} appearance="secondary" onClick={cancel}>
              Cancel
            </Button>
            <Button
              icon={<SaveRegular />}
              appearance="primary"
              onClick={submit}
              disabled={isSaving}
            >
              {isEdit ? 'Save changes' : 'Create member'}
            </Button>
          </>
        )
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

        {createdMemberNo && subscriptionFailure ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>
                The member was created, but its subscription was not added
              </MessageBarTitle>
              {subscriptionFailure} The subscription can still be added from the member&apos;s
              Subscriptions view.
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
              Residence
            </h2>
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
              {isEdit
                ? 'Contacts are not part of this form, so contact values never appear inline in the member grid. Use the Contacts action on the member record.'
                : 'Residence and address are optional and are part of the create payload. Contacts have their own section below.'}
            </Text>
            {isEdit ? (
              <Link to={`/members/${encodeURIComponent(memberNo)}`}>Open member record</Link>
            ) : null}
          </div>
        </section>

        {/* FR-29a: contacts are entered before the member exists, in the same create request.
            The edit form has none: contacts are managed on the member record (FR-29). */}
        {isEdit ? null : (
          <section className={styles.section} aria-labelledby="member-contacts-heading">
            <div className={styles.sectionHeader}>
              <h2 id="member-contacts-heading" className={styles.sectionTitle}>
                Contacts
              </h2>
              <Text size={200} className={styles.helper}>
                Optional, and sent in the same <code>POST /v1/members</code> body. A value already
                owned by another member returns 409 against that field and keeps this form open.
              </Text>
            </div>

            <div className={styles.grid}>
              <Field
                label="Phone"
                validationState={errors.phone ? 'error' : 'none'}
                validationMessage={errors.phone}
              >
                <Input value={values.phone} onChange={(_, data) => setField('phone', data.value)} />
              </Field>

              <Field
                label="Email"
                validationState={errors.email ? 'error' : 'none'}
                validationMessage={errors.email}
              >
                <Input value={values.email} onChange={(_, data) => setField('email', data.value)} />
              </Field>

              <Field
                label="WhatsApp"
                validationState={errors.whatsapp ? 'error' : 'none'}
                validationMessage={errors.whatsapp}
              >
                <Input
                  value={values.whatsapp}
                  onChange={(_, data) => setField('whatsapp', data.value)}
                />
              </Field>
            </div>
          </section>
        )}

        <section className={styles.section} aria-labelledby="member-church-heading">
          <div className={styles.sectionHeader}>
            <h2 id="member-church-heading" className={styles.sectionTitle}>
              Church
            </h2>
            <Text size={200} className={styles.helper}>
              {isEdit
                ? 'Presbyter is a flag, not a ministry: it makes the member eligible to shepherd. Ministries are assigned by code on the member record.'
                : 'Presbyter is a flag, not a ministry: it makes the member eligible to shepherd. Chosen ministries travel in the same create request.'}
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

            {/* FR-29: the four membership facts, on create and edit. A blank field
                sends `null`; the assembly join date has no default. */}
            <Field
              label="Assembly joined"
              validationState={errors.assemblyJoinedOn ? 'error' : 'none'}
              validationMessage={errors.assemblyJoinedOn}
              hint="UTC calendar date"
            >
              <Input
                type="date"
                value={values.assemblyJoinedOn}
                onChange={(_, data) => setField('assemblyJoinedOn', data.value)}
              />
            </Field>

            <Field
              label="Came from"
              validationState={errors.cameFrom ? 'error' : 'none'}
              validationMessage={errors.cameFrom}
            >
              <Input
                value={values.cameFrom}
                onChange={(_, data) => setField('cameFrom', data.value)}
              />
            </Field>

            <Field
              label="Moved out"
              validationState={errors.movedOutOn ? 'error' : 'none'}
              validationMessage={errors.movedOutOn}
              hint="UTC calendar date"
            >
              <Input
                type="date"
                value={values.movedOutOn}
                onChange={(_, data) => setField('movedOutOn', data.value)}
              />
            </Field>

            <Field
              label="Moved to"
              validationState={errors.movedToAssembly ? 'error' : 'none'}
              validationMessage={errors.movedToAssembly}
            >
              <Input
                value={values.movedToAssembly}
                onChange={(_, data) => setField('movedToAssembly', data.value)}
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

          {/* FR-71: ministries are collected on the create form and ride the same POST.
              The edit form keeps its own Ministries surface on the member record (FR-29). */}
          {isEdit ? null : (
            <>
              <div className={styles.grid}>
                <Field
                  label="Ministries"
                  hint="Optional. Chosen codes are sent in the create request."
                >
                  <Combobox
                    multiselect
                    selectedOptions={[...values.ministries]}
                    placeholder={
                      ministriesQuery.isPending ? 'Loading ministries…' : 'Select ministries'
                    }
                    disabled={ministriesQuery.isPending || activeMinistries.length === 0}
                    onOptionSelect={(_, data) => setField('ministries', data.selectedOptions)}
                  >
                    {activeMinistries.map((ministry) => (
                      <Option
                        key={ministry.code}
                        value={ministry.code}
                        text={`${ministry.code} · ${ministry.name}`}
                      >
                        {ministry.code} · {ministry.name}
                      </Option>
                    ))}
                  </Combobox>
                </Field>
              </div>

              {values.ministries.length > 0 ? (
                <TagGroup aria-label="Chosen ministries" className={styles.chips}>
                  {values.ministries.map((code) => (
                    <Tag key={code} size="small" appearance="outline">
                      {code} · {ministryName(code)}
                    </Tag>
                  ))}
                </TagGroup>
              ) : null}

              {ministriesQuery.isError ? (
                <MessageBar intent="warning">
                  <MessageBarBody>
                    <MessageBarTitle>The ministry list is unavailable</MessageBarTitle>
                    The registration can still be created; ministries are assigned from the member
                    record afterwards.
                  </MessageBarBody>
                </MessageBar>
              ) : null}
            </>
          )}

          <Text size={200} className={styles.helper}>
            {isEdit
              ? "The API validates member-number and contact uniqueness. A duplicate member number returns 409 and is shown against the member-number field. Subscriptions are added from the member's Subscriptions view after creation."
              : 'The API validates member-number and contact uniqueness. A duplicate member number returns 409 and is shown against the member-number field; so does a contact value another member already owns, shown against that field.'}
          </Text>
        </section>

        {/* FR-29a: one optional subscription, added by a second call after the member
            exists. The edit form has none - subscriptions are managed on the member
            record's Subscriptions tab. */}
        {isEdit ? null : (
          <section className={styles.section} aria-labelledby="member-subscription-heading">
            <div className={styles.sectionHeader}>
              <h2 id="member-subscription-heading" className={styles.sectionTitle}>
                Subscription
              </h2>
              <Text size={200} className={styles.helper}>
                Optional, and at most one. The create request carries no subscription, so a chosen
                one is added by a second call straight after the member exists. If that call fails
                the member still exists, and the subscription can be added from the member&apos;s
                Subscriptions view.
              </Text>
            </div>

            <div className={styles.grid}>
              <Field
                label="Product"
                hint="Add a subscription now, or leave it to the member record."
              >
                <Dropdown
                  value={
                    selectedProduct
                      ? `${selectedProduct.code} · ${selectedProduct.name}`
                      : 'No subscription'
                  }
                  selectedOptions={[values.subscriptionProductCode]}
                  disabled={productsQuery.isPending}
                  onOptionSelect={(_, data) => {
                    setField('subscriptionProductCode', data.optionValue ?? '');
                    setField('subscriptionPaidBy', '');
                  }}
                >
                  <Option value="">No subscription</Option>
                  {products.map((product) => (
                    <Option
                      key={product.code}
                      value={product.code}
                      text={`${product.code} · ${product.name}`}
                    >
                      {product.code} · {product.name}
                    </Option>
                  ))}
                </Dropdown>
              </Field>

              {selectedProduct?.paymentMode === 'either' ? (
                <Field
                  label="Paid by"
                  required
                  validationState={errors.subscriptionPaidBy ? 'error' : 'none'}
                  validationMessage={errors.subscriptionPaidBy}
                  hint="This product can be paid by the member or the church."
                >
                  <Dropdown
                    value={paidByLabel}
                    selectedOptions={values.subscriptionPaidBy ? [values.subscriptionPaidBy] : []}
                    onOptionSelect={(_, data) => {
                      const paidBy = data.optionValue;
                      if (paidBy === 'member' || paidBy === 'church') {
                        setField('subscriptionPaidBy', paidBy);
                      }
                    }}
                  >
                    <Option value="member" text="Member">
                      Member
                    </Option>
                    <Option value="church" text="Church">
                      Church
                    </Option>
                  </Dropdown>
                </Field>
              ) : null}
            </div>

            {productsQuery.isError ? (
              <MessageBar intent="warning">
                <MessageBarBody>
                  <MessageBarTitle>The product list is unavailable</MessageBarTitle>
                  The registration can still be created; a subscription can be added from the member
                  record afterwards.
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </section>
        )}
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
