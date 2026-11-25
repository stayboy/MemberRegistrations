import {
  Button,
  Dropdown,
  Field,
  InteractionTag,
  InteractionTagPrimary,
  InteractionTagSecondary,
  Option,
  Spinner,
  TagGroup,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { listAudiences, type AudienceItem } from '../api/audiences';
import { isUnauthorized } from '../api/errors';
import { useSession } from '../auth/SessionProvider';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { AudienceDialog } from './AudienceDialog';

const useStyles = makeStyles({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  row: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalS,
  },
  field: {
    minWidth: '280px',
    flexGrow: 1,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    paddingTop: tokens.spacingVerticalXS,
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
});

export interface AudienceSetPickerProps {
  /** The ordered audience ids; the first is the primary. */
  readonly value: readonly string[];
  readonly onChange: (audienceIds: string[]) => void;
  /** The UTC date each chip's own count is evaluated at (the first resolved date). */
  readonly countAt?: string;
  readonly validationState?: 'none' | 'error' | 'warning' | 'success';
  readonly validationMessage?: string;
}

/**
 * The ordered **Audience** set (FR-42c, AC-57, AC-60, AC-7). Feature component:
 * it owns the `GET /v1/audiences` read and the New audience dialog; the caller
 * owns the ordered ids.
 *
 * Composition is intersection - a member is in the event only when they match
 * every audience - so the chips carry each audience's **own** count at the first
 * resolved date and never a union total: the parts do not sum. Every name and
 * summary is the server's; the rule is never evaluated here.
 */
export function AudienceSetPicker({
  value,
  onChange,
  countAt,
  validationState,
  validationMessage,
}: AudienceSetPickerProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { formatDate } = useDateTimeFormat();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const [dialogOpen, setDialogOpen] = useState(false);

  const audiencesQuery = useQuery({
    queryKey: ['audiences', baseUrl, countAt ?? 'now'],
    queryFn: ({ signal }) =>
      listAudiences(baseUrl, token, { includeArchived: true, countAt, signal }),
    enabled: Boolean(token),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isUnauthorized(audiencesQuery.error)) void signOut();
  }, [audiencesQuery.error, signOut]);

  const [createdAudiences, setCreatedAudiences] = useState<AudienceItem[]>([]);
  const audiences = useMemo(() => {
    const loaded = audiencesQuery.data ?? [];
    const missing = createdAudiences.filter(
      (created) => !loaded.some((audience) => audience.id === created.id),
    );
    return missing.length > 0 ? [...loaded, ...missing] : loaded;
  }, [audiencesQuery.data, createdAudiences]);

  const offered = audiences.filter((audience) => audience.active || value.includes(audience.id));

  // FR-42c: the form opens on the seeded `Everyone` group; the id is what the
  // create body carries, and the summary stays the server's.
  const loadedAudiences = audiencesQuery.data;
  useEffect(() => {
    const items = loadedAudiences ?? [];
    if (value.length > 0 || items.length === 0) return;
    const fallback = items.find((audience) => audience.systemKey === 'everyone') ?? items[0];
    if (fallback) onChange([fallback.id]);
  }, [loadedAudiences, onChange, value.length]);

  /**
   * Adding one audience at a time keeps the operator's order: the primary never
   * moves because a later choice was made.
   */
  function addAudience(audienceId: string): void {
    if (!audienceId || value.includes(audienceId)) return;
    onChange([...value, audienceId]);
  }

  function remove(audienceId: string): void {
    onChange(value.filter((id) => id !== audienceId));
  }

  function selectCreated(audience: AudienceItem): void {
    // Show the new audience immediately, and select it, so the picker never
    // reads blank between the create and the refetch that follows.
    setCreatedAudiences((current) => [...current, audience]);
    onChange([...value, audience.id]);
    void queryClient.invalidateQueries({ queryKey: ['audiences', baseUrl] });
  }

  const selected = value
    .map((id) => audiences.find((audience) => audience.id === id))
    .filter((audience): audience is AudienceItem => Boolean(audience));

  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <div className={styles.field}>
          <Field
            label="Audience"
            required
            hint="A member is in the event when they match every audience; the first is the primary."
            validationState={validationState}
            validationMessage={validationMessage}
          >
            <Dropdown
              aria-label="Audience"
              value={audiencesQuery.isPending ? 'Loading audiences…' : 'Choose an audience to add'}
              selectedOptions={[]}
              disabled={audiencesQuery.isPending || audiences.length === 0}
              onOptionSelect={(_, data) => addAudience(data.optionValue ?? '')}
            >
              {offered
                .filter((audience) => !value.includes(audience.id))
                .map((audience) => (
                  <Option key={audience.id} value={audience.id} text={audience.summary}>
                    {audience.summary}
                  </Option>
                ))}
            </Dropdown>
          </Field>
        </div>

        <Button
          icon={<AddRegular />}
          appearance="secondary"
          onClick={() => setDialogOpen(true)}
          disabled={!token}
        >
          New audience
        </Button>

        {audiencesQuery.isPending ? <Spinner size="tiny" aria-hidden /> : null}
      </div>

      {selected.length > 0 ? (
        <TagGroup aria-label="Chosen audiences" className={styles.chips}>
          {selected.map((audience, index) => {
            const secondaryText = [
              index === 0 ? 'Primary' : null,
              audience.memberCount === undefined ? null : `${audience.memberCount} members`,
            ]
              .filter((part): part is string => Boolean(part))
              .join(' · ');
            return (
              <InteractionTag key={audience.id} size="medium">
                <InteractionTagPrimary
                  hasSecondaryAction
                  primaryText={audience.name}
                  secondaryText={secondaryText || undefined}
                />
                <InteractionTagSecondary
                  aria-label={`Remove ${audience.name}`}
                  onClick={() => remove(audience.id)}
                />
              </InteractionTag>
            );
          })}
        </TagGroup>
      ) : null}

      <Text size={200} className={styles.hint}>
        {countAt
          ? `Each audience's own count is the register's at ${formatDate(countAt)}. `
          : "Each audience's own count appears once the first date resolves. "}
        The parts do not sum, and ministry and presbyter status are read as of today. Saving an
        empty intersection is allowed: the emptiness is the data.
      </Text>

      {audiencesQuery.isError ? (
        <Text size={200} role="alert" className={styles.error}>
          The audience list is unavailable. Check the API connection and try again.
        </Text>
      ) : null}

      {dialogOpen ? (
        <AudienceDialog onClose={() => setDialogOpen(false)} onCreated={selectCreated} />
      ) : null}
    </div>
  );
}
