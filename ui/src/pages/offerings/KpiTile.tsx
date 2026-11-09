import { Badge, Card, Text, type BadgeProps } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { useOfferingsStyles } from './offerings-styles';

/**
 * One landing KPI tile: an eyebrow, one number, an optional badge/micro-visual
 * and one caption. The dashboard grill replaced the four multi-metric cards
 * with four of these; the tiles own the window totals and the breakdown owns
 * the detail.
 */
export function KpiTile({
  label,
  value,
  caption,
  tone,
  badge,
  badgeColor,
  visual,
}: {
  label: string;
  value: string;
  caption: ReactNode;
  tone?: 'negative';
  badge?: string;
  badgeColor?: BadgeProps['color'];
  visual?: ReactNode;
}) {
  const styles = useOfferingsStyles();
  const valueClass = tone === 'negative' ? `${styles.kpiValue} ${styles.kpiValueNegative}` : styles.kpiValue;

  return (
    <Card className={styles.kpi}>
      <Text className={styles.kpiLabel}>{label}</Text>
      <div className={styles.kpiInline}>
        <Text className={valueClass}>{value}</Text>
        {badge ? (
          <Badge appearance="tint" color={badgeColor ?? 'informative'} size="small">
            {badge}
          </Badge>
        ) : null}
      </div>
      {visual}
      <Text className={styles.kpiCaption}>{caption}</Text>
    </Card>
  );
}
