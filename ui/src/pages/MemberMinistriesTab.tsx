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
import { AddRegular, DismissRegular } from '@fluentui/react-icons';
import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import { isUnauthorized } from '../api/errors';
import type { MemberDetail, Ministry, MinistryRef } from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { errorMessage, inlineActionError } from './member-detail-errors';
import { useMemberDetailStyles } from './member-detail-styles';

export interface MemberMinistriesTabProps {
  readonly member: MemberDetail;
  readonly ministries: readonly Ministry[];
  readonly ministriesLoading: boolean;
  readonly ministriesError: string | null;
  readonly addMutation: UseMutationResult<MinistryRef, unknown, string>;
  readonly removeMutation: UseMutationResult<void, unknown, string>;
  readonly onInvalidate: () => void;
}

/**
 * Member-detail **Ministries** tab (FR-29): the assigned list plus add from the
 * `GET /v1/ministries` reference list and remove with confirmation. Removing an
 * assignment is not deleting the ministry; MemberDetailPage owns the queries and
 * mutations.
 */
export function MemberMinistriesTab({
  member,
  ministries,
  ministriesLoading,
  ministriesError,
  addMutation,
  removeMutation,
  onInvalidate,
}: MemberMinistriesTabProps) {
  const styles = useMemberDetailStyles();
  const { signOut } = useSession();

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
          Ministries
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
        <Text className={styles.muted}>No ministries assigned.</Text>
      ) : (
        <ul className={styles.entryList} aria-label="Assigned ministries">
          {member.ministries.map((ministry) => (
            <li key={ministry.code}>
              <span className={styles.entry}>
                <Badge appearance="outline" color="informative" title={ministry.name}>
                  {ministry.code} · {ministry.name}
                </Badge>
                <Button
                  size="small"
                  appearance="transparent"
                  icon={<DismissRegular />}
                  aria-label={`Remove ${ministry.code}`}
                  onClick={() => setRemoveTarget(ministry)}
                >
                  Remove
                </Button>
              </span>
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

      <div className={styles.addRow}>
        <Field
          label="Add ministry"
          className={styles.addField}
          hint="Assign an active ministry from the reference list."
        >
          <Dropdown
            value={selected ? `${selected.code} · ${selected.name}` : 'Select a ministry'}
            selectedOptions={selected ? [selected.code] : []}
            disabled={ministriesLoading || available.length === 0}
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
        </Field>
        <Button
          icon={<AddRegular />}
          appearance="primary"
          data-testid="ministry-add"
          onClick={addMinistry}
          disabled={!selected || addMutation.isPending}
        >
          Add ministry
        </Button>
      </div>
      {!ministriesLoading && !ministriesError && available.length === 0 ? (
        <Text size={200} className={styles.muted}>
          No unassigned active ministries remain.
        </Text>
      ) : null}

      <ConfirmDialog
        open={removeTarget !== null}
        title={removeTarget ? `Remove ${removeTarget.code}?` : 'Remove ministry?'}
        message={
          removeTarget
            ? `${removeTarget.code} · ${removeTarget.name} is unassigned from this member. The ministry itself stays in the reference list.`
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
