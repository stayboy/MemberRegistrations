import { Text } from '@fluentui/react-components';
import type { UssdPreview as UssdPreviewData } from '../../format/offerings';
import { useOfferingsStyles } from './offerings-styles';

/**
 * The USSD preview composed in the browser from the events list (R8): the
 * current or next session, at most five offering rows and `0 More`. It is a
 * preview only; no USSD session is opened.
 */
export function UssdPreview({
  preview,
  formatDate,
}: {
  preview: UssdPreviewData | null;
  formatDate: (value: string | null | undefined) => string;
}) {
  const styles = useOfferingsStyles();

  return (
    <section className={styles.panel} aria-label="USSD preview">
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>USSD preview</h2>
        <Text size={200} className={styles.muted}>
          Reference menu · five offerings and 0 More
        </Text>
      </div>
      <div className={styles.ussd}>
        {preview ? (
          <>
            <Text size={200} className={styles.muted}>
              {preview.eventName} · {formatDate(preview.sessionDate)}
            </Text>
            <pre className={styles.ussdScreen}>{preview.lines.join('\n')}</pre>
          </>
        ) : (
          <Text className={styles.muted}>No upcoming event to preview.</Text>
        )}
      </div>
    </section>
  );
}
