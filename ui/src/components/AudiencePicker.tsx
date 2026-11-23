import {
  Button,
  Dropdown,
  Field,
  Option,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { listAudiences, type AudienceItem } from '../api/audiences';
import { isUnauthorized } from '../api/errors';
import { useSession } from '../auth/SessionProvider';
import { AudienceDialog } from './AudienceDialog';

const useStyles = makeStyles({
  row: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalS,
  },
  field: {
    minWidth: '280px',
    flexGrow: 1,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
});

export interface AudiencePickerProps {
  /** The selected audience id; empty until the default `Everyone` resolves. */
  readonly value: string;
  readonly onChange: (audienceId: string) => void;
  readonly validationState?: 'none' | 'error' | 'warning' | 'success';
  readonly validationMessage?: string;
}

/**
 * The single **Audience** control (FR-42c, AC-57, AC-60). Feature component: it
 * owns the `GET /v1/audiences` read and the New audience dialog; the caller owns
 * the selected id.
 *
 * Every option is the API's `summary` sentence — never a description composed
 * here — and the caption states that ministry and presbyter status are read as
 * of today. An archived audience is not offered, but one the event already
 * references stays selectable.
 */
export function AudiencePicker({
  value,
  onChange,
  validationState,
  validationMessage,
}: AudiencePickerProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const [dialogOpen, setDialogOpen] = useState(false);

  const audiencesQuery = useQuery({
    queryKey: ['audiences', baseUrl],
    queryFn: ({ signal }) => listAudiences(baseUrl, token, { includeArchived: true, signal }),
    enabled: Boolean(token),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isUnauthorized(audiencesQuery.error)) void signOut();
  }, [audiencesQuery.error, signOut]);

  const audiences = audiencesQuery.data ?? [];
  const offered = audiences.filter((audience) => audience.active || audience.id === value);

  // FR-42c: the form opens on the seeded `Everyone` group; the id is what the
  // create body carries, and the summary stays the server's.
  const loadedAudiences = audiencesQuery.data;
  useEffect(() => {
    const items = loadedAudiences ?? [];
    if (value.length > 0 || items.length === 0) return;
    const fallback = items.find((audience) => audience.systemKey === 'everyone') ?? items[0];
    if (fallback) onChange(fallback.id);
  }, [loadedAudiences, onChange, value]);

  const selected = offered.find((audience) => audience.id === value);

  function selectCreated(audience: AudienceItem): void {
    // Show the new option immediately: the cache carries it before the refetch
    // lands, so the picker never reads blank after a successful create.
    queryClient.setQueryData<AudienceItem[]>(['audiences', baseUrl], (current) => [
      ...(current ?? []),
      audience,
    ]);
    onChange(audience.id);
    void queryClient.invalidateQueries({ queryKey: ['audiences', baseUrl] });
  }

  return (
    <div className={styles.row}>
      <Field
        label="Audience"
        required
        className={styles.field}
        hint="Who sees this event and who is on its roster. Ministry and presbyter status are read as of today."
        validationState={validationState}
        validationMessage={validationMessage}
      >
        <Dropdown
          aria-label="Audience"
          placeholder={audiencesQuery.isPending ? 'Loading audiences…' : 'Choose an audience'}
          value={selected?.summary ?? ''}
          selectedOptions={value ? [value] : []}
          disabled={audiencesQuery.isPending || audiences.length === 0}
          onOptionSelect={(_, data) => {
            if (data.optionValue) onChange(data.optionValue);
          }}
        >
          {offered.map((audience) => (
            <Option key={audience.id} value={audience.id} text={audience.summary}>
              {audience.summary}
            </Option>
          ))}
        </Dropdown>
      </Field>

      <Button
        icon={<AddRegular />}
        appearance="secondary"
        onClick={() => setDialogOpen(true)}
        disabled={!token}
      >
        New audience
      </Button>

      {audiencesQuery.isPending ? <Spinner size="tiny" aria-hidden /> : null}

      {audiencesQuery.isError ? (
        <Text size={200} role="alert" className={styles.error}>
          The audience list is unavailable. Check the API connection and try again.
        </Text>
      ) : null}

      {!audiencesQuery.isPending && !audiencesQuery.isError && audiences.length === 0 ? (
        <Text size={200} className={styles.hint}>
          No audiences exist yet. Create one with New audience.
        </Text>
      ) : null}

      {dialogOpen ? (
        <AudienceDialog onClose={() => setDialogOpen(false)} onCreated={selectCreated} />
      ) : null}
    </div>
  );
}
