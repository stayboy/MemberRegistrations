import {
  Badge,
  Button,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Text,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isUnauthorized } from '../api/errors';
import {
  RELATIONSHIP_TYPES,
  addMemberRelationship,
  listGuardianCandidates,
  removeMemberRelationship,
  type MemberDetail,
  type MemberGuardian,
  type RelationshipType,
} from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MemberPicker } from '../components/MemberPicker';
import { memberLabelFromName } from '../format/member';
import { useMemberDetailStyles } from './member-detail-styles';

const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  spouse: 'Spouse',
  parent: 'Parent',
  child: 'Child',
  guardian: 'Guardian',
  other: 'Other',
};

/** The link type the form handles itself; the rest are added through this section too. */
const ADDABLE_TYPES = RELATIONSHIP_TYPES.filter((type) => type !== 'guardian');

function candidateLabel(candidate: MemberGuardian): string {
  const via = candidate.via.length > 0 ? ` · via ${candidate.via.filter(Boolean).join(' → ')}` : '';
  return `${candidate.memberNo} · ${candidate.name} · ${candidate.contactMasked}${via}`;
}

export interface MemberFormRelationshipsSectionProps {
  /** Edit only: the loaded record. On create the member does not exist yet. */
  readonly member?: MemberDetail;
  /** The member number being edited, or the typed one on create (it excludes nothing when new). */
  readonly forMemberNo: string;
  /**
   * Create: the chosen guardian rides the create payload (MR-38), so the control is a
   * value. Edit: every change applies immediately through the relationship endpoints.
   */
  readonly guardianMemberNo: string;
  readonly onGuardianChange: (memberNo: string) => void;
  readonly guardianError?: string;
  readonly contactCount: number;
}

/**
 * The **Relationships** section of the add/edit form (MR-42). The guardian is the
 * one link reachability needs, so it is picked from the eligible adults the API
 * offers and, on create, travels with the member; on edit it is an immediate
 * relationship write, like every other link here.
 */
export function MemberFormRelationshipsSection({
  member,
  forMemberNo,
  guardianMemberNo,
  onGuardianChange,
  guardianError,
  contactCount,
}: MemberFormRelationshipsSectionProps) {
  const styles = useMemberDetailStyles();
  const { baseUrl, session, signOut } = useSession();
  const queryClient = useQueryClient();
  const token = session?.token ?? '';
  const isEdit = Boolean(member);

  const [addOpen, setAddOpen] = useState(false);
  const [relatedMemberNo, setRelatedMemberNo] = useState<string | null>(null);
  const [type, setType] = useState<RelationshipType | ''>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const candidatesQuery = useQuery({
    queryKey: ['member-form', baseUrl, 'guardians', forMemberNo],
    queryFn: ({ signal }) =>
      listGuardianCandidates(baseUrl, token, forMemberNo || undefined, signal),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (isUnauthorized(candidatesQuery.error)) void signOut();
  }, [candidatesQuery.error, signOut]);

  const addMutation = useMutation({
    mutationFn: (input: { relatedMemberNo: string; type: RelationshipType }) =>
      addMemberRelationship(baseUrl, token, member!.memberNo, input),
  });

  const removeMutation = useMutation({
    mutationFn: (relationshipId: string) =>
      removeMemberRelationship(baseUrl, token, member!.memberNo, relationshipId),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['member', baseUrl, member?.memberNo] });
    void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });
  };

  function fail(error: unknown): void {
    if (isUnauthorized(error)) {
      void signOut();
      return;
    }
    setActionError(
      error instanceof Error && error.message.trim()
        ? error.message
        : 'Check the API connection and try again.',
    );
  }

  function addRelationship(): void {
    if (!relatedMemberNo || !type || addMutation.isPending) return;
    setActionError(null);
    addMutation.mutate(
      { relatedMemberNo, type },
      {
        onSuccess: () => {
          setAddOpen(false);
          setRelatedMemberNo(null);
          setType('');
          invalidate();
        },
        onError: fail,
      },
    );
  }

  function confirmRemove(): void {
    if (!removeId || removeMutation.isPending) return;
    setActionError(null);
    removeMutation.mutate(removeId, {
      onSuccess: () => {
        setRemoveId(null);
        invalidate();
      },
      onError: (error: unknown) => {
        setRemoveId(null);
        fail(error);
      },
    });
  }

  const candidates = candidatesQuery.data ?? [];
  // On edit the guardian is an immediate relationship write; on create it is a value
  // that rides the create payload, so the control reads the form field instead.
  const currentGuardianNo = isEdit ? (member?.guardian?.memberNo ?? '') : guardianMemberNo;
  const guardianEdge = member?.relationships.find(
    (relationship) =>
      relationship.type === 'guardian' && relationship.memberNo === currentGuardianNo,
  );
  const selectedGuardian = candidates.find((candidate) => candidate.memberNo === currentGuardianNo);
  const guardianRequirement =
    contactCount === 0 ? 'Required: this member has no contact of its own.' : 'Optional.';

  async function changeGuardian(next: string): Promise<void> {
    if (!member) {
      onGuardianChange(next);
      return;
    }
    if (next === currentGuardianNo || addMutation.isPending || removeMutation.isPending) return;

    setActionError(null);
    try {
      // AC-MR30: the new link is written first, so the member never loses its only
      // route; the old one then goes through the existing relationship endpoint.
      if (next) {
        await addMutation.mutateAsync({ relatedMemberNo: next, type: 'guardian' });
      }
      if (guardianEdge) {
        await removeMutation.mutateAsync(guardianEdge.id);
      }
      invalidate();
    } catch (error) {
      fail(error);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="member-form-relationships-heading">
      <div className={styles.sectionHeader}>
        <h3 id="member-form-relationships-heading" className={styles.sectionTitle}>
          Relationships{' '}
          {isEdit ? (
            <Badge appearance="tint" color="informative" size="small" data-testid="saved-as-you-go">
              Saved as you go
            </Badge>
          ) : null}
        </h3>
        <Text size={200} className={styles.muted}>
          A guardian is an adult the register can reach: someone with their own contact, or a chain
          of at most three links that ends at one. {guardianRequirement}
        </Text>
      </div>

      {actionError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The relationship was not changed</MessageBarTitle>
            {actionError}
          </MessageBarBody>
        </MessageBar>
      ) : null}

      <Field
        label="Guardian"
        required={contactCount === 0}
        validationState={guardianError ? 'error' : 'none'}
        validationMessage={guardianError}
        hint={
          candidatesQuery.isError
            ? 'The eligible adults could not be loaded.'
            : 'Only adults the register can reach are offered.'
        }
      >
        <Dropdown
          value={
            selectedGuardian
              ? candidateLabel(selectedGuardian)
              : currentGuardianNo
                ? currentGuardianNo
                : 'No guardian'
          }
          selectedOptions={currentGuardianNo ? [currentGuardianNo] : []}
          disabled={candidatesQuery.isPending && candidates.length === 0}
          onOptionSelect={(_, data) => {
            if (isEdit) {
              void changeGuardian(data.optionValue ?? '');
              return;
            }
            onGuardianChange(data.optionValue ?? '');
          }}
        >
          <Option value="">No guardian</Option>
          {candidates.map((candidate) => (
            <Option
              key={candidate.memberNo}
              value={candidate.memberNo}
              text={candidateLabel(candidate)}
            >
              {candidateLabel(candidate)}
            </Option>
          ))}
        </Dropdown>
      </Field>

      {isEdit && member ? (
        <>
          {member.relationships.length === 0 ? (
            <Text size={200} className={styles.muted}>
              No relationships recorded
            </Text>
          ) : (
            <ul className={styles.panelList} aria-label="Relationships">
              {member.relationships.map((relationship) => (
                <li key={relationship.id} className={styles.panelRow}>
                  <span className={styles.panelRowInline}>
                    <Text>
                      {memberLabelFromName(
                        relationship.name || relationship.memberNo,
                        relationship.gender,
                        relationship.age,
                      )}
                    </Text>
                    <Text size={200} className={styles.muted}>
                      {RELATIONSHIP_TYPE_LABELS[relationship.type]} · {relationship.memberNo}
                    </Text>
                  </span>
                  <Button
                    size="small"
                    appearance="transparent"
                    aria-label={`Remove relationship with ${relationship.memberNo}`}
                    onClick={() => setRemoveId(relationship.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {addOpen ? (
            <div className={styles.panelAddRow}>
              <div className={styles.addField}>
                <MemberPicker
                  value={relatedMemberNo}
                  onChange={(value) => {
                    setRelatedMemberNo(value);
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
                    const next = ADDABLE_TYPES.find((option) => option === data.optionValue);
                    if (next) setType(next);
                  }}
                >
                  {ADDABLE_TYPES.map((option) => (
                    <Option key={option} value={option}>
                      {RELATIONSHIP_TYPE_LABELS[option]}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Button
                icon={<AddRegular />}
                appearance="primary"
                onClick={addRelationship}
                disabled={!relatedMemberNo || !type || addMutation.isPending}
              >
                Add relationship
              </Button>
              <Button
                appearance="transparent"
                onClick={() => setAddOpen(false)}
                disabled={addMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className={styles.panelFoot}>
              <Button
                icon={<AddRegular />}
                appearance="secondary"
                onClick={() => setAddOpen(true)}
                id="member-form-relationship-add"
              >
                Add relationship
              </Button>
              <Text size={200} className={styles.muted}>
                Changes here apply immediately; the form&apos;s save does not carry them.
              </Text>
            </div>
          )}
        </>
      ) : (
        <Text size={200} className={styles.muted}>
          Other relationships can be added from the member record once the member exists. The
          guardian chosen here is written with the member.
        </Text>
      )}

      <ConfirmDialog
        open={removeId !== null}
        title="Remove this relationship?"
        message="The link is removed. The member record itself stays. The last guardian of a member with no own contact cannot be removed."
        confirmLabel="Remove relationship"
        busy={removeMutation.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveId(null)}
      />
    </section>
  );
}
