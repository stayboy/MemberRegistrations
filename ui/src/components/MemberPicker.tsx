import { Combobox, Field, Option, Text, makeStyles, tokens } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isUnauthorized } from '../api/errors';
import { searchMembers } from '../api/members';
import { useSession } from '../auth/SessionProvider';
import { toMemberPickerOptions, type MemberPickerOption } from '../format/member-picker';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const useStyles = makeStyles({
  hint: {
    color: tokens.colorNeutralForeground3,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
});

export interface MemberPickerProps {
  /** The selected member number, or null while searching. */
  readonly value: string | null;
  readonly onChange: (memberNo: string | null) => void;
  readonly label: string;
  /** Hides the member being edited, e.g. the policyholder in a coverage dialog. */
  readonly excludeMemberNo?: string;
  readonly disabled?: boolean;
  /** Mirrors Fluent `Field` so a caller can attach field-level validation. */
  readonly validationState?: 'none' | 'error' | 'warning' | 'success';
  readonly validationMessage?: string;
}

/**
 * Call sites: the relationship add form (MemberRelationshipsTab), the add-coverage
 * dialog and the covered-members editor in the add-subscription dialog
 * (MemberSubscriptionsTab). This is a feature component: it owns the debounced
 * member search and its cache; the caller owns the selected member number.
 *
 * The search is `GET /v1/members?q=…` limited to ten rows and shows
 * `memberNo — name` (Q156).
 */
export function MemberPicker({
  value,
  onChange,
  label,
  excludeMemberNo,
  disabled = false,
  validationState,
  validationMessage,
}: MemberPickerProps) {
  const styles = useStyles();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';

  const [query, setQuery] = useState('');
  const [previousValue, setPreviousValue] = useState(value);
  // 300 ms matches the members grid, so both search surfaces feel the same (FR-21).
  const debouncedQuery = useDebouncedValue(query.trim());

  // A caller reset (for example after adding the row) also clears the search.
  // Adjusting state during render is React's documented alternative to a
  // cascading effect for a prop change.
  if (value !== previousValue) {
    setPreviousValue(value);
    if (value === null) setQuery('');
  }

  const membersQuery = useQuery({
    queryKey: ['member-picker', baseUrl, debouncedQuery],
    queryFn: ({ signal }) => searchMembers(baseUrl, token, debouncedQuery, signal),
    enabled: Boolean(token) && debouncedQuery.length > 0,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isUnauthorized(membersQuery.error)) void signOut();
  }, [membersQuery.error, signOut]);

  const options: MemberPickerOption[] = toMemberPickerOptions(
    membersQuery.data?.items ?? [],
    excludeMemberNo,
  );

  const isSearching = debouncedQuery.length > 0 && membersQuery.isFetching;
  const hasNoMatches =
    debouncedQuery.length > 0 &&
    !membersQuery.isPending &&
    !membersQuery.isError &&
    options.length === 0;

  return (
    <Field label={label} validationState={validationState} validationMessage={validationMessage}>
      <Combobox
        value={query}
        selectedOptions={value ? [value] : []}
        placeholder="Search name or member number"
        disabled={disabled}
        clearable={false}
        onChange={(event) => {
          setQuery(event.target.value);
          // Typing invalidates the previous selection; only an option click selects.
          if (value !== null) onChange(null);
        }}
        onOptionSelect={(_, data) => {
          const selected = data.optionValue ?? null;
          if (selected === null) return;
          const option = options.find((candidate) => candidate.memberNo === selected);
          setQuery(option?.label ?? '');
          onChange(selected);
        }}
      >
        {options.map((option) => (
          <Option key={option.memberNo} value={option.memberNo} text={option.label}>
            {option.label}
          </Option>
        ))}
      </Combobox>
      {isSearching ? (
        <Text size={100} className={styles.hint}>
          Searching members…
        </Text>
      ) : null}
      {hasNoMatches ? (
        <Text size={100} className={styles.hint}>
          No matching members.
        </Text>
      ) : null}
      {membersQuery.isError ? (
        <Text size={100} className={styles.error} role="alert">
          Member search is unavailable. Check the API connection and try again.
        </Text>
      ) : null}
    </Field>
  );
}
