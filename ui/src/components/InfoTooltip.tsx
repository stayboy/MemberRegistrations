import { Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { InfoRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    color: tokens.colorNeutralForeground3,
    borderRadius: tokens.borderRadiusCircular,
    cursor: 'help',
    ':focus-visible': {
      outlineStyle: 'solid',
      outlineWidth: tokens.strokeWidthThick,
      outlineColor: tokens.colorStrokeFocus2,
      outlineOffset: tokens.strokeWidthThin,
    },
  },
  icon: {
    fontSize: tokens.fontSizeBase400,
  },
});

/**
 * An info glyph whose explanation rides a **tooltip** instead of a hint line or a
 * paragraph (owner, 2026-11-26). Call sites: the schedule builder's fields
 * (frequency, day inside the period, the named period) and the event detail's
 * named-period fact.
 *
 * It is focusable because a tooltip must be reachable without a mouse, and it
 * carries an accessible name (`name`) so the glyph is not an unnamed tab stop.
 * `explanation` is the tooltip's content, read by screen readers through the
 * description relationship.
 */
export function InfoTooltip({
  name,
  explanation,
}: {
  /** The glyph's accessible name, e.g. "What the frequency means". */
  readonly name: string;
  /** The sentence(s) the tooltip shows. */
  readonly explanation: string;
}) {
  const styles = useStyles();

  return (
    <Tooltip content={explanation} relationship="description" withArrow>
      <span className={styles.trigger} tabIndex={0} aria-label={name}>
        <InfoRegular aria-hidden className={styles.icon} />
      </span>
    </Tooltip>
  );
}
