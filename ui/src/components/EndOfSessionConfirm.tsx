import { ConfirmDialog } from './ConfirmDialog';

/**
 * The confirmation in front of the end-only import (`rows: []` with `ended: true`), FR-6f/AC-7a.
 *
 * It is the one irreversible verb on the attendance surfaces: once the session is closed every import,
 * headcount and manual write answers `session_closed`, and nothing reopens it. Archive and a cancelled
 * occurrence already confirm, so the close does too, with copy that states the consequence rather than
 * only naming the action.
 *
 * Call sites (the second one extracted it, `AGENTS.md` §15): `SessionHeadcount` on the occurrence row
 * and `AttendanceWorkspace` in the attendance import panel. Both must send the same request, so the
 * dialog and its copy live here rather than being restated per surface.
 */
export function EndOfSessionConfirm({
  open,
  busy = false,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean;
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="End this session?"
      message="End of session closes this session for its date. Further captures will be refused."
      confirmLabel="End of session"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
