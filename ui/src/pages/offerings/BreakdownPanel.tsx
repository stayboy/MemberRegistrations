import { Button, Tab, TabList, Text } from '@fluentui/react-components';
import { useState } from 'react';
import type { ChurchOfferingSummary, OfferingSummaryGroup } from '../../api/offerings';
import { GroupTotalsTable } from './GroupTotalsTable';
import { MemberTotalsTable } from './MemberTotalsTable';
import { useOfferingsStyles } from './offerings-styles';

type BreakdownTab = 'offering' | 'event' | 'member';

/**
 * The dashboard's one breakdown panel. Tabs keep the by-offering, by-event and
 * by-member totals reachable without stacking three panels; counted cash is a
 * column only in offering/event and the member tab is the top 10 by paid.
 */
export function BreakdownPanel({
  summary,
  formatDate,
  onViewTerms,
}: {
  summary: ChurchOfferingSummary;
  formatDate: (value: string | null | undefined) => string;
  onViewTerms: (offering: OfferingSummaryGroup) => void;
}) {
  const styles = useOfferingsStyles();
  const [tab, setTab] = useState<BreakdownTab>('offering');

  return (
    <section className={styles.panel} aria-label="Breakdown">
      <div className={styles.breakdownHeader}>
        <h2 className={styles.panelTitle}>Breakdown</h2>
        <TabList
          className={styles.tabList}
          aria-label="Breakdown"
          selectedValue={tab}
          onTabSelect={(_, data) => setTab(data.value as BreakdownTab)}
        >
          <Tab value="offering">By offering</Tab>
          <Tab value="event">By event</Tab>
          <Tab value="member">By member</Tab>
        </TabList>
      </div>

      {tab === 'offering' ? (
        <>
          <GroupTotalsTable
            ariaLabel="Totals by offering"
            nameHeader="Offering"
            currency={summary.currency}
            rows={summary.offerings.map((offering) => ({
              id: offering.offeringId,
              name: offering.name,
              paidMinor: offering.paidMinor,
              pledgedMinor: offering.pledgedMinor,
              outstandingMinor: offering.outstandingMinor,
              countedMinor: offering.countedMinor,
            }))}
            emptyTitle="No offerings in this window"
            emptyHint="Paid gifts or relevant pledges will appear here."
            showShare
            totalPaidMinor={summary.totalPaidMinor}
            renderAction={(row) => (
              <Button
                size="small"
                appearance="transparent"
                onClick={() =>
                  onViewTerms({
                    offeringId: row.id,
                    name: row.name,
                    paidMinor: row.paidMinor,
                    pledgedMinor: row.pledgedMinor,
                    outstandingMinor: row.outstandingMinor,
                    countedMinor: row.countedMinor,
                  })
                }
              >
                View terms
              </Button>
            )}
          />
          <div className={styles.footer}>
            <Text size={200} className={styles.muted}>
              Reconciles to the tiles above.
            </Text>
          </div>
        </>
      ) : null}

      {tab === 'event' ? (
        <>
          <GroupTotalsTable
            ariaLabel="Totals by event"
            nameHeader="Event"
            currency={summary.currency}
            rows={summary.events.map((event) => ({
              id: event.eventId,
              name: event.name,
              paidMinor: event.paidMinor,
              pledgedMinor: event.pledgedMinor,
              outstandingMinor: event.outstandingMinor,
              countedMinor: event.countedMinor,
            }))}
            emptyTitle="No events in this window"
            emptyHint="Paid gifts or relevant pledges will appear here."
          />
          <div className={styles.footer}>
            <Text size={200} className={styles.muted}>
              Reconciles to the tiles above.
            </Text>
          </div>
        </>
      ) : null}

      {tab === 'member' ? (
        <>
          <MemberTotalsTable
            members={summary.members}
            currency={summary.currency}
            formatDate={formatDate}
          />
          <div className={styles.footer}>
            <Text size={200} className={styles.muted}>
              Top 10 by paid · no further page.
            </Text>
          </div>
        </>
      ) : null}
    </section>
  );
}
