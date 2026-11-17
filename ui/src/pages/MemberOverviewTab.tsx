import { Avatar, Badge, Button, Text, Tooltip } from '@fluentui/react-components';
import { CheckmarkCircleFilled } from '@fluentui/react-icons';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  MemberDetail,
  MemberRelationship,
  Ministry,
  MinistryRef,
  RelationshipInput,
} from '../api/members';
import { memberInitials, memberLabelFromName, memberName } from '../format/member';
import { subscriptionKindLabel, subscriptionStatusLabel } from '../format/subscription';
import { overviewCards } from '../overview/cards';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { MemberMinistriesSection } from './MemberMinistriesSection';
import { MemberRelationshipsSection } from './MemberRelationshipsSection';
import { useMemberDetailStyles } from './member-detail-styles';

export interface MemberOverviewTabProps {
  readonly member: MemberDetail;
  readonly ministries: readonly Ministry[];
  readonly ministriesLoading: boolean;
  readonly ministriesError: string | null;
  readonly addMinistryMutation: UseMutationResult<MinistryRef, unknown, string>;
  readonly removeMinistryMutation: UseMutationResult<void, unknown, string>;
  readonly addRelationshipMutation: UseMutationResult<
    MemberRelationship,
    unknown,
    RelationshipInput
  >;
  readonly removeRelationshipMutation: UseMutationResult<void, unknown, string>;
  readonly onInvalidate: () => void;
  readonly onViewSubscriptions: () => void;
}

/**
 * Member-detail **Overview** tab (FR-29, AC-12): four cards across the top, then
 * the identity and membership grids with their fixed ministries, subscriptions
 * and relationships panels. It is presentational; MemberDetailPage owns the
 * detail query and every mutation.
 */
export function MemberOverviewTab({
  member,
  ministries,
  ministriesLoading,
  ministriesError,
  addMinistryMutation,
  removeMinistryMutation,
  addRelationshipMutation,
  removeRelationshipMutation,
  onInvalidate,
  onViewSubscriptions,
}: MemberOverviewTabProps) {
  const styles = useMemberDetailStyles();
  const { formatDate, formatInstant, formatInstantTitle } = useDateTimeFormat();
  const isArchived = Boolean(member.archivedAt);
  const cards = overviewCards(member, { formatDate });

  const title = member.title;
  const membershipRecorded =
    Boolean(member.membershipCardNo) ||
    title !== null ||
    Boolean(member.assemblyJoinedOn) ||
    Boolean(member.cameFrom) ||
    Boolean(member.movedOutOn) ||
    Boolean(member.movedToAssembly);
  const absentMembership = membershipRecorded ? '—' : 'Not recorded';
  const shepherd = member.shepherd
    ? `${memberLabelFromName(member.shepherd.name, member.shepherd.gender, member.shepherd.age)} · assigned ${formatDate(member.shepherd.assignedOn)}`
    : 'No shepherd assigned';
  const verifiedLabel = member.verifiedAt ? `Verified ${formatInstant(member.verifiedAt)}` : null;

  const activeSubscriptions = member.subscriptions.filter(
    (subscription) => subscription.status === 'active',
  );
  const inactiveSubscriptions = member.subscriptions.length - activeSubscriptions.length;
  const nextSubscriptionEnd = activeSubscriptions
    .map((subscription) => subscription.periodEnd)
    .filter((date): date is string => Boolean(date))
    .sort()[0];
  const subscriptionSummary = [
    `${activeSubscriptions.length} active`,
    nextSubscriptionEnd ? `next ends ${formatDate(nextSubscriptionEnd)}` : null,
    inactiveSubscriptions > 0 ? `${inactiveSubscriptions} ended or expired` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <div className={styles.overview}>
      <div className={styles.statCards} aria-label="Attendance and calls">
        {cards.map((card) => (
          <div
            key={card.key}
            role="group"
            aria-label={card.copy}
            className={styles.statCard}
            data-testid={`overview-card-${card.key}`}
          >
            <Text className={styles.statLabel}>{card.label}</Text>
            <div className={styles.statValues}>
              {card.lines.map((line) => (
                <Text
                  key={line}
                  className={
                    card.empty ? `${styles.statValue} ${styles.statEmpty}` : styles.statValue
                  }
                >
                  {line}
                </Text>
              ))}
            </div>
            <Text size={200} className={styles.statCaption}>
              {card.caption}
            </Text>
          </div>
        ))}
      </div>

      <div className={styles.overviewColumns}>
        <div className={styles.overviewColumn}>
          <section className={styles.section} aria-labelledby="member-identity-heading">
            <div className={styles.identityHeader}>
              <Avatar
                name={memberName(member)}
                initials={memberInitials(member)}
                color="colorful"
                size={56}
              />
              <div>
                <div className={styles.nameRow}>
                  <span className={styles.name}>{memberName(member)}</span>
                  {verifiedLabel ? (
                    <Tooltip content={verifiedLabel} relationship="description">
                      <Badge
                        appearance="filled"
                        color="brand"
                        icon={<CheckmarkCircleFilled aria-hidden />}
                        aria-label={verifiedLabel}
                        data-testid="member-verified"
                      />
                    </Tooltip>
                  ) : null}
                  {member.isPresbyter ? (
                    <Badge appearance="tint" color="informative">
                      Presbyter
                    </Badge>
                  ) : null}
                  <Badge
                    appearance="outline"
                    color={isArchived ? 'warning' : 'success'}
                    title={member.archivedAt ? formatInstantTitle(member.archivedAt) : undefined}
                  >
                    {isArchived ? 'Archived' : 'Active'}
                  </Badge>
                </div>
                <Text size={200} className={styles.muted}>
                  {member.memberNo}
                  {member.archivedAt ? (
                    <>
                      {' · archived '}
                      <span title={formatInstantTitle(member.archivedAt)}>
                        {formatInstant(member.archivedAt)}
                      </span>
                    </>
                  ) : (
                    ''
                  )}
                </Text>
              </div>
            </div>

            <h2 id="member-identity-heading" className={styles.sectionTitle}>
              Identity
            </h2>
            <div className={styles.detailGrid}>
              <DetailItem label="Member number" value={member.memberNo} />
              <DetailItem
                label="Joined"
                value={member.joinedOn ? formatDate(member.joinedOn) : '—'}
              />
              <DetailItem label="Date of birth" value={member.dob ? formatDate(member.dob) : '—'} />
              <DetailItem label="Presbyter" value={member.isPresbyter ? 'Yes' : 'No'} />
              <DetailItem label="Place of residence" value={member.placeOfResidence ?? '—'} />
              <DetailItem label="Address line" value={member.addressLine ?? '—'} />
            </div>

            <div className={styles.membershipBlock}>
              <h2 className={styles.sectionTitle}>Membership</h2>
              <div className={styles.detailGrid}>
                <DetailItem label="Membership card" value={member.membershipCardNo ?? '—'} />
                <DetailItem
                  label="Presbyter title"
                  value={title ? `${title.label} ${title.code}` : 'No presbyter title recorded'}
                />
                <DetailItem
                  label="Assembly joined"
                  value={
                    member.assemblyJoinedOn ? formatDate(member.assemblyJoinedOn) : absentMembership
                  }
                />
                <DetailItem label="Came from" value={member.cameFrom ?? absentMembership} />
                <DetailItem
                  label="Moved out"
                  value={member.movedOutOn ? formatDate(member.movedOutOn) : absentMembership}
                />
                <DetailItem label="Moved to" value={member.movedToAssembly ?? absentMembership} />
              </div>
            </div>

            <Text as="p" className={styles.shepherdLine}>
              <span className={styles.shepherdKey}>Shepherd</span>: {shepherd}
            </Text>
          </section>

          <MemberRelationshipsSection
            member={member}
            addMutation={addRelationshipMutation}
            removeMutation={removeRelationshipMutation}
            onInvalidate={onInvalidate}
          />
        </div>

        <div className={styles.overviewColumn}>
          <MemberMinistriesSection
            member={member}
            ministries={ministries}
            ministriesLoading={ministriesLoading}
            ministriesError={ministriesError}
            addMutation={addMinistryMutation}
            removeMutation={removeMinistryMutation}
            onInvalidate={onInvalidate}
          />

          <section
            className={styles.section}
            aria-labelledby="member-overview-subscriptions-heading"
          >
            <div className={styles.sectionHeader}>
              <h2 id="member-overview-subscriptions-heading" className={styles.sectionTitle}>
                Subscriptions
              </h2>
            </div>

            {member.subscriptions.length === 0 ? (
              <Text className={styles.muted}>No subscriptions recorded</Text>
            ) : (
              <>
                <Text size={200} className={styles.muted}>
                  {subscriptionSummary}
                </Text>
                <ul className={styles.panelList} aria-label="Subscriptions">
                  {member.subscriptions.map((subscription) => {
                    const kind = subscriptionKindLabel(subscription.kind);
                    const status = subscriptionStatusLabel(subscription.status);
                    const end =
                      subscription.status === 'active'
                        ? subscription.periodEnd
                          ? `ends ${formatDate(subscription.periodEnd)}`
                          : 'no end date'
                        : subscription.endedOn
                          ? `ended ${formatDate(subscription.endedOn)}`
                          : subscription.periodEnd
                            ? `ended ${formatDate(subscription.periodEnd)}`
                            : 'no end date';

                    return (
                      <li key={subscription.id} className={styles.panelRow}>
                        <span className={styles.panelRowMain}>
                          <Text weight="semibold">
                            {subscription.reference ? `${subscription.reference} · ${kind}` : kind}
                          </Text>
                          <Text size={200} className={styles.muted}>
                            {status} · {end}
                          </Text>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className={styles.panelFoot}>
              <Button size="small" appearance="transparent" onClick={onViewSubscriptions}>
                View all
              </Button>
              <Text size={200} className={styles.muted}>
                Add and end from the Subscriptions tab.
              </Text>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  const styles = useMemberDetailStyles();
  return (
    <div className={styles.detailItem}>
      <Text className={styles.detailLabel}>{label}</Text>
      <Text className={styles.detailValue}>{value}</Text>
    </div>
  );
}
