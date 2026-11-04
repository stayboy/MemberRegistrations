import { Field, Input, makeStyles, tokens } from '@fluentui/react-components';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { defaultDateWindow, resolveDateWindow, type DateWindow } from '../format/date-window';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  field: {
    minWidth: '180px',
  },
  hint: {
    color: tokens.colorNeutralForeground3,
    alignSelf: 'center',
    paddingTop: tokens.spacingVerticalL,
  },
});

/**
 * Call sites: ShepherdingOfficersPage, ShepherdingRosterPage and
 * ShepherdingReportPage (FR-58, FR-59, FR-67), and EventsListPage (events
 * FR-2). The one UTC date-window control shared by the three shepherding screens
 * and the events list. It owns no state: the page keeps `from`/`to` (in the URL
 * where the surface is linkable) and passes them back.
 */
export function DateWindowControl({
  value,
  onChange,
  label = 'Date window',
  hint = 'UTC dates.',
}: {
  value: DateWindow;
  onChange: (next: DateWindow) => void;
  /** The group's accessible name; the two inputs are always From and To. */
  label?: string;
  hint?: string;
}) {
  const styles = useStyles();
  const reversed = value.from > value.to;

  return (
    <div className={styles.toolbar} role="group" aria-label={label}>
      <Field
        className={styles.field}
        label="From"
        validationState={reversed ? 'error' : 'none'}
        validationMessage={reversed ? 'From must be on or before To.' : undefined}
      >
        <Input
          type="date"
          value={value.from}
          max={value.to}
          onChange={(_, data) => {
            if (data.value) onChange({ ...value, from: data.value });
          }}
        />
      </Field>
      <Field className={styles.field} label="To">
        <Input
          type="date"
          value={value.to}
          min={value.from}
          onChange={(_, data) => {
            if (data.value) onChange({ ...value, to: data.value });
          }}
        />
      </Field>
      <span className={styles.hint}>{hint}</span>
    </div>
  );
}

export interface UseDateWindowOptions {
  /** Keeps `from`/`to` in the URL, so links between screens agree. Defaults to true. */
  readonly urlBacked?: boolean;
  /** The UTC date used for the default window; tests inject a fixed day. */
  readonly today?: string;
}

/**
 * The shared UTC window state. Shepherding screens use the URL so the roster
 * link and the report agree on the same range (FR-58/FR-67); a caller that does
 * not need a linkable range passes `{ urlBacked: false }`.
 */
export function useDateWindow(
  options: UseDateWindowOptions = {},
): [DateWindow, (next: DateWindow) => void] {
  const { urlBacked = true, today } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const [localWindow, setLocalWindow] = useState<DateWindow>(() => defaultDateWindow(today));

  const window = urlBacked
    ? resolveDateWindow(searchParams.get('from'), searchParams.get('to'), today)
    : localWindow;

  const setWindow = useCallback(
    (next: DateWindow) => {
      if (!urlBacked) {
        setLocalWindow(next);
        return;
      }

      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          params.set('from', next.from);
          params.set('to', next.to);
          return params;
        },
        { replace: true },
      );
    },
    [urlBacked, setSearchParams, setLocalWindow],
  );

  return [window, setWindow];
}
