import {
  Button,
  Dropdown,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Text,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import { isUnauthorized } from '../api/errors';
import type { MemberDetail, Ministry, MinistryRef } from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { errorMessage, inlineActionError } from './member-detail-errors';
import { useMemberDetailStyles } from './member-detail-styles';

export interface MemberMinistriesSectionProps {
  readonly member: MemberDetail;
  readonly ministries: readonly Ministry[];
  readonly ministriesLoading: boolean;
  readonly ministriesError: string | null;
  readonly addMutation: UseMutationResult<MinistryRef, unknown, string>;
  readonly removeMutation: UseMutationResult<void, unknown, string>;
  readonly onInvalidate: () => void;
}

/**
 * The overview's fixed **Ministries** panel (FR-29): every assignment in detail
 * order with the member's role, `Add` by code from the `GET /v1/ministries`
 * reference list and `Remove` as unassign with confirmation. Removing an
 * assignment is not deleting the ministry or its history; MemberDetailPage owns
 * the queries and mutations.
 */
export function MemberMinistriesSection({
  member,
  ministries,
  ministriesLoading,
  ministriesError,
  addMutation,
  removeMutation,
  onInvalidate,
}: MemberMinistriesSectionProps) {
  const styles = useMemberDetailStyles();
  const { signOut } = useSession();

  const [addOpen, setAddOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MinistryRef | null>(null);

  const assignedCodes = new Set(member.ministries.map((ministry) => ministry.code));
  const available = ministries.filter(
    (ministry) => ministry.active && !assignedCodes.has(ministry.code),
  );
  const selected = available.find((ministry) => ministry.code === selectedCode);

  function fail(error: unknown, fallback: string): void {
    if (isUnauthorized(error)) {
      void signOut();
      return;
    }
    setActionError(inlineActionError(error, fallback));
  }

  function addMinistry(): void {
    if (!selected || addMutation.isPending) return;

    setActionError(null);
    addMutation.mutate(selected.code, {
      onSuccess: () => {
        setSelectedCode('');
        setAddOpen(false);
        onInvalidate();
      },
      onError: (error: unknown) => {
        fail(error, errorMessage(error));
      },
    });
  }

  function confirmRemove(): void {
    if (!removeTarget || removeMutation.isPending) return;

    setActionError(null);
    removeMutation.mutate(removeTarget.code, {
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
    <section className={styles.section} aria-labelledby="member-ministries-heading">
      <div className={styles.sectionHeader}>
        <h2 id="member-ministries-heading" className={styles.sectionTitle}>
          Ministries <span className={styles.sectionCount}>{member.ministries.length}</span>
        </h2>
      </div>

      {actionError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The ministry assignment was not changed</MessageBarTitle>
            {actionError}
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {member.ministries.length === 0 ? (
        <Text className={styles.muted}>No ministries recorded</Text>
      ) : (
        <ul className={styles.panelList} aria-label="Assigned ministries">
          {member.ministries.map((ministry) => (
            <li key={ministry.code} className={styles.panelRow}>
              <span className={styles.panelRowInline}>
                <Text>
                  {ministry.name} ·{' '}
                  <Text as="span" size={200} className={styles.muted}>
                    {ministry.code} · {ministry.position?.label ?? 'No role recorded'}
                  </Text>
                </Text>
              </span>
              <Button
                size="small"
                appearance="transparent"
                aria-label={`Remove ${ministry.name}`}
                onClick={() => setRemoveTarget(ministry)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {ministriesError ? (
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>The ministry list is unavailable</MessageBarTitle>
            {ministriesError}
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {addOpen ? (
        <div className={styles.panelAddRow}>
          <Dropdown
            aria-label="Ministry"
            className={styles.addField}
            value={selected ? `${selected.code} · ${selected.name}` : 'Select a ministry'}
            selectedOptions={selected ? [selected.code] : []}
            disabled={ministriesLoading || available.length === 0 || addMutation.isPending}
            onOptionSelect={(_, data) => {
              setSelectedCode(data.optionValue ?? '');
              setActionError(null);
            }}
          >
            {available.map((ministry) => (
              <Option
                key={ministry.code}
                value={ministry.code}
                text={`${ministry.code} · ${ministry.name}`}
              >
                {ministry.code} · {ministry.name}
              </Option>
            ))}
          </Dropdown>
          <Button
            appearance="primary"
            data-testid="ministry-add"
            onClick={addMinistry}
            disabled={!selected || addMutation.isPending}
          >
            Add
          </Button>
          <Button
            appearance="transparent"
            onClick={() => setAddOpen(false)}
            disabled={addMutation.isPending}
          >
            Cancel
          </Button>
          {!ministriesLoading && !ministriesError && available.length === 0 ? (
            <Text size={200} className={styles.muted}>
              No unassigned active ministries remain.
            </Text>
          ) : null}
        </div>
      ) : (
        <div className={styles.panelFoot}>
          <Button
            icon={<AddRegular />}
            appearance="secondary"
            onClick={() => setAddOpen(true)}
            disabled={ministriesLoading}
            id="member-ministries-add"
          >
            Add
          </Button>
          <Text size={200} className={styles.muted}>
            Assigned by code; removing unassigns.
          </Text>
        </div>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title={removeTarget ? `Remove ${removeTarget.name}?` : 'Remove ministry?'}
        message={
          removeTarget
            ? `${removeTarget.name} (${removeTarget.code}) is unassigned from this member. The ministry itself stays in the reference list.`
            : ''
        }
        confirmLabel="Remove ministry"
        busy={removeMutation.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </section>
  );
}
