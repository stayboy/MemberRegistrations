import {
  Badge,
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
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { CheckmarkRegular, OpenRegular, SaveRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  addMemberMinistry,
  createMember,
  fetchMemberDetail,
  listGuardianCandidates,
  listMinistries,
  listPresbyterTitles,
  removeMemberMinistry,
  subscribeMemberProduct,
  updateMember,
  type MemberDetail,
  type MemberDetailResult,
  type MemberInput,
  type MemberUpdateInput,
  type SubscribeProductInput,
} from '../api/members';
import { assignMember, listOfficers } from '../api/shepherding';
import { listWelfareProducts, type WelfareProduct } from '../api/welfare';
import { useSession } from '../auth/SessionProvider';
import { AssignShepherdDialog } from '../components/AssignShepherdDialog';
import { ContactsDialog } from '../components/ContactsDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageFrame } from '../components/PageFrame';
import { memberLabelFromName } from '../format/member';
import {
  CREATE_CONTACT_FIELDS,
  GENDER_OPTIONS,
  MEMBER_FORM_STEP_IDS,
  MEMBER_FORM_STEP_LABELS,
  contactConflictErrors,
  createEmptyMemberForm,
  fromMemberDetail,
  isStaleConflictError,
  memberNoConflictMessage,
  mergeKeptValues,
  titleForbiddenByGender,
  titleOptionsForGender,
  toCreatePayload,
  toShepherdInput,
  toSubscriptionInput,
  toUpdatePayload,
  utcToday,
  validateMemberForm,
  validateMemberStep,
  validateReachability,
  validateSubscriptionDraft,
  type MemberFormErrors,
  type MemberFormStep,
  type MemberFormValues,
} from '../format/member-form';
import { MemberFormRelationshipsSection } from './MemberFormRelationshipsSection';

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
  panelList: {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  panelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    minHeight: '40px',
    paddingBlock: tokens.spacingVerticalS,
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke2),
  },
  panelRowInline: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  // MR-48: a horizontal stepper under the breadcrumb. Numbered bubbles with connectors;
  // the labels hide below 600 px and the bubbles stay, so the accessible name is carried
  // by the button's aria-label.
  stepper: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    width: '100%',
    minWidth: 0,
    paddingBlock: tokens.spacingVerticalS,
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke2),
  },
  stepList: {
    display: 'flex',
    alignItems: 'flex-start',
    margin: 0,
    padding: 0,
    listStyleType: 'none',
    width: '100%',
    minWidth: 0,
    overflowX: 'auto',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'flex-start',
    flex: '1 1 0',
    minWidth: 0,
  },
  stepButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
    paddingInline: tokens.spacingHorizontalXS,
  },
  stepButtonCurrent: {
    color: tokens.colorBrandForeground1,
  },
  stepBubble: {
    display: 'grid',
    placeItems: 'center',
    width: '28px',
    height: '28px',
    flexShrink: 0,
    borderRadius: '50%',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  // The current step's bubble is brand-coloured; a completed one is brand-tinted.
  stepBubbleCurrent: {
    backgroundColor: tokens.colorBrandBackground,
    ...shorthands.borderColor(tokens.colorBrandBackground),
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepBubbleCompleted: {
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.borderColor(tokens.colorBrandBackground2),
    color: tokens.colorBrandForeground1,
  },
  stepNumber: {
    lineHeight: 1,
  },
  stepLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    '@media (max-width: 599px)': {
      display: 'none',
    },
  },
  stepConnector: {
    flexGrow: 1,
    alignSelf: 'flex-start',
    height: '2px',
    marginTop: '13px',
    marginInline: tokens.spacingHorizontalXS,
    backgroundColor: tokens.colorNeutralStroke1,
  },

  stepNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    // MR-48: the mock's `flow-nav` draws a hairline above the run, with a 14 px gap before
    // the buttons.
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
    paddingBlockStart: '14px',
  },
  stepBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minWidth: 0,
  },
  review: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  reviewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalL,
  },
  reviewItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/** The line under the step title, per step and per mode (the mock's description). */
const STEP_DESCRIPTION: Record<'create' | 'edit', Record<MemberFormStep, string>> = {
  create: {
    person:
      "The person, where they live and how to reach them. A phone or WhatsApp number is the member's USSD identity and the number a verification code goes to.",
    church:
      'The membership facts, the presbyter title and card, the ministries and the shepherd. Ministries travel with the member; the shepherd is assigned straight afterwards.',
    relationships:
      'This member has no contact of their own, so a guardian is required. The guardian is how the register reaches them.',
    review: 'Check the registration before it is created. Nothing has been written yet.',
  },
  edit: {
    person:
      'The person, where they live and how to reach them. These fields save with the form; contacts are written to the record as you use them.',
    church:
      'The membership facts save with the form. Ministries and the shepherd are written to the record as you use them.',
    relationships:
      'The links the record keeps. Guardian and relationship changes are written to the record as you use them.',
    review: 'This page saves the fields below. Everything else on the record stays as it is.',
  },
};

/**
 * The form's step rail (MR-48): a labelled `nav` around an ordered list, directly under
 * the breadcrumb. Each step is a Fluent `Button` whose visible part is a numbered bubble
 * plus its label; the bubble and the connector are decorative, so the button's accessible
 * name is the step itself. Completed steps show a check, the current step is
 * brand-coloured and future steps are neutral. Fluent v9.75.1 ships no Wizard or
 * Stepper, so this composes `nav`, an `<ol>` and `Button`.
 */
function MemberFormStepper({
  steps,
  activeIndex,
  isEnabled,
  onSelect,
}: {
  steps: readonly MemberFormStep[];
  activeIndex: number;
  isEnabled: (index: number) => boolean;
  onSelect: (step: MemberFormStep) => void;
}) {
  const styles = useStyles();

  return (
    <nav className={styles.stepper} aria-label="Registration steps" data-testid="member-form-rail">
      <ol className={styles.stepList}>
        {steps.map((step, index) => {
          const isCurrent = index === activeIndex;
          const isComplete = index < activeIndex;
          return (
            <li key={step} className={styles.stepItem}>
              <Button
                appearance="transparent"
                className={mergeClasses(styles.stepButton, isCurrent && styles.stepButtonCurrent)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Step ${index + 1}: ${MEMBER_FORM_STEP_LABELS[step]}`}
                disabled={!isEnabled(index)}
                onClick={() => onSelect(step)}
                data-state={isComplete ? 'completed' : isCurrent ? 'current' : 'future'}
                data-testid={`member-form-step-${step}`}
              >
                <span
                  aria-hidden="true"
                  className={mergeClasses(
                    styles.stepBubble,
                    isComplete
                      ? styles.stepBubbleCompleted
                      : isCurrent
                        ? styles.stepBubbleCurrent
                        : undefined,
                  )}
                  data-testid="step-bubble"
                >
                  {isComplete ? (
                    <CheckmarkRegular />
                  ) : (
                    <span className={styles.stepNumber}>{index + 1}</span>
                  )}
                </span>
                <span className={styles.stepLabel} data-testid="step-label">
                  {MEMBER_FORM_STEP_LABELS[step]}
                </span>
              </Button>
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className={styles.stepConnector} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <div className={styles.reviewItem}>
      <Text size={200} className={styles.helper}>
        {label}
      </Text>
      <Text>{value}</Text>
    </div>
  );
}

function SavedAsYouGo() {
  return (
    <Badge appearance="tint" color="informative" size="small" data-testid="saved-as-you-go">
      Saved as you go
    </Badge>
  );
}

function MemberFormView({
  isEdit,
  memberNo,
  member,
  initial,
  initialEtag,
  onFetchLatest,
}: {
  isEdit: boolean;
  memberNo: string;
  /** Edit only: the loaded record, for the read-only sections that own their own writes. */
  member?: MemberDetail;
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
  /**
   * The member number the guardian-candidate query is keyed on. On create the number is
   * typed on the first step and the API excludes that member's descendants, so the query
   * waits for a commit - the field's blur or leaving the step - instead of running on
   * every keystroke.
   */
  const [committedMemberNo, setCommittedMemberNo] = useState(isEdit ? memberNo : '');
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
  /** MR-9: the same post-create failure shape for the shepherd assignment. */
  const [shepherdFailure, setShepherdFailure] = useState<string | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [titleNote, setTitleNote] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [removeMinistryCode, setRemoveMinistryCode] = useState<string | null>(null);
  const [addMinistryCode, setAddMinistryCode] = useState('');

  // FR-71: the ministries control needs the reference list before it can be used.
  const ministriesQuery = useQuery({
    queryKey: ['ministries', baseUrl],
    queryFn: ({ signal }) => listMinistries(baseUrl, token, signal),
    enabled: Boolean(token),
  });

  // MR-12: the title picker reads the reference list; nothing is hard-coded here.
  const titlesQuery = useQuery({
    queryKey: ['presbyter-titles', baseUrl],
    queryFn: ({ signal }) => listPresbyterTitles(baseUrl, token, signal),
    enabled: Boolean(token),
  });

  // MR-9: the create form offers the active officers the shepherding area lists.
  const officersQuery = useQuery({
    queryKey: ['shepherding', baseUrl, 'officers', 'member-form'],
    queryFn: ({ signal }) => listOfficers(baseUrl, token, { from: '', to: '' }, signal),
    enabled: Boolean(token) && !isEdit,
  });

  // The review names the guardian it will link, so the same candidate list the
  // Relationships step reads is also read here (one cache entry, one request).
  const guardianCandidatesQuery = useQuery({
    queryKey: ['member-form', baseUrl, 'guardians', isEdit ? memberNo : committedMemberNo],
    queryFn: ({ signal }) =>
      listGuardianCandidates(
        baseUrl,
        token,
        isEdit ? memberNo : committedMemberNo || undefined,
        signal,
      ),
    enabled: Boolean(token) && !isEdit && committedMemberNo.length > 0,
  });

  // The product list is the only read a subscription needs before the member exists.
  const productsQuery = useQuery({
    queryKey: ['member-form', baseUrl, 'subscription-products'],
    queryFn: ({ signal }) => listWelfareProducts(baseUrl, token, false, signal),
    enabled: Boolean(token) && !isEdit,
  });

  useEffect(() => {
    if (
      isUnauthorized(ministriesQuery.error) ||
      isUnauthorized(productsQuery.error) ||
      isUnauthorized(titlesQuery.error) ||
      isUnauthorized(officersQuery.error) ||
      isUnauthorized(guardianCandidatesQuery.error)
    ) {
      void signOut();
    }
  }, [
    ministriesQuery.error,
    productsQuery.error,
    titlesQuery.error,
    officersQuery.error,
    guardianCandidatesQuery.error,
    signOut,
  ]);

  const createMutation = useMutation({
    mutationFn: (input: MemberInput) => createMember(baseUrl, token, input),
  });

  // FR-29a: the create contract carries no subscription, so it is a second call
  // issued after the member exists and before the navigation happens.
  const subscribeMutation = useMutation({
    mutationFn: (variables: { memberNo: string; input: SubscribeProductInput }) =>
      subscribeMemberProduct(baseUrl, token, variables.memberNo, variables.input),
  });

  // MR-9: the create contract carries no shepherd either, so the assignment is
  // attempted after the member exists and never undoes it.
  const assignMutation = useMutation({
    mutationFn: (variables: { memberNo: string; officerMemberNo: string; assignedOn: string }) =>
      assignMember(baseUrl, token, {
        memberNo: variables.memberNo,
        officerMemberNo: variables.officerMemberNo,
        assignedOn: variables.assignedOn,
        reason: 'Assigned while registering the member',
      }),
  });

  // MR-8: ministries on the edit form are immediate writes, not part of the save.
  const addMinistryMutation = useMutation({
    mutationFn: (code: string) => addMemberMinistry(baseUrl, token, memberNo, code),
  });

  const removeMinistryMutation = useMutation({
    mutationFn: (code: string) => removeMemberMinistry(baseUrl, token, memberNo, code),
  });

  const updateMutation = useMutation({
    mutationFn: (variables: { input: MemberUpdateInput; etag: string | null }) =>
      updateMember(baseUrl, token, memberNo, variables.input, variables.etag),
  });

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    subscribeMutation.isPending ||
    assignMutation.isPending ||
    syncing;

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
      // MR-38: on create, one of the two reachability sources is required.
      ...(isEdit ? {} : validateReachability(values)),
    };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      // Review renders no fields, so a failed save moves to the first step that owns an
      // error (the contact-conflict path below does the same for its own failures).
      const owningStep = steps.find((step) => Object.keys(errorsForStep(step)).length > 0);
      if (owningStep && owningStep !== activeStep) goToStep(owningStep);
      return;
    }

    if (!isEdit) {
      const subscription = toSubscriptionInput(values);
      const shepherd = toShepherdInput(values);
      createMutation.mutate(toCreatePayload(values), {
        onSuccess: (created) => {
          void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
          const memberNoCreated = created.memberNo;

          const finish = (): void => {
            void queryClient.invalidateQueries({
              queryKey: ['member', baseUrl, memberNoCreated],
            });
            navigate(`/members/${encodeURIComponent(memberNoCreated)}`);
          };

          // MR-9: the member is created first; the assignment is attempted second and a
          // failure never undoes the member.
          const afterShepherd = (): void => {
            if (!subscription) {
              finish();
              return;
            }
            subscribeMutation.mutate(
              { memberNo: memberNoCreated, input: subscription },
              {
                onSuccess: finish,
                onError: (error: unknown) => {
                  if (isUnauthorized(error)) {
                    void signOut();
                    return;
                  }
                  // The member exists; only the subscription failed. Name the failure,
                  // keep the member, and never claim the registration failed (AC-52).
                  setCreatedMemberNo(memberNoCreated);
                  setSubscriptionFailure(errorMessage(error));
                },
              },
            );
          };

          if (!shepherd) {
            afterShepherd();
            return;
          }

          assignMutation.mutate(
            {
              memberNo: memberNoCreated,
              officerMemberNo: shepherd.officerMemberNo,
              assignedOn: shepherd.assignedOn,
            },
            {
              onSuccess: afterShepherd,
              onError: (error: unknown) => {
                if (isUnauthorized(error)) {
                  void signOut();
                  return;
                }
                // AC-MR10: the member stays, the warning links to its record.
                setCreatedMemberNo(memberNoCreated);
                setShepherdFailure(errorMessage(error));
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
            // The field that owns the error is on the first step, so the operator is
            // taken to it rather than left on Review.
            goToStep('person');
            return;
          }
          const memberNoMessage = memberNoConflictMessage(error);
          if (memberNoMessage) {
            setErrors({ memberNo: memberNoMessage });
            goToStep('person');
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

  const activeMinistries = (ministriesQuery.data ?? []).filter((ministry) => ministry.active);
  const products = (productsQuery.data ?? []).filter((product) => product.active);
  const selectedProduct: WelfareProduct | undefined = products.find(
    (product) => product.code === values.subscriptionProductCode,
  );
  const ministryName = (code: string): string =>
    activeMinistries.find((ministry) => ministry.code === code)?.name ?? code;

  // MR-12/MR-13: the picker offers what the selected gender allows, and a held
  // title the gender forbids is still shown so it can be cleared deliberately.
  const titles = titlesQuery.data ?? [];
  const genderTitles = titleOptionsForGender(titles, values.gender);
  const heldTitle = titles.find((option) => option.code === values.titleCode);
  const titleOptions =
    heldTitle && !genderTitles.some((option) => option.code === heldTitle.code)
      ? [heldTitle, ...genderTitles]
      : genderTitles;
  const selectedTitle = titles.find((option) => option.code === values.titleCode);
  const officers = officersQuery.data ?? [];
  const selectedOfficer = officers.find((officer) => officer.memberNo === values.shepherdMemberNo);
  const currentShepherdName =
    member?.shepherd?.name ?? selectedOfficer?.name ?? values.shepherdMemberNo;
  const paidByLabel =
    values.subscriptionPaidBy === 'member'
      ? 'Member'
      : values.subscriptionPaidBy === 'church'
        ? 'Church'
        : 'Choose who pays';

  function changeGender(next: MemberFormValues['gender']): void {
    const forbidden = titleForbiddenByGender(titles, values.titleCode, next);
    setField('gender', next);
    if (!forbidden) return;
    // MR-13: the title and its date are cleared together, with an inline note.
    setField('titleCode', '');
    setField('titledOn', '');
    setTitleNote(
      `${forbidden.label} is restricted to ${forbidden.genderRestriction} members, so the title was cleared.`,
    );
  }

  // MR-8: the edit form adds a ministry by code through its own endpoint.
  const assignedCodes = new Set((member?.ministries ?? []).map((ministry) => ministry.code));
  const unassignedMinistries = activeMinistries.filter(
    (ministry) => !assignedCodes.has(ministry.code),
  );

  function addMinistry(): void {
    const code = addMinistryCode.trim();
    if (!code || addMinistryMutation.isPending) return;
    setSectionError(null);
    addMinistryMutation.mutate(code, {
      onSuccess: () => {
        setAddMinistryCode('');
        void queryClient.invalidateQueries({ queryKey: ['member', baseUrl, memberNo] });
        void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
      },
      onError: (error: unknown) => {
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        setSectionError(errorMessage(error));
      },
    });
  }

  function confirmRemoveMinistry(): void {
    if (!removeMinistryCode || removeMinistryMutation.isPending) return;
    setSectionError(null);
    removeMinistryMutation.mutate(removeMinistryCode, {
      onSuccess: () => {
        setRemoveMinistryCode(null);
        void queryClient.invalidateQueries({ queryKey: ['member', baseUrl, memberNo] });
        void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
      },
      onError: (error: unknown) => {
        setRemoveMinistryCode(null);
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        setSectionError(errorMessage(error));
      },
    });
  }

  // MR-48: the form is a step flow. The Relationships step is conditional: on create
  // it appears only while the member records no own contact; on edit it appears when
  // the record has no contact or already has relationships.
  const hasOwnContactOnCreate = CREATE_CONTACT_FIELDS.some(
    ({ field }) => values[field].trim().length > 0,
  );
  const relationshipStepShown = isEdit
    ? (member?.contacts.length ?? 0) === 0 || (member?.relationships.length ?? 0) > 0
    : !hasOwnContactOnCreate;

  const steps: MemberFormStep[] = MEMBER_FORM_STEP_IDS.filter(
    (step) => step !== 'relationships' || relationshipStepShown,
  );

  /**
   * The errors each step would report if Next were chosen now (MR-48). The subscription
   * draft belongs to Church and involvement, the step that renders its controls; Review
   * shows no fields, so an error left there would make the save fail silently.
   */
  function errorsForStep(step: MemberFormStep): MemberFormErrors {
    if (step === 'relationships') return isEdit ? {} : validateReachability(values);
    if (step === 'review') return {};
    const errors = validateMemberStep(step, values);
    if (step === 'church' && !isEdit) {
      Object.assign(
        errors,
        validateSubscriptionDraft(values, selectedProduct?.paymentMode ?? null),
      );
    }
    return errors;
  }

  const firstInvalidIndex = steps.findIndex((step) => Object.keys(errorsForStep(step)).length > 0);
  const isStepEnabled = (index: number): boolean =>
    firstInvalidIndex < 0 || index <= firstInvalidIndex;

  // The step lives in `?step=` so a reload keeps it (MR-48); a step beyond the first
  // invalid one is disabled, so a deep link falls back to the step that needs work.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStep = searchParams.get('step');
  const requestedIndex = steps.indexOf(requestedStep as MemberFormStep);
  const fallbackIndex = firstInvalidIndex >= 0 ? firstInvalidIndex : 0;
  const activeIndex =
    requestedIndex < 0 ? 0 : isStepEnabled(requestedIndex) ? requestedIndex : fallbackIndex;
  const activeStep = steps[activeIndex] ?? 'person';
  const isLastStep = activeIndex === steps.length - 1;

  function goToStep(step: MemberFormStep): void {
    // Entering (or leaving) a step commits the typed member number, which is what the
    // guardian-candidate query keys on.
    if (!isEdit) setCommittedMemberNo(values.memberNo.trim());
    setSearchParams({ step }, { replace: false });
  }

  function next(): void {
    const stepErrors = errorsForStep(activeStep);
    if (Object.keys(stepErrors).length > 0) {
      setErrors((current) => ({ ...current, ...stepErrors }));
      return;
    }
    const target = steps[Math.min(activeIndex + 1, steps.length - 1)];
    if (target) goToStep(target);
  }

  // `Back` never validates: the operator can always leave a step to review it.
  function back(): void {
    const target = steps[Math.max(activeIndex - 1, 0)];
    if (target) goToStep(target);
  }

  // The active step's heading takes focus when the step changes. Focusing on the initial
  // mount is deliberate: arriving at a step is the page's own navigation.
  useEffect(() => {
    document.getElementById('member-form-step-heading')?.focus();
  }, [activeStep]);

  const enteredContacts = CREATE_CONTACT_FIELDS.filter(
    ({ field }) => values[field].trim().length > 0,
  ).map(({ field, label }) => `${label}: ${values[field].trim()}`);

  const reviewContacts = isEdit
    ? (member?.contacts ?? []).map(
        (contact) => `${contact.kind}: ${contact.value}${contact.linked ? ' (linked)' : ''}`,
      )
    : enteredContacts;

  const reviewMinistries = isEdit
    ? (member?.ministries ?? []).map((ministry) => `${ministry.code} · ${ministry.name}`)
    : values.ministries.map((code) => `${code} · ${ministryName(code)}`);

  const reviewGuardianNo = isEdit ? (member?.guardian?.memberNo ?? '') : values.guardianMemberNo;
  const reviewGuardianCandidate = (guardianCandidatesQuery.data ?? []).find(
    (candidate) => candidate.memberNo === reviewGuardianNo,
  );
  const reviewGuardian = isEdit
    ? member?.guardian
      ? `${member.guardian.name} (${member.guardian.memberNo}) · ${member.guardian.contactMasked}${
          member.guardian.via.length > 0 ? ` · via ${member.guardian.via.join(' → ')}` : ''
        }`
      : 'None'
    : reviewGuardianNo
      ? reviewGuardianCandidate
        ? `${reviewGuardianCandidate.name} (${reviewGuardianNo}) · ${reviewGuardianCandidate.contactMasked}`
        : reviewGuardianNo
      : 'None';

  const reviewShepherd = isEdit
    ? member?.shepherd
      ? `${memberLabelFromName(member.shepherd.name, member.shepherd.gender, member.shepherd.age)} · assigned ${member.shepherd.assignedOn}`
      : 'No shepherd assigned'
    : selectedOfficer
      ? `${selectedOfficer.memberNo} · ${selectedOfficer.name}`
      : 'None chosen';

  return (
    <PageFrame
      sectionId="members"
      title={MEMBER_FORM_STEP_LABELS[activeStep]}
      submenu={isEdit ? 'Edit member' : 'Add member'}
      titleId="member-form-step-heading"
      description={(isEdit ? STEP_DESCRIPTION.edit : STEP_DESCRIPTION.create)[activeStep]}
      stepper={
        <MemberFormStepper
          steps={steps}
          activeIndex={activeIndex}
          isEnabled={isStepEnabled}
          onSelect={goToStep}
        />
      }
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
        ) : undefined
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (isLastStep) submit();
          else next();
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

        {createdMemberNo && shepherdFailure ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>
                The member was created, but the shepherd was not assigned
              </MessageBarTitle>
              {shepherdFailure} The member exists; assign a shepherd from{' '}
              <Link to={`/members/${encodeURIComponent(createdMemberNo)}`}>the member record</Link>.
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
              Welfare &amp; Services view.
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

        <div className={styles.stepBody}>
          {activeStep === 'person' ? (
            <>
              <section className={styles.section} aria-labelledby="member-identity-heading">
                <div className={styles.sectionHeader}>
                  <h3 id="member-identity-heading" className={styles.sectionTitle}>
                    Identity
                  </h3>
                  <Text size={200} className={styles.helper}>
                    Member number is permanent and unique. First name and other names are required;
                    alias is optional.
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
                      onBlur={() => setCommittedMemberNo(values.memberNo.trim())}
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

                  {/* MR-49: the second required name field is labelled Other names and
                        writes lastName; there is no separate other-names input, so an
                        existing otherNames value is never touched by this form. */}
                  <Field
                    label="Other names"
                    required
                    validationState={errors.lastName ? 'error' : 'none'}
                    validationMessage={errors.lastName}
                  >
                    <Input
                      value={values.lastName}
                      onChange={(_, data) => setField('lastName', data.value)}
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
                        const option = GENDER_OPTIONS.find(
                          (candidate) => candidate.value === data.optionValue,
                        );
                        if (option) changeGender(option.value);
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
                    <Input
                      value={values.alias}
                      onChange={(_, data) => setField('alias', data.value)}
                    />
                  </Field>
                </div>
              </section>

              <section className={styles.section} aria-labelledby="member-residence-heading">
                <div className={styles.sectionHeader}>
                  <h3 id="member-residence-heading" className={styles.sectionTitle}>
                    Residence
                  </h3>
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
                      ? 'Residence and address are part of the save. Contact values live below and are changed through the contacts dialog.'
                      : 'Residence and address are optional and are part of the create payload.'}
                  </Text>
                  {isEdit ? (
                    <Link to={`/members/${encodeURIComponent(memberNo)}`}>Open member record</Link>
                  ) : null}
                </div>
              </section>

              <section className={styles.section} aria-labelledby="member-contacts-heading">
                <div className={styles.sectionHeader}>
                  <h3 id="member-contacts-heading" className={styles.sectionTitle}>
                    Contacts {isEdit ? <SavedAsYouGo /> : null}
                  </h3>
                  <Text size={200} className={styles.helper}>
                    {isEdit
                      ? 'The values recorded on this member. Contacts have their own endpoints, so adding, correcting or removing one happens in the dialog, not on save.'
                      : 'Optional, and sent in the same POST /v1/members body. A value already owned by another member returns 409 against that field and keeps this form open. A member with no contact of its own needs a guardian.'}
                  </Text>
                </div>

                {isEdit ? (
                  <>
                    {member && member.contacts.length > 0 ? (
                      <ul className={styles.panelList} aria-label="Recorded contacts">
                        {member.contacts.map((contact) => (
                          <li key={contact.id} className={styles.panelRow}>
                            <span className={styles.panelRowInline}>
                              <Text>{contact.value}</Text>
                              <Text size={200} className={styles.helper}>
                                {contact.kind}
                                {contact.linked ? ` · linked from ${contact.ownerMemberNo}` : ''}
                              </Text>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Text size={200} className={styles.helper}>
                        No contacts recorded. A guardian supplies reachability for this member.
                      </Text>
                    )}
                    <div>
                      <Button appearance="secondary" onClick={() => setContactsOpen(true)}>
                        Manage contacts
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className={styles.grid}>
                    <Field
                      label="Phone"
                      validationState={errors.phone ? 'error' : 'none'}
                      validationMessage={errors.phone}
                    >
                      <Input
                        value={values.phone}
                        onChange={(_, data) => setField('phone', data.value)}
                      />
                    </Field>

                    <Field
                      label="Email"
                      validationState={errors.email ? 'error' : 'none'}
                      validationMessage={errors.email}
                    >
                      <Input
                        value={values.email}
                        onChange={(_, data) => setField('email', data.value)}
                      />
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
                )}
              </section>
            </>
          ) : null}

          {activeStep === 'church' ? (
            <>
              <section className={styles.section} aria-labelledby="member-church-heading">
                <div className={styles.sectionHeader}>
                  <h3 id="member-church-heading" className={styles.sectionTitle}>
                    Church
                  </h3>
                  <Text size={200} className={styles.helper}>
                    {isEdit
                      ? 'Presbyter is a flag, not a ministry: it makes the member eligible to shepherd.'
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

                  {/* MR-5: the assembly join date has no input any more. The model keeps the
                        value so an edit leaves the stored date untouched. */}
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

                  {/* MR-6: the back-office card number, on both forms; blank becomes null. */}
                  <Field
                    label="Membership card number"
                    validationState={errors.membershipCardNo ? 'error' : 'none'}
                    validationMessage={errors.membershipCardNo}
                    hint="At most 32 characters; leave blank when there is no card."
                  >
                    <Input
                      value={values.membershipCardNo}
                      onChange={(_, data) => setField('membershipCardNo', data.value)}
                    />
                  </Field>

                  {/* MR-11/MR-12: the office and the date it began, from the reference list. */}
                  <Field
                    label="Presbyter title"
                    validationState={errors.titleCode ? 'error' : 'none'}
                    validationMessage={errors.titleCode}
                    hint="Only the titles the selected gender allows are offered."
                  >
                    <Dropdown
                      value={
                        selectedTitle
                          ? `${selectedTitle.label} · ${selectedTitle.code}`
                          : values.titleCode || 'No title'
                      }
                      selectedOptions={values.titleCode ? [values.titleCode] : []}
                      disabled={titlesQuery.isPending}
                      onOptionSelect={(_, data) => {
                        setField('titleCode', data.optionValue ?? '');
                        setTitleNote(null);
                        if (!data.optionValue) setField('titledOn', '');
                      }}
                    >
                      <Option value="">No title</Option>
                      {titleOptions.map((option) => (
                        <Option
                          key={option.code}
                          value={option.code}
                          text={`${option.label} · ${option.code}`}
                        >
                          {option.label} · {option.code}
                        </Option>
                      ))}
                    </Dropdown>
                  </Field>

                  <Field
                    label="Titled on"
                    validationState={errors.titledOn ? 'error' : 'none'}
                    validationMessage={errors.titledOn}
                    hint="Optional. The UTC date the office began; never in the future."
                  >
                    <Input
                      type="date"
                      value={values.titledOn}
                      onChange={(_, data) => setField('titledOn', data.value)}
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

                {/* MR-13: the note an edited gender leaves behind when it clears a title. */}
                {titleNote ? (
                  <MessageBar intent="info">
                    <MessageBarBody>{titleNote}</MessageBarBody>
                  </MessageBar>
                ) : null}
              </section>

              <section className={styles.section} aria-labelledby="member-ministries-heading">
                <div className={styles.sectionHeader}>
                  <h3 id="member-ministries-heading" className={styles.sectionTitle}>
                    Ministries {isEdit ? <SavedAsYouGo /> : null}
                  </h3>
                  <Text size={200} className={styles.helper}>
                    {isEdit
                      ? 'Ministries apply immediately; they are not part of this form’s save.'
                      : 'Chosen codes travel in the same create request.'}
                  </Text>
                </div>

                {isEdit ? (
                  <>
                    {sectionError ? (
                      <MessageBar intent="error">
                        <MessageBarBody>
                          <MessageBarTitle>The ministry was not changed</MessageBarTitle>
                          {sectionError}
                        </MessageBarBody>
                      </MessageBar>
                    ) : null}

                    {(member?.ministries ?? []).length === 0 ? (
                      <Text size={200} className={styles.helper}>
                        No ministries recorded
                      </Text>
                    ) : (
                      <ul className={styles.panelList} aria-label="Assigned ministries">
                        {(member?.ministries ?? []).map((ministry) => (
                          <li key={ministry.code} className={styles.panelRow}>
                            <span className={styles.panelRowInline}>
                              <Text>{ministry.name}</Text>
                              <Text size={200} className={styles.helper}>
                                {ministry.code}
                              </Text>
                            </span>
                            <Button
                              size="small"
                              appearance="transparent"
                              aria-label={`Remove ${ministry.name}`}
                              onClick={() => setRemoveMinistryCode(ministry.code)}
                            >
                              Remove
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className={styles.grid}>
                      <Field
                        label="Add ministry"
                        hint="Assign by code; the list is the active reference set."
                      >
                        <Dropdown
                          value={
                            addMinistryCode
                              ? `${addMinistryCode} · ${ministryName(addMinistryCode)}`
                              : 'Select a ministry'
                          }
                          selectedOptions={addMinistryCode ? [addMinistryCode] : []}
                          disabled={ministriesQuery.isPending || unassignedMinistries.length === 0}
                          onOptionSelect={(_, data) => setAddMinistryCode(data.optionValue ?? '')}
                        >
                          {unassignedMinistries.map((ministry) => (
                            <Option
                              key={ministry.code}
                              value={ministry.code}
                              text={`${ministry.code} · ${ministry.name}`}
                            >
                              {ministry.code} · {ministry.name}
                            </Option>
                          ))}
                        </Dropdown>
                      </Field>
                      <div className={styles.note}>
                        <Button
                          appearance="secondary"
                          disabled={!addMinistryCode || addMinistryMutation.isPending}
                          onClick={addMinistry}
                        >
                          Add ministry
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
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
                          The registration can still be created; ministries are assigned from the
                          member record afterwards.
                        </MessageBarBody>
                      </MessageBar>
                    ) : null}
                  </>
                )}
              </section>

              <section className={styles.section} aria-labelledby="member-shepherd-heading">
                <div className={styles.sectionHeader}>
                  <h3 id="member-shepherd-heading" className={styles.sectionTitle}>
                    Shepherd {isEdit ? <SavedAsYouGo /> : null}
                  </h3>
                  <Text size={200} className={styles.helper}>
                    {isEdit
                      ? 'The current assignment. Changing it opens the assign dialog, which ends the old assignment with a stated reason.'
                      : 'Optional. The member is created first and the assignment is attempted afterwards; a failed assignment keeps the member.'}
                  </Text>
                </div>

                {isEdit ? (
                  <div className={styles.note}>
                    <Text>
                      {member?.shepherd
                        ? `${memberLabelFromName(member.shepherd.name, member.shepherd.gender, member.shepherd.age)} · assigned ${member.shepherd.assignedOn}`
                        : currentShepherdName
                          ? currentShepherdName
                          : 'No shepherd assigned'}
                    </Text>
                    <div>
                      <Button appearance="secondary" onClick={() => setAssignOpen(true)}>
                        Change
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.grid}>
                    <Field label="Officer" hint="Active officers only.">
                      <Dropdown
                        value={
                          selectedOfficer
                            ? `${selectedOfficer.memberNo} · ${selectedOfficer.name}`
                            : 'No shepherd'
                        }
                        selectedOptions={values.shepherdMemberNo ? [values.shepherdMemberNo] : []}
                        disabled={officersQuery.isPending}
                        onOptionSelect={(_, data) => {
                          setField('shepherdMemberNo', data.optionValue ?? '');
                        }}
                      >
                        <Option value="">No shepherd</Option>
                        {officers.map((officer) => (
                          <Option
                            key={officer.memberNo}
                            value={officer.memberNo}
                            text={`${officer.memberNo} · ${officer.name}`}
                          >
                            {officer.memberNo} · {officer.name}
                          </Option>
                        ))}
                      </Dropdown>
                    </Field>
                    <Field
                      label="Assigned on"
                      validationState={errors.shepherdAssignedOn ? 'error' : 'none'}
                      validationMessage={errors.shepherdAssignedOn}
                      hint="Defaults to today (UTC)."
                    >
                      <Input
                        type="date"
                        value={values.shepherdAssignedOn}
                        onChange={(_, data) => setField('shepherdAssignedOn', data.value)}
                      />
                    </Field>
                  </div>
                )}
              </section>

              {isEdit ? null : (
                <section className={styles.section} aria-labelledby="member-subscription-heading">
                  <div className={styles.sectionHeader}>
                    <h3 id="member-subscription-heading" className={styles.sectionTitle}>
                      Subscription
                    </h3>
                    <Text size={200} className={styles.helper}>
                      Optional, and at most one. The create request carries no subscription, so a
                      chosen one is added by a second call straight after the member exists. If that
                      call fails the member still exists, and the subscription can be added from the
                      member&apos;s Welfare &amp; Services view.
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
                          selectedOptions={
                            values.subscriptionPaidBy ? [values.subscriptionPaidBy] : []
                          }
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
                        The registration can still be created; a subscription can be added from the
                        member record afterwards.
                      </MessageBarBody>
                    </MessageBar>
                  ) : null}
                </section>
              )}

              <Text size={200} className={styles.helper}>
                {isEdit
                  ? "The API validates member-number and contact uniqueness. A duplicate member number returns 409 and is shown against the member-number field. Subscriptions are added from the member's Welfare & Services view."
                  : 'The API validates member-number and contact uniqueness. A duplicate member number returns 409 and is shown against the member-number field; so does a contact value another member already owns, shown against that field.'}
              </Text>
            </>
          ) : null}

          {activeStep === 'relationships' ? (
            <MemberFormRelationshipsSection
              member={member}
              forMemberNo={isEdit ? memberNo : committedMemberNo}
              guardianMemberNo={values.guardianMemberNo}
              onGuardianChange={(next) => setField('guardianMemberNo', next)}
              guardianError={errors.guardianMemberNo}
              contactCount={
                isEdit
                  ? (member?.contacts.length ?? 0)
                  : CREATE_CONTACT_FIELDS.filter(({ field }) => values[field].trim().length > 0)
                      .length
              }
            />
          ) : null}

          {activeStep === 'review' ? (
            <div className={styles.review} data-testid="member-form-review">
              <section className={styles.section} aria-labelledby="member-review-person">
                <h3 id="member-review-person" className={styles.sectionTitle}>
                  Person and contact
                </h3>
                <div className={styles.reviewGrid}>
                  <ReviewItem label="Member number" value={values.memberNo || '—'} />
                  <ReviewItem
                    label="Name"
                    value={[values.firstName, values.lastName].filter(Boolean).join(' ') || '—'}
                  />
                  <ReviewItem
                    label="Gender"
                    value={
                      GENDER_OPTIONS.find((option) => option.value === values.gender)?.label ??
                      'Undisclosed'
                    }
                  />
                  <ReviewItem label="Date of birth" value={values.dob || '—'} />
                  <ReviewItem label="Place of residence" value={values.placeOfResidence || '—'} />
                  <ReviewItem label="Address line" value={values.addressLine || '—'} />
                  <ReviewItem
                    label="Contacts"
                    value={reviewContacts.length > 0 ? reviewContacts.join(' · ') : 'None recorded'}
                  />
                </div>
              </section>

              <section className={styles.section} aria-labelledby="member-review-church">
                <h3 id="member-review-church" className={styles.sectionTitle}>
                  Church and involvement
                </h3>
                <div className={styles.reviewGrid}>
                  <ReviewItem label="Joined on" value={values.joinedOn || '—'} />
                  <ReviewItem label="Came from" value={values.cameFrom || '—'} />
                  <ReviewItem label="Moved out" value={values.movedOutOn || '—'} />
                  <ReviewItem label="Moved to" value={values.movedToAssembly || '—'} />
                  <ReviewItem label="Presbyter" value={values.isPresbyter ? 'Yes' : 'No'} />
                  <ReviewItem
                    label="Presbyter title"
                    value={
                      selectedTitle
                        ? `${selectedTitle.label}${values.titledOn ? ` · dated ${values.titledOn}` : ''}`
                        : 'No title'
                    }
                  />
                  <ReviewItem label="Membership card" value={values.membershipCardNo || '—'} />
                  <ReviewItem
                    label="Ministries"
                    value={reviewMinistries.length > 0 ? reviewMinistries.join(' · ') : 'None'}
                  />
                  <ReviewItem label="Shepherd" value={reviewShepherd} />
                </div>
              </section>

              <section className={styles.section} aria-labelledby="member-review-guardian">
                <h3 id="member-review-guardian" className={styles.sectionTitle}>
                  Guardian
                </h3>
                <div className={styles.reviewGrid}>
                  <ReviewItem label="Guardian" value={reviewGuardian} />
                </div>
              </section>

              <section className={styles.section} aria-labelledby="member-review-after">
                <h3 id="member-review-after" className={styles.sectionTitle}>
                  {isEdit ? 'After saving' : 'After the member exists'}
                </h3>
                <div className={styles.reviewGrid}>
                  {isEdit ? (
                    <>
                      <ReviewItem
                        label="Staged by this form"
                        value="The fields above, on Save changes."
                      />
                      <ReviewItem
                        label="Saved as you go"
                        value="Contacts, ministries and relationships were already written."
                      />
                    </>
                  ) : (
                    <>
                      <ReviewItem
                        label="Shepherd assignment"
                        value={
                          selectedOfficer
                            ? `Assign ${selectedOfficer.name} on ${values.shepherdAssignedOn || utcToday()}`
                            : 'None chosen'
                        }
                      />
                      <ReviewItem
                        label="Subscription"
                        value={
                          selectedProduct
                            ? `${selectedProduct.name}${values.subscriptionPaidBy ? ` · paid by ${paidByLabel}` : ''}`
                            : 'None chosen'
                        }
                      />
                      <ReviewItem
                        label="Other relationships"
                        value="Added from the member record once the member exists."
                      />
                    </>
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </div>

        {/* MR-48: the navigation sits at the bottom right, inside the form so Enter still
            advances. `Cancel` is the quiet action that leads the run, as the mock has it;
            `Back` is disabled on the first step and never validates; `Next` and the Review
            save are the accent controls. */}
        <div className={styles.stepNav} data-testid="member-form-step-nav">
          {createdMemberNo ? null : (
            <Button appearance="transparent" onClick={cancel}>
              Cancel
            </Button>
          )}
          <Button appearance="secondary" onClick={back} disabled={activeIndex === 0}>
            Back
          </Button>
          {isLastStep ? (
            <Button
              icon={<SaveRegular />}
              appearance="primary"
              onClick={submit}
              disabled={isSaving}
            >
              {isEdit ? 'Save changes' : 'Create member'}
            </Button>
          ) : (
            <Button appearance="primary" onClick={next}>
              Next
            </Button>
          )}
        </div>
      </form>

      {/* MR-7: the edit form shows the contacts and opens the one editable dialog. */}
      {isEdit && member ? (
        <ContactsDialog
          member={member}
          open={contactsOpen}
          onOpenChange={(open) => {
            setContactsOpen(open);
            if (!open) {
              // The dialog owns the writes; refetch so the section shows what it did.
              void queryClient.invalidateQueries({ queryKey: ['member', baseUrl, memberNo] });
            }
          }}
          editable
        />
      ) : null}

      {/* MR-10: reassignment is the record's existing dialog, with its conflict handling. */}
      {isEdit && assignOpen && member ? (
        <AssignShepherdDialog
          memberNo={member.memberNo}
          memberName={member.firstName ? `${member.firstName} ${member.lastName}` : member.memberNo}
          currentAssignment={
            member.shepherd
              ? {
                  // The detail projection carries no assignment id, so the dialog's own
                  // 409 round trip supplies it when the old assignment has to end.
                  assignmentId: '',
                  officerMemberNo: member.shepherd.memberNo,
                  officerName: memberLabelFromName(
                    member.shepherd.name,
                    member.shepherd.gender,
                    member.shepherd.age,
                  ),
                  assignedOn: member.shepherd.assignedOn,
                }
              : null
          }
          onClose={() => setAssignOpen(false)}
          onAssigned={() => {
            void queryClient.invalidateQueries({ queryKey: ['member', baseUrl, memberNo] });
            void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={removeMinistryCode !== null}
        title={
          removeMinistryCode ? `Remove ${ministryName(removeMinistryCode)}?` : 'Remove ministry?'
        }
        message={
          removeMinistryCode
            ? `${removeMinistryCode} is unassigned from this member. The ministry itself stays in the reference list.`
            : ''
        }
        confirmLabel="Remove ministry"
        busy={removeMinistryMutation.isPending}
        onConfirm={confirmRemoveMinistry}
        onCancel={() => setRemoveMinistryCode(null)}
      />

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
      member={member}
      initial={fromMemberDetail(member)}
      initialEtag={etag}
      onFetchLatest={loadLatest}
    />
  );
}
