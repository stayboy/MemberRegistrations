import { Text } from '@fluentui/react-components';
import type { UssdPreview as UssdPreviewData } from '../../format/offerings';
import { useOfferingsStyles } from './offerings-styles';

const SHORTCODE = '*714*88#';

/**
 * The one-line dashboard USSD preview composed from the events list (R8): the
 * current or next session, at most five offering rows plus `0 More`, and a
 * pinned preview-only caption. It opens no USSD session and carries no handset
 * chrome.
 */
export function UssdPreview({
  preview,
  formatDate,
}: {
  preview: UssdPreviewData | null;
  formatDate: (value: string | null | undefined) => string;
}) {
  const styles = useOfferingsStyles();
  const menu = preview
    ? preview.lines.filter((line) => !line.startsWith('Choose')).join(' · ')
    : null;

  return (
    <section className={styles.panel} aria-label="USSD preview">
      <div className={styles.ussdStripBody}>
        <div className={styles.ussdScroll}>
          <Text className={styles.ussdEyebrow}>USSD · upcoming</Text>
          <Text className={styles.ussdCode}>{SHORTCODE}</Text>
          {preview ? (
            <>
              <Text>
                {preview.eventName} · {formatDate(preview.sessionDate)}
              </Text>
              <Text className={styles.ussdMenu}>{menu}</Text>
            </>
          ) : (
            <Text className={styles.muted}>No upcoming event to preview.</Text>
          )}
        </div>
        <Text className={styles.ussdCaption}>Preview only; no USSD session is opened.</Text>
      </div>
    </section>
  );
}
