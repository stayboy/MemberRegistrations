import { Button, Text } from '@fluentui/react-components';
import { Link } from 'react-router-dom';
import { useUssdStyles } from './ussd-styles';

/**
 * The compact Pledges panel on the count page: a record action and the link to
 * the landing worklist. The session-scoped pledge list is not built until the
 * additive `offeringId`/`eventId` filter is authorised.
 */
export function PledgeRecordPanel({ onRecord }: { onRecord: () => void }) {
  const styles = useUssdStyles();

  return (
    <section className={styles.panel} aria-label="Record a pledge">
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Pledges</h2>
        <div className={styles.badgeRow}>
          <Text size={200} className={styles.muted}>
            Recorded here · followed up in Offerings
          </Text>
          <Button size="small" appearance="primary" onClick={onRecord}>
            Record pledge
          </Button>
        </div>
      </div>
      <div className={styles.panelBody}>
        <Text size={200} className={styles.muted}>
          Pledges are member-level promises and are not counted cash. Recorded pledges appear in the{' '}
          <Link className={styles.link} to="/events/offerings">
            Offerings pledge worklist
          </Link>
          .
        </Text>
      </div>
    </section>
  );
}
