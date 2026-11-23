import { makeStyles, shorthands, tokens } from '@fluentui/react-components';

/**
 * Shared styling for the events and series screens. Styles are not components:
 * the list and detail screens use the same panel, table and metadata shapes, so
 * one module keeps Fluent tokens consistent without duplicating Griffel rules.
 */
export const useEventStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    width: '100%',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  // The audience is a server-rendered sentence, so the tag can outgrow its column. It truncates at
  // a fixed width with the full sentence kept in the DOM (and as the hover title).
  audienceTag: {
    maxWidth: '220px',
    overflow: 'hidden',
  },
  audienceTagText: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  panel: {
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    minWidth: '1040px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke2),
  },
  panelTitle: {
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  // The session table has eight columns at 1440 px; the status pill was painting over the source
  // label beside it. The cell refuses to shrink and the table scrolls instead of colliding.
  statusCell: {
    whiteSpace: 'nowrap',
  },
  statusStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    // A Badge stretches to its flex container unless it is told otherwise, which drew a 150px pill
    // around a four-letter word.
    alignItems: 'flex-start',
  },
  sessionTable: {
    minWidth: '1180px',
  },
  state: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
    ...shorthands.border('1px', 'dashed', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
  },
  emptyTitle: {
    fontWeight: tokens.fontWeightSemibold,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  link: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    textDecoration: 'none',
    ':hover': { textDecoration: 'underline', color: tokens.colorBrandForeground1 },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  identity: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: '180px',
  },
  venue: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalXXS,
  },
  counts: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  when: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  listFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
  },
  meta: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
  },
  metaRows: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: tokens.spacingVerticalM,
    margin: 0,
  },
  metaRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  metaLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  metaValue: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  description: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    color: tokens.colorNeutralForeground2,
  },
  dialogSurface: {
    maxWidth: '760px',
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  // The recurrence panel's own failure banner, between the panel header and the
  // tables: it belongs to the surface the write acted on (FR-42g).
  panelBanner: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
  },
  // A row's controls: View rows and, where the parent allows it, Cancel. The
  // draft reason sits beside the disabled button and wraps under it on a narrow
  // table rather than stretching the cell (AC-62).
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    maxWidth: '220px',
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: tokens.spacingHorizontalL,
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  metricLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  metricValue: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase600,
  },
  metricCaption: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
});
