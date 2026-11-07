import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
} from '@fluentui/react-components';
import { formatMoneyMinor } from '../../format/welfare';
import { useQuery } from '@tanstack/react-query';
import { listOfferingTerms } from '../../api/offerings';
import { useSession } from '../../auth/SessionProvider';
import { useDateTimeFormat } from '../../shell/DateTimeProvider';
import { useOfferingsStyles } from './offerings-styles';

function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function moneyOrDash(value: number | null, currency: string): string {
  if (value === null) return '—';
  return formatMoneyMinor(value, currency);
}

/**
 * The versioned terms of reference plus the gateway account and metadata the
 * contract already returns (FR-33). The browser holds no gateway secret; the
 * dialog reads only the existing terms route and renders its newest version.
 */
export function TermsDialog({
  offering,
  onClose,
}: {
  offering: { readonly offeringId: string; readonly name: string } | null;
  onClose: () => void;
}) {
  const styles = useOfferingsStyles();
  const { formatDate, formatInstant } = useDateTimeFormat();
  const { baseUrl, session } = useSession();
  const token = session?.token ?? '';

  const termsQuery = useQuery({
    queryKey: ['offerings', baseUrl, 'terms', offering?.offeringId],
    queryFn: ({ signal }) => listOfferingTerms(baseUrl, token, offering!.offeringId, signal),
    enabled: Boolean(offering && token),
  });

  const terms = termsQuery.data?.[0];
  const metadata = terms?.gatewayMetadata ?? null;

  return (
    <Dialog
      open={offering !== null}
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface className={styles.dialogSurface}>
        <DialogBody>
          <DialogTitle>Terms of reference · {offering?.name ?? 'Offering'}</DialogTitle>
          <DialogContent>
            {termsQuery.isPending ? (
              <div className={styles.state}>
                <Spinner label="Loading the terms…" />
              </div>
            ) : termsQuery.isError ? (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>The terms could not be loaded</MessageBarTitle>
                  {termsQuery.error instanceof Error
                    ? termsQuery.error.message
                    : 'Check the API connection and try again.'}
                  <Button
                    size="small"
                    appearance="transparent"
                    onClick={() => {
                      void termsQuery.refetch();
                    }}
                  >
                    Retry
                  </Button>
                </MessageBarBody>
              </MessageBar>
            ) : !terms ? (
              <Text>No published terms version was returned.</Text>
            ) : (
              <>
                <dl className={styles.termsGrid}>
                  <div className={styles.termsRow}>
                    <dt className={styles.termsLabel}>Version</dt>
                    <dd>{terms.version}</dd>
                  </div>
                  <div className={styles.termsRow}>
                    <dt className={styles.termsLabel}>Name</dt>
                    <dd>{terms.name?.trim() || '—'}</dd>
                  </div>
                  <div className={styles.termsRow}>
                    <dt className={styles.termsLabel}>Kind</dt>
                    <dd>{kindLabel(terms.kind)}</dd>
                  </div>
                  <div className={styles.termsRow}>
                    <dt className={styles.termsLabel}>Currency</dt>
                    <dd>{terms.currency}</dd>
                  </div>
                  <div className={styles.termsRow}>
                    <dt className={styles.termsLabel}>Target</dt>
                    <dd>{moneyOrDash(terms.targetMinor, terms.currency)}</dd>
                  </div>
                  <div className={styles.termsRow}>
                    <dt className={styles.termsLabel}>Default amount</dt>
                    <dd>{moneyOrDash(terms.defaultAmountMinor, terms.currency)}</dd>
                  </div>
                  <div className={styles.termsRow}>
                    <dt className={styles.termsLabel}>Starts</dt>
                    <dd>{terms.startsOn ? formatDate(terms.startsOn) : '—'}</dd>
                  </div>
                  <div className={styles.termsRow}>
                    <dt className={styles.termsLabel}>Ends</dt>
                    <dd>{terms.endsOn ? formatDate(terms.endsOn) : '—'}</dd>
                  </div>
                  <div className={styles.termsRow}>
                    <dt className={styles.termsLabel}>Available until</dt>
                    <dd>{terms.availableUntil ? formatDate(terms.availableUntil) : '—'}</dd>
                  </div>
                  <div className={styles.termsRow}>
                    <dt className={styles.termsLabel}>Gateway account</dt>
                    <dd>{terms.gatewayAccount ?? '—'}</dd>
                  </div>
                </dl>

                <section aria-label="Purpose">
                  <h3 className={styles.panelTitle}>Purpose</h3>
                  <Text>{terms.purpose}</Text>
                </section>

                {terms.scripture ? (
                  <section aria-label="Scripture">
                    <h3 className={styles.panelTitle}>Scripture</h3>
                    <Text>{terms.scripture}</Text>
                  </section>
                ) : null}

                <section aria-label="Gateway metadata">
                  <h3 className={styles.panelTitle}>Gateway metadata</h3>
                  {metadata ? (
                    <dl className={styles.termsGrid}>
                      {Object.entries(metadata).map(([key, value]) => (
                        <div key={key} className={styles.termsRow}>
                          <dt className={styles.termsLabel}>{key}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <Text className={styles.muted}>No metadata on this version.</Text>
                  )}
                </section>

                <Text size={200} className={styles.muted}>
                  Published {formatInstant(terms.createdAt)} by {terms.createdBy}
                  {terms.reason ? ` · ${terms.reason}` : ''}
                </Text>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
