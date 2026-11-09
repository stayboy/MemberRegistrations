import { Card, Skeleton, SkeletonItem } from '@fluentui/react-components';
import { useOfferingsStyles } from './offerings-styles';

/**
 * The landing's loading shape: four KPI skeletons and two panel skeletons,
 * matching the dashboard grid so the page does not jump when the summary
 * arrives.
 */
export function OfferingsSkeleton() {
  const styles = useOfferingsStyles();

  return (
    <>
      <section className={styles.skeletonGrid} aria-label="Loading offerings" aria-busy="true">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className={styles.skeletonTile}>
            <Skeleton>
              <SkeletonItem size={8} style={{ width: '60%' }} />
              <SkeletonItem size={28} style={{ width: '80%', marginTop: '8px' }} />
              <SkeletonItem size={8} style={{ width: '70%', marginTop: '12px' }} />
            </Skeleton>
          </Card>
        ))}
      </section>

      <section className={styles.panel} aria-label="Loading breakdown" aria-busy="true">
        <div className={styles.panelHeader}>
          <Skeleton>
            <SkeletonItem size={12} style={{ width: '140px' }} />
          </Skeleton>
        </div>
        <div className={styles.skeletonStack}>
          <Skeleton>
            <SkeletonItem size={12} style={{ width: '100%' }} />
            <SkeletonItem size={12} style={{ width: '100%', marginTop: '8px' }} />
            <SkeletonItem size={12} style={{ width: '100%', marginTop: '8px' }} />
          </Skeleton>
        </div>
      </section>

      <section className={styles.panel} aria-label="Loading pledge worklist" aria-busy="true">
        <div className={styles.panelHeader}>
          <Skeleton>
            <SkeletonItem size={12} style={{ width: '160px' }} />
          </Skeleton>
        </div>
        <div className={styles.skeletonStack}>
          <Skeleton>
            <SkeletonItem size={12} style={{ width: '100%' }} />
            <SkeletonItem size={12} style={{ width: '100%', marginTop: '8px' }} />
            <SkeletonItem size={12} style={{ width: '100%', marginTop: '8px' }} />
          </Skeleton>
        </div>
      </section>
    </>
  );
}
