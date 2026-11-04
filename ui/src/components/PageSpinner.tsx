import { Spinner, makeStyles } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '40vh',
  },
});

/**
 * Centred Fluent spinner with a status label.
 *
 * Call sites:
 * - `RequireSession` — while the session gate resolves.
 * - `AppShell` — as the `Suspense` fallback while a route chunk loads.
 *
 * It exists so both waits share one shape and one announcement. Both render
 * inside the shell's content slot: the gate never replaces the shell (FR-11),
 * and neither does a pending route chunk.
 */
export function PageSpinner({ label }: { label: string }) {
  const styles = useStyles();

  return (
    <div className={styles.container} role="status" aria-live="polite">
      <Spinner label={label} />
    </div>
  );
}
