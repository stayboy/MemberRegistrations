import {
  Button,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Switch,
  Text,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  RELATIONSHIP_TYPES,
  type MemberDetail,
  type MemberRelationship,
  type RelationshipInput,
  type RelationshipType,
} from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MemberPicker } from '../components/MemberPicker';
import { memberLabelFromName } from '../format/member';
import { errorMessage, inlineActionError } from './member-detail-errors';
import { useMemberDetailStyles } from './member-detail-styles';

const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  spouse: 'Spouse',
  parent: 'Parent',
  child: 'Child',
  guardian: 'Guardian',
  other: 'Other',
};

function relationshipLabel(relationship: MemberRelationship): string {
  return memberLabelFromName(
    relationship.name || relationship.memberNo,
    relationship.gender,
    relationship.age,
  );
}

export interface MemberRelationshipsSectionProps {
  readonly member: MemberDetail;
  readonly addMutation: UseMutationResult<MemberRelationship, unknown, RelationshipInput>;
  readonly removeMutation: UseMutationResult<void, unknown, string>;
  readonly onInvalidate: () => void;
}

/**
 * The overview's fixed **Relationships** panel (FR-29): the detail's edges with
 * add from a `MemberPicker`, a `RELATIONSHIP_TYPES` dropdown and the optional
 * dependent flag, and remove with confirmation. Removing deletes the edge, never
 * the member; MemberDetailPage owns the queries and mutations.
 */
export function MemberRelationshipsSection({
  member,
  addMutation,
  removeMutation,
  onInvalidate,
}: MemberRelationshipsSectionProps) {
  const styles = useMemberDetailStyles();
  const { signOut } = useSession();

  const [addOpen, setAddOpen] = useState(false);
  const [relatedMemberNo, setRelatedMemberNo] = useState<string | null>(null);
  const [type, setType] = useState<RelationshipType | ''>('');
  const [isDependent, setIsDependent] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberRelationship | null>(null);

  function fail(error: unknown, fallback: string): void {
    if (isUnauthorized(error)) {
      void signOut();
      return;
    }
    setActionError(inlineActionError(error, fallback));
  }

  function closeAdd(): void {
    setAddOpen(false);
    setRelatedMemberNo(null);
    setType('');
    setIsDependent(false);
  }

  function addRelationship(): void {
    if (!relatedMemberNo || !type || addMutation.isPending) return;

    setActionError(null);
    addMutation.mutate(
      { relatedMemberNo, type, isDependent },
      {
        onSuccess: () => {
          closeAdd();
          onInvalidate();
        },
        onError: (error: unknown) => {
          fail(error, errorMessage(error));
        },
      },
    );
  }

  function confirmRemove(): void {
    if (!removeTarget || removeMutation.isPending) return;

    setActionError(null);
    removeMutation.mutate(removeTarget.id, {
      onSuccess: () => {
        setRemoveTarget(null);
        onInvalidate();
      },
      onError: (error: unknown) => {
        setRemoveTarget(null);
        fail(error, errorMessage(error));
      },
    });
  }

  return (
    <section className={styles.section} aria-labelledby="member-relationships-heading">
      <div className={styles.sectionHeader}>
        <h2 id="member-relationships-heading" className={styles.sectionTitle}>
          Relationships <span className={styles.sectionCount}>{member.relationships.length}</span>
        </h2>
      </div>

      {actionError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The relationship was not changed</MessageBarTitle>
            {actionError}
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {member.relationships.length === 0 ? (
        <Text className={styles.muted}>No relationships recorded</Text>
      ) : (
        <ul className={styles.panelList} aria-label="Relationships">
          {member.relationships.map((relationship) => {
            const label = relationshipLabel(relationship);
            const descriptor = relationship.isDependent
              ? 'Dependent'
              : RELATIONSHIP_TYPE_LABELS[relationship.type];

            return (
              <li key={relationship.id} className={styles.panelRow}>
                <span className={styles.panelRowInline}>
                  <Link to={`/members/${encodeURIComponent(relationship.memberNo)}`}>{label}</Link>
                  <Text size={200} className={styles.muted}>
                    {descriptor} · {relationship.memberNo}
                  </Text>
                  {relationship.archived ? (
                    <Text size={200} className={styles.muted}>
                      Archived
                    </Text>
                  ) : null}
                </span>
                <Button
                  size="small"
                  appearance="transparent"
                  aria-label={`Remove relationship with ${label}`}
                  onClick={() => setRemoveTarget(relationship)}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {addOpen ? (
        <div className={styles.panelAddRow}>
          <div className={styles.addField}>
            <MemberPicker
              value={relatedMemberNo}
              onChange={(memberNo) => {
                setRelatedMemberNo(memberNo);
                setActionError(null);
              }}
              label="Related member"
              excludeMemberNo={member.memberNo}
              disabled={addMutation.isPending}
            />
          </div>
          <Field label="Relationship" className={styles.addField}>
            <Dropdown
              value={type ? RELATIONSHIP_TYPE_LABELS[type] : 'Select a relationship'}
              selectedOptions={type ? [type] : []}
              disabled={addMutation.isPending}
              onOptionSelect={(_, data) => {
                const next = RELATIONSHIP_TYPES.find((option) => option === data.optionValue);
                if (next) setType(next);
              }}
            >
              {RELATIONSHIP_TYPES.map((option) => (
                <Option key={option} value={option}>
                  {RELATIONSHIP_TYPE_LABELS[option]}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="Dependent">
            <Switch
              checked={isDependent}
              disabled={addMutation.isPending}
              onChange={(_, data) => setIsDependent(data.checked)}
              label={isDependent ? 'Yes' : 'No'}
            />
          </Field>
          <Button
            icon={<AddRegular />}
            appearance="primary"
            data-testid="relationship-add"
            onClick={addRelationship}
            disabled={!relatedMemberNo || !type || addMutation.isPending}
          >
            Add relationship
          </Button>
          <Button appearance="transparent" onClick={closeAdd} disabled={addMutation.isPending}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className={styles.panelFoot}>
          <Button
            icon={<AddRegular />}
            appearance="secondary"
            onClick={() => setAddOpen(true)}
            id="member-relationships-add"
          >
            Add relationship
          </Button>
        </div>
      )}

      <Text size={200} className={styles.muted}>
        Removing deletes the link, never the member.
      </Text>

      <ConfirmDialog
        open={removeTarget !== null}
        title={removeTarget ? `Remove ${relationshipLabel(removeTarget)}?` : 'Remove relationship?'}
        message={
          removeTarget
            ? `The ${
                removeTarget.isDependent
                  ? 'dependent'
                  : RELATIONSHIP_TYPE_LABELS[removeTarget.type].toLowerCase()
              } relationship with ${relationshipLabel(removeTarget)} is removed. The member record itself stays.`
            : ''
        }
        confirmLabel="Remove relationship"
        busy={removeMutation.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </section>
  );
}
