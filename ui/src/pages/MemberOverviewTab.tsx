import { Avatar, Badge, Text } from '@fluentui/react-components';
import type { MemberDetail } from '../api/members';
import { formatDateLong, memberInitials, memberName } from '../format/member';
import { genderLabel } from '../format/member-form';
import { useMemberDetailStyles } from './member-detail-styles';

/**
 * Member-detail **Overview** tab (FR-29): identity, residence, flags and
 * joined date. It is presentational; MemberDetailPage owns the detail query.
 */
export function MemberOverviewTab({ member }: { member: MemberDetail }) {
  const styles = useMemberDetailStyles();
  const isArchived = Boolean(member.archivedAt);

  return (
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
            {member.isPresbyter ? (
              <Badge appearance="tint" color="informative">
                Presbyter
              </Badge>
            ) : null}
            <Badge appearance="outline" color={isArchived ? 'warning' : 'success'}>
              {isArchived ? 'Archived' : 'Active'}
            </Badge>
          </div>
          <Text size={200} className={styles.muted}>
            {member.memberNo}
            {member.archivedAt ? ` · archived ${formatDateLong(member.archivedAt)}` : ''}
          </Text>
        </div>
      </div>
      <h2 id="member-identity-heading" className={styles.sectionTitle}>
        Identity
      </h2>
      <div className={styles.detailGrid}>
        <DetailItem label="Member number" value={member.memberNo} />
        <DetailItem label="Gender" value={genderLabel(member.gender)} />
        <DetailItem
          label="Joined"
          value={member.joinedOn ? formatDateLong(member.joinedOn) : '—'}
        />
        <DetailItem label="Place of residence" value={member.placeOfResidence ?? ''} />
        <DetailItem label="Presbyter" value={member.isPresbyter ? 'Yes' : 'No'} />
        <DetailItem label="Date of birth" value={member.dob ? formatDateLong(member.dob) : '—'} />
        <DetailItem label="Other names" value={member.otherNames ?? ''} />
        <DetailItem label="Maiden name" value={member.maidenName ?? ''} />
        <DetailItem label="Alias" value={member.alias ?? ''} />
        <DetailItem label="Address line" value={member.addressLine ?? ''} />
      </div>
    </section>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  const styles = useMemberDetailStyles();
  return (
    <div className={styles.detailItem}>
      <Text className={styles.detailLabel}>{label}</Text>
      <Text className={styles.detailValue}>{value || '—'}</Text>
    </div>
  );
}
