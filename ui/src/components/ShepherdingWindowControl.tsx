import { Field, Input, makeStyles, tokens } from '@fluentui/react-components';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ShepherdingWindow } from '../api/shepherding';
import { resolveShepherdingWindow } from '../format/shepherding';

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
 * ShepherdingReportPage. The one window control shared by the three shepherding
 * screens (FR-58, FR-59, FR-67). It owns no state: the page keeps `from`/`to` in
 * the URL and passes them back, so all three screens use the same UTC calendar
 * window.
 */
export function ShepherdingWindowControl({
  value,
  onChange,
}: {
  value: ShepherdingWindow;
  onChange: (next: ShepherdingWindow) => void;
}) {
  const styles = useStyles();
  const reversed = value.from > value.to;

  return (
    <div className={styles.toolbar} role="group" aria-label="Shepherding date window">
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
      <span className={styles.hint}>UTC dates · calls outside this window are not counted.</span>
    </div>
  );
}

/**
 * Keeps the shared window in the URL so ShepherdingOfficersPage,
 * ShepherdingRosterPage and ShepherdingReportPage (and links between them)
 * agree on the same UTC range (FR-58/FR-67).
 */
export function useShepherdingWindow(): [ShepherdingWindow, (next: ShepherdingWindow) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const window = resolveShepherdingWindow(searchParams.get('from'), searchParams.get('to'));

  const setWindow = useCallback(
    (next: ShepherdingWindow) => {
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
    [setSearchParams],
  );

  return [window, setWindow];
}
