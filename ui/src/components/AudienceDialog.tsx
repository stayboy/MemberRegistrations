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
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddRegular, DeleteRegular } from '@fluentui/react-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  createAudience,
  type AudienceClauseInput,
  type AudienceItem,
  type AudienceOperator,
  type CreateAudienceInput,
} from '../api/audiences';
import { ApiError, isUnauthorized } from '../api/errors';
import { listMinistries } from '../api/members';
import { useSession } from '../auth/SessionProvider';

const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  rule: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  clause: {
    display: 'grid',
    gridTemplateColumns: 'minmax(140px, 1fr) minmax(180px, 2fr) auto',
    alignItems: 'start',
    gap: tokens.spacingHorizontalM,
  },
  clauseValue: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  remove: {
    marginTop: tokens.spacingVerticalL,
  },
});

const OPERATOR_OPTIONS: readonly { readonly value: AudienceOperator; readonly label: string }[] = [
  { value: 'allOf', label: 'All of' },
  { value: 'anyOf', label: 'Any of' },
  { value: 'noneOf', label: 'None of' },
];

const ATTRIBUTE_OPTIONS = [
  { value: 'ministry', label: 'Ministry' },
  { value: 'ageBand', label: 'Age band' },
  { value: 'gender', label: 'Gender' },
  { value: 'membershipStatus', label: 'Membership status' },
  { value: 'presbyter', label: 'Presbyter' },
] as const;

type ClauseAttribute = (typeof ATTRIBUTE_OPTIONS)[number]['value'];

interface ClauseRow {
  readonly key: number;
  readonly attribute: ClauseAttribute;
  readonly ministryCode: string;
  readonly minYears: string;
  readonly maxYears: string;
  readonly gender: 'male' | 'female' | '';
  readonly membershipStatus: 'visitor' | 'active' | '';
}

function emptyRow(key: number): ClauseRow {
  return {
    key,
    attribute: 'ministry',
    ministryCode: '',
    minYears: '',
    maxYears: '',
    gender: '',
    membershipStatus: '',
  };
}

const MAX_NAME_LENGTH = 100;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/** The API's problem code, if the failure carries one. */
function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const code = error.problem?.code;
  return typeof code === 'string' ? code : null;
}

function isNonNegativeInteger(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

/**
 * The clause as the wire writes it, or the message the field must show. The
 * browser mirrors the API's rule shape; the API's `422` stays the backstop.
 */
function clauseOf(row: ClauseRow): AudienceClauseInput | string {
  if (row.attribute === 'ministry') {
    return row.ministryCode
      ? { attribute: 'ministry', ministryCode: row.ministryCode }
      : 'Choose a ministry.';
  }
  if (row.attribute === 'presbyter') return { attribute: 'presbyter', value: true };
  if (row.attribute === 'gender') {
    return row.gender ? { attribute: 'gender', value: row.gender } : 'Choose a gender.';
  }
  if (row.attribute === 'membershipStatus') {
    return row.membershipStatus
      ? { attribute: 'membershipStatus', value: row.membershipStatus }
      : 'Choose a membership status.';
  }

  if (!isNonNegativeInteger(row.minYears)) return 'Enter the minimum age in years.';
  if (row.maxYears.trim().length > 0 && !isNonNegativeInteger(row.maxYears)) {
    return 'Enter the maximum age in years, or leave it blank.';
  }
  const minYears = Number(row.minYears);
  const maxYears = row.maxYears.trim().length > 0 ? Number(row.maxYears) : null;
  if (maxYears !== null && maxYears < minYears) {
    return 'The maximum age must not be below the minimum age.';
  }
  return { attribute: 'ageBand', minYears, maxYears };
}

/**
 * The custom-audience dialog (FR-42c, FR-42d). Call site: the event form's
 * audience picker, which selects the created audience. The Admin Audiences page
 * reuses it when it lands (deferred, 2026-11-23), so it lives in `components/`.
 *
 * Feature component: it owns the create POST and the ministry reference list the
 * clause values come from; the caller owns the selection on success. The summary
 * is the API's sentence — no rule is previewed or evaluated here (FR-42c,
 * AC-60).
 */
export function AudienceDialog({
  onClose,
  onCreated,
}: {
  readonly onClose: () => void;
  readonly onCreated: (audience: AudienceItem) => void;
}) {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const nextKey = useRef(1);

  const [name, setName] = useState('');
  const [operator, setOperator] = useState<AudienceOperator>('allOf');
  const [rows, setRows] = useState<readonly ClauseRow[]>([emptyRow(0)]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Readonly<Record<number, string>>>({});
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const ministriesQuery = useQuery({
    queryKey: ['ministries', baseUrl],
    queryFn: ({ signal }) => listMinistries(baseUrl, token, signal),
    enabled: Boolean(token),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isUnauthorized(ministriesQuery.error)) void signOut();
  }, [ministriesQuery.error, signOut]);

  const createMutation = useMutation({
    mutationFn: (input: CreateAudienceInput) => createAudience(baseUrl, token, input),
  });

  function updateRow(key: number, patch: Partial<Omit<ClauseRow, 'key'>>): void {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setRowErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormError(null);
  }

  function submit(): void {
    if (createMutation.isPending) return;

    const trimmedName = name.trim();
    const nextNameError =
      trimmedName.length === 0
        ? 'Name is required.'
        : trimmedName.length > MAX_NAME_LENGTH
          ? `Name must be ${MAX_NAME_LENGTH} characters or fewer.`
          : null;
    setNameError(nextNameError);

    const clauses: AudienceClauseInput[] = [];
    const nextRowErrors: Record<number, string> = {};
    for (const row of rows) {
      const clause = clauseOf(row);
      if (typeof clause === 'string') nextRowErrors[row.key] = clause;
      else clauses.push(clause);
    }
    setRowErrors(nextRowErrors);

    const nextRuleError = rows.length === 0 ? 'Add at least one clause.' : null;
    setRuleError(nextRuleError);

    if (nextNameError || nextRuleError || Object.keys(nextRowErrors).length > 0) return;

    setFormError(null);
    createMutation.mutate(
      { name: trimmedName, rule: { operator, clauses } },
      {
        onSuccess: (created) => {
          onCreated(created);
          onClose();
        },
        onError: (error: unknown) => {
          if (isUnauthorized(error)) {
            void signOut();
            return;
          }
          // FR-42c/FR-42g: the audience codes surface in this dialog, never on
          // the form behind it.
          if (errorCode(error) === 'audience_name_in_use') {
            setNameError(errorMessage(error));
            return;
          }
          setFormError(errorMessage(error));
        },
      },
    );
  }

  function addClause(): void {
    const key = nextKey.current;
    nextKey.current += 1;
    setRows((current) => [...current, emptyRow(key)]);
    setRuleError(null);
    setFormError(null);
  }

  function removeClause(key: number): void {
    setRows((current) => current.filter((row) => row.key !== key));
    setRowErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormError(null);
  }

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open && !createMutation.isPending) onClose();
      }}
    >
      <DialogSurface aria-label="New audience">
        <DialogBody>
          <DialogTitle>New audience</DialogTitle>
          <DialogContent className={styles.content}>
            <Field
              label="Name"
              required
              hint="A short label for this group, for example Young Adults."
              validationState={nameError ? 'error' : 'none'}
              validationMessage={nameError ?? undefined}
            >
              <Input
                value={name}
                maxLength={MAX_NAME_LENGTH}
                onChange={(_, data) => {
                  setName(data.value);
                  setNameError(null);
                  setFormError(null);
                }}
              />
            </Field>

            <Field label="Rule" hint="Who the audience matches.">
              <Dropdown
                aria-label="Operator"
                value={
                  OPERATOR_OPTIONS.find((option) => option.value === operator)?.label ?? 'All of'
                }
                selectedOptions={[operator]}
                onOptionSelect={(_, data) => {
                  if (data.optionValue) setOperator(data.optionValue as AudienceOperator);
                  setFormError(null);
                }}
              >
                {OPERATOR_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
            </Field>

            <section className={styles.rule} aria-label="Rule clauses">
              {rows.map((row, index) => {
                const rowError = rowErrors[row.key];
                const attributeLabel =
                  ATTRIBUTE_OPTIONS.find((option) => option.value === row.attribute)?.label ??
                  'Clause';

                return (
                  <div key={row.key} className={styles.clause}>
                    <Dropdown
                      aria-label={`Clause ${index + 1} attribute`}
                      value={attributeLabel}
                      selectedOptions={[row.attribute]}
                      onOptionSelect={(_, data) => {
                        if (!data.optionValue) return;
                        const attribute = data.optionValue as ClauseAttribute;
                        // A clause keeps only the value its attribute uses.
                        updateRow(row.key, { ...emptyRow(row.key), attribute });
                      }}
                    >
                      {ATTRIBUTE_OPTIONS.map((option) => (
                        <Option key={option.value} value={option.value}>
                          {option.label}
                        </Option>
                      ))}
                    </Dropdown>

                    <div className={styles.clauseValue}>
                      {row.attribute === 'ministry' ? (
                        <Dropdown
                          aria-label={`Clause ${index + 1} ministry`}
                          placeholder="Choose a ministry"
                          value={
                            ministriesQuery.data?.find(
                              (ministry) => ministry.code === row.ministryCode,
                            )?.name ?? ''
                          }
                          selectedOptions={row.ministryCode ? [row.ministryCode] : []}
                          disabled={ministriesQuery.isPending}
                          onOptionSelect={(_, data) => {
                            updateRow(row.key, { ministryCode: data.optionValue ?? '' });
                          }}
                        >
                          {(ministriesQuery.data ?? []).map((ministry) => (
                            <Option
                              key={ministry.code}
                              value={ministry.code}
                              text={`${ministry.code} · ${ministry.name}`}
                            >
                              {ministry.code} · {ministry.name}
                            </Option>
                          ))}
                        </Dropdown>
                      ) : null}

                      {row.attribute === 'ageBand' ? (
                        <>
                          <Input
                            type="number"
                            min={0}
                            aria-label={`Clause ${index + 1} minimum age`}
                            placeholder="Min years"
                            value={row.minYears}
                            onChange={(_, data) => updateRow(row.key, { minYears: data.value })}
                          />
                          <Input
                            type="number"
                            min={0}
                            aria-label={`Clause ${index + 1} maximum age`}
                            placeholder="Max years (optional)"
                            value={row.maxYears}
                            onChange={(_, data) => updateRow(row.key, { maxYears: data.value })}
                          />
                        </>
                      ) : null}

                      {row.attribute === 'gender' ? (
                        <Dropdown
                          aria-label={`Clause ${index + 1} gender`}
                          placeholder="Choose a gender"
                          value={
                            row.gender === 'male' ? 'Male' : row.gender === 'female' ? 'Female' : ''
                          }
                          selectedOptions={row.gender ? [row.gender] : []}
                          onOptionSelect={(_, data) => {
                            updateRow(row.key, {
                              gender: (data.optionValue as 'male' | 'female' | undefined) ?? '',
                            });
                          }}
                        >
                          <Option value="male">Male</Option>
                          <Option value="female">Female</Option>
                        </Dropdown>
                      ) : null}

                      {row.attribute === 'membershipStatus' ? (
                        <Dropdown
                          aria-label={`Clause ${index + 1} membership status`}
                          placeholder="Choose a status"
                          value={
                            row.membershipStatus === 'visitor'
                              ? 'Visitor'
                              : row.membershipStatus === 'active'
                                ? 'Active'
                                : ''
                          }
                          selectedOptions={row.membershipStatus ? [row.membershipStatus] : []}
                          onOptionSelect={(_, data) => {
                            updateRow(row.key, {
                              membershipStatus:
                                (data.optionValue as 'visitor' | 'active' | undefined) ?? '',
                            });
                          }}
                        >
                          <Option value="active">Active</Option>
                          <Option value="visitor">Visitor</Option>
                        </Dropdown>
                      ) : null}

                      {row.attribute === 'presbyter' ? (
                        <Text size={200} className={styles.muted}>
                          Matches members who are presbyters.
                        </Text>
                      ) : null}

                      {rowError ? (
                        <Text size={200} role="alert" className={styles.muted}>
                          {rowError}
                        </Text>
                      ) : null}
                    </div>

                    <Button
                      appearance="transparent"
                      className={styles.remove}
                      icon={<DeleteRegular />}
                      aria-label={`Remove clause ${index + 1}`}
                      onClick={() => removeClause(row.key)}
                      disabled={rows.length === 1}
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
            </section>

            {ruleError ? (
              <Text size={200} role="alert">
                {ruleError}
              </Text>
            ) : null}

            <div>
              <Button icon={<AddRegular />} appearance="secondary" onClick={addClause}>
                Add clause
              </Button>
            </div>

            <Text size={200} className={styles.muted}>
              The server renders this audience&apos;s summary; the form lists it once saved.
            </Text>

            {formError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The audience was not created</MessageBarTitle>
                  {formError}
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button appearance="primary" onClick={submit} disabled={createMutation.isPending}>
              Create audience
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
