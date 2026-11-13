import {
  Badge,
  Button,
  Checkbox,
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
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Textarea,
} from '@fluentui/react-components';
import { AddRegular, ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isUnauthorized } from '../../api/errors';
import {
  COVERS,
  PAYMENT_MODES,
  PERIOD_MONTHS,
  RELATIONSHIP_TYPES,
  createWelfareProduct,
  listWelfareProducts,
  setWelfareProductActive,
  type Covers,
  type PaymentMode,
  type PeriodMonths,
  type RelationshipType,
  type WelfareProduct,
} from '../../api/welfare';
import type { Gender } from '../../api/members';
import { useSession } from '../../auth/SessionProvider';
import { PageFrame } from '../../components/PageFrame';
import {
  coversLabel,
  createEmptyProductForm,
  formatMoneyMinor,
  paymentModeLabel,
  periodLabel,
  productDependentsLabel,
  productEligibility,
  relationshipLabel,
  toProductPayload,
  validateProductForm,
  type ProductFormErrors,
  type ProductFormValues,
} from '../../format/welfare';
import { useUssdStyles } from './ussd-styles';

const PAYER_OPTIONS: readonly { readonly value: PaymentMode; readonly label: string }[] =
  PAYMENT_MODES.map((mode) => ({ value: mode, label: paymentModeLabel(mode) }));

const PERIOD_OPTIONS: readonly { readonly value: PeriodMonths; readonly label: string }[] =
  PERIOD_MONTHS.map((months) => ({ value: months, label: periodLabel(months) }));

const COVER_OPTIONS: readonly { readonly value: Covers; readonly label: string }[] = COVERS.map(
  (covers) => ({ value: covers, label: coversLabel(covers) }),
);

const GENDER_OPTIONS: readonly { readonly value: Gender | ''; readonly label: string }[] = [
  { value: '', label: 'Any gender' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'undisclosed', label: 'Undisclosed' },
];

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/**
 * USSD → Products. Welfare products are reference data: created once with their
 * eligibility, payer, period and cover rules, then toggled active. Pricing and
 * eligibility are create-only in the API, so the dialog is the create surface
 * and the table keeps the rules readable afterwards.
 */
export function UssdProductsPage() {
  const styles = useUssdStyles();
  const { baseUrl, session, signOut } = useSession();
  const queryClient = useQueryClient();
  const token = session?.token ?? '';

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ProductFormValues>(createEmptyProductForm);
  const [formErrors, setFormErrors] = useState<ProductFormErrors>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const productsQuery = useQuery({
    queryKey: ['ussd', baseUrl, 'products'],
    queryFn: ({ signal }) => listWelfareProducts(baseUrl, token, true, signal),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (isUnauthorized(productsQuery.error)) void signOut();
  }, [productsQuery.error, signOut]);

  const toggleMutation = useMutation({
    mutationFn: (product: WelfareProduct) =>
      setWelfareProductActive(baseUrl, token, product.code, !product.active),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'products'] });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  const createMutation = useMutation({
    mutationFn: () => createWelfareProduct(baseUrl, token, toProductPayload(form)),
    onSuccess: () => {
      setFormOpen(false);
      setForm(createEmptyProductForm());
      setFormErrors({});
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['ussd', baseUrl, 'products'] });
    },
    onError: (error: unknown) => {
      if (isUnauthorized(error)) {
        void signOut();
        return;
      }
      setActionError(errorMessage(error));
    },
  });

  function update(next: Partial<ProductFormValues>): void {
    setForm((current) => ({ ...current, ...next }));
  }

  function toggleRelationship(type: RelationshipType, checked: boolean): void {
    update({
      allowedRelationships: checked
        ? [...form.allowedRelationships, type]
        : form.allowedRelationships.filter((candidate) => candidate !== type),
    });
  }

  function submit(): void {
    const errors = validateProductForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    createMutation.mutate();
  }

  const products = productsQuery.data ?? [];

  return (
    <PageFrame
      sectionId="ussd"
      title="USSD welfare products"
      submenu="Products"
      description="Welfare products and their eligibility, payer, period, cover and dependent rules. A product is created once and toggled active; pricing is fixed at creation."
      actions={[
        {
          id: 'new-product',
          label: 'New product',
          icon: <AddRegular />,
          onSelect: () => {
            setForm(createEmptyProductForm());
            setFormErrors({});
            setFormOpen(true);
          },
        },
        {
          id: 'refresh',
          label: 'Refresh',
          icon: <ArrowClockwiseRegular />,
          onSelect: () => {
            void productsQuery.refetch();
          },
          disabled: productsQuery.isFetching,
        },
      ]}
    >
      <div className={styles.page}>
        {actionError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The product action failed</MessageBarTitle>
              {actionError}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        <section className={styles.panel} aria-label="Welfare products">
          {productsQuery.isPending ? (
            <div className={styles.state}>
              <Spinner label="Loading welfare products…" />
            </div>
          ) : productsQuery.isError ? (
            <div className={styles.panelBody}>
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Welfare products could not be loaded</MessageBarTitle>
                  {errorMessage(productsQuery.error)}
                </MessageBarBody>
              </MessageBar>
            </div>
          ) : products.length === 0 ? (
            <div className={styles.empty}>
              <Text className={styles.emptyTitle}>No welfare products</Text>
              <Text size={200} className={styles.muted}>
                Create the first product; the handset Subscribe list follows its payer and cover
                rules.
              </Text>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <Table className={styles.table} size="small" aria-label="Welfare products">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Product</TableHeaderCell>
                    <TableHeaderCell>Premium</TableHeaderCell>
                    <TableHeaderCell>Payer</TableHeaderCell>
                    <TableHeaderCell>Period</TableHeaderCell>
                    <TableHeaderCell>Cover</TableHeaderCell>
                    <TableHeaderCell>Eligibility</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Action</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Text weight="semibold">{product.name}</Text>
                        <br />
                        <Text size={200} className={styles.muted}>
                          {product.code}
                          {product.description ? ` · ${product.description}` : ''}
                        </Text>
                      </TableCell>
                      <TableCell>
                        {formatMoneyMinor(product.premiumMinor, product.currency)}
                      </TableCell>
                      <TableCell>{paymentModeLabel(product.paymentMode)}</TableCell>
                      <TableCell>{periodLabel(product.periodMonths)}</TableCell>
                      <TableCell>
                        {coversLabel(product.covers)}
                        <br />
                        <Text size={200} className={styles.muted}>
                          {productDependentsLabel(product)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        {productEligibility(product).length === 0 ? (
                          <Text size={200} className={styles.muted}>
                            No restrictions
                          </Text>
                        ) : (
                          <ul className={styles.inlineCode}>
                            {productEligibility(product).map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          appearance="tint"
                          color={product.active ? 'success' : 'subtle'}
                          size="small"
                        >
                          {product.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          appearance="secondary"
                          disabled={toggleMutation.isPending}
                          onClick={() => toggleMutation.mutate(product)}
                        >
                          {product.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={formOpen}
        onOpenChange={(_, data) => {
          if (!data.open) setFormOpen(false);
        }}
      >
        <DialogSurface style={{ maxWidth: '760px' }}>
          <DialogBody>
            <DialogTitle>New welfare product</DialogTitle>
            <DialogContent>
              <div className={styles.panelBody}>
                <div className={styles.fields}>
                  <Field
                    label="Code"
                    className={styles.field}
                    validationState={formErrors.code ? 'error' : 'none'}
                    validationMessage={formErrors.code}
                  >
                    <Input
                      value={form.code}
                      maxLength={32}
                      onChange={(_, data) => update({ code: data.value })}
                    />
                  </Field>
                  <Field
                    label="Name"
                    className={styles.field}
                    validationState={formErrors.name ? 'error' : 'none'}
                    validationMessage={formErrors.name}
                  >
                    <Input
                      value={form.name}
                      maxLength={100}
                      onChange={(_, data) => update({ name: data.value })}
                    />
                  </Field>
                </div>

                <Field label="Description">
                  <Textarea
                    value={form.description}
                    maxLength={500}
                    resize="vertical"
                    onChange={(_, data) => update({ description: data.value })}
                  />
                </Field>

                <div className={styles.fields}>
                  <Field
                    label="Premium (minor units)"
                    hint="e.g. 2500 = GHS 25.00"
                    className={styles.field}
                    validationState={formErrors.premiumMinor ? 'error' : 'none'}
                    validationMessage={formErrors.premiumMinor}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={form.premiumMinor}
                      onChange={(_, data) => update({ premiumMinor: data.value })}
                    />
                  </Field>
                  <Field
                    label="Currency"
                    className={styles.narrowField}
                    validationState={formErrors.currency ? 'error' : 'none'}
                    validationMessage={formErrors.currency}
                  >
                    <Input
                      value={form.currency}
                      maxLength={3}
                      onChange={(_, data) => update({ currency: data.value.toUpperCase() })}
                    />
                  </Field>
                  <Field label="Payer" className={styles.field}>
                    <Dropdown
                      aria-label="Payer"
                      value={paymentModeLabel(form.paymentMode)}
                      selectedOptions={[form.paymentMode]}
                      onOptionSelect={(_, data) => {
                        const chosen = PAYER_OPTIONS.find(
                          (option) => option.value === data.optionValue,
                        );
                        if (chosen) update({ paymentMode: chosen.value });
                      }}
                    >
                      {PAYER_OPTIONS.map((option) => (
                        <Option key={option.value} value={option.value} text={option.label}>
                          {option.label}
                        </Option>
                      ))}
                    </Dropdown>
                  </Field>
                </div>

                <div className={styles.fields}>
                  <Field label="Period" className={styles.field}>
                    <Dropdown
                      aria-label="Period"
                      value={periodLabel(form.periodMonths)}
                      selectedOptions={[String(form.periodMonths)]}
                      onOptionSelect={(_, data) => {
                        const chosen = PERIOD_OPTIONS.find(
                          (option) => String(option.value) === data.optionValue,
                        );
                        if (chosen) update({ periodMonths: chosen.value });
                      }}
                    >
                      {PERIOD_OPTIONS.map((option) => (
                        <Option key={option.value} value={String(option.value)} text={option.label}>
                          {option.label}
                        </Option>
                      ))}
                    </Dropdown>
                  </Field>
                  <Field label="Cover" className={styles.field}>
                    <Dropdown
                      aria-label="Cover"
                      value={coversLabel(form.covers)}
                      selectedOptions={[form.covers]}
                      onOptionSelect={(_, data) => {
                        const chosen = COVER_OPTIONS.find(
                          (option) => option.value === data.optionValue,
                        );
                        if (chosen) update({ covers: chosen.value });
                      }}
                    >
                      {COVER_OPTIONS.map((option) => (
                        <Option key={option.value} value={option.value} text={option.label}>
                          {option.label}
                        </Option>
                      ))}
                    </Dropdown>
                  </Field>
                  <Field
                    label="Max dependents"
                    className={styles.narrowField}
                    validationState={formErrors.maxDependents ? 'error' : 'none'}
                    validationMessage={formErrors.maxDependents}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={form.maxDependents}
                      disabled={form.covers === 'individual'}
                      onChange={(_, data) => update({ maxDependents: data.value })}
                    />
                  </Field>
                </div>

                <Field
                  label="Allowed relationships"
                  hint="A household product requires at least one relationship."
                  validationState={formErrors.allowedRelationships ? 'error' : 'none'}
                  validationMessage={formErrors.allowedRelationships}
                >
                  <div className={styles.badgeRow}>
                    {RELATIONSHIP_TYPES.map((type) => (
                      <Checkbox
                        key={type}
                        label={relationshipLabel(type)}
                        checked={form.allowedRelationships.includes(type)}
                        disabled={form.covers === 'individual'}
                        onChange={(_, data) => toggleRelationship(type, Boolean(data.checked))}
                      />
                    ))}
                  </div>
                </Field>

                <div className={styles.fields}>
                  <Field
                    label="Minimum membership days"
                    className={styles.field}
                    validationState={formErrors.minMembershipDays ? 'error' : 'none'}
                    validationMessage={formErrors.minMembershipDays}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={form.minMembershipDays}
                      onChange={(_, data) => update({ minMembershipDays: data.value })}
                    />
                  </Field>
                  <Field
                    label="Gender"
                    className={styles.field}
                    hint="Any gender leaves the rule unset."
                  >
                    <Dropdown
                      aria-label="Gender"
                      value={
                        GENDER_OPTIONS.find((option) => option.value === form.gender)?.label ??
                        'Any gender'
                      }
                      selectedOptions={[form.gender]}
                      onOptionSelect={(_, data) => {
                        const chosen = GENDER_OPTIONS.find(
                          (option) => option.value === data.optionValue,
                        );
                        if (chosen) update({ gender: chosen.value });
                      }}
                    >
                      {GENDER_OPTIONS.map((option) => (
                        <Option key={option.value} value={option.value} text={option.label}>
                          {option.label}
                        </Option>
                      ))}
                    </Dropdown>
                  </Field>
                  <Field
                    label="Minimum age"
                    className={styles.narrowField}
                    validationState={formErrors.minAge ? 'error' : 'none'}
                    validationMessage={formErrors.minAge}
                  >
                    <Input
                      type="number"
                      min={0}
                      max={150}
                      value={form.minAge}
                      onChange={(_, data) => update({ minAge: data.value })}
                    />
                  </Field>
                  <Field
                    label="Maximum age"
                    className={styles.narrowField}
                    validationState={formErrors.maxAge ? 'error' : 'none'}
                    validationMessage={formErrors.maxAge}
                  >
                    <Input
                      type="number"
                      min={0}
                      max={150}
                      value={form.maxAge}
                      onChange={(_, data) => update({ maxAge: data.value })}
                    />
                  </Field>
                </div>

                <div className={styles.fields}>
                  <Switch
                    label="Membership card required"
                    checked={form.requiresCard}
                    onChange={(_, data) => update({ requiresCard: data.checked })}
                  />
                  <Switch
                    label="Verified member required"
                    checked={form.requiresVerified}
                    onChange={(_, data) => update({ requiresVerified: data.checked })}
                  />
                  <Switch
                    label="Active"
                    checked={form.active}
                    onChange={(_, data) => update({ active: data.checked })}
                  />
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                disabled={createMutation.isPending}
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button appearance="primary" disabled={createMutation.isPending} onClick={submit}>
                {createMutation.isPending ? 'Creating…' : 'Create product'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </PageFrame>
  );
}
