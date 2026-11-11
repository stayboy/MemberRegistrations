import { makeStyles, shorthands, tokens } from '@fluentui/react-components';

/**
 * Shared styling for the USSD operator pages. Styles are not components: the
 * pages share one panel, table, toolbar and empty-state shape, so one module
 * keeps Fluent tokens consistent without duplicating Griffel rules.
 */
export const useUssdStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    width: '100%',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  field: {
    minWidth: '200px',
  },
  narrowField: {
    minWidth: '140px',
  },
  panel: {
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  widePanel: {
    flex: 1,
    minWidth: '320px',
  },
  panelHeader: {
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
    fontWeight: tokens.fontWeightSemibold,
  },
  panelBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
  },
  listPanels: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  panelFoot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke2),
  },
  link: {
    color: tokens.colorBrandForeground1,
    textDecoration: 'underline',
    ':hover': { color: tokens.colorBrandForeground2Hover },
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    minWidth: '820px',
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
  fields: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  codeDisplay: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalL,
    ...shorthands.border('1px', 'solid', tokens.colorBrandStroke1),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  code: {
    fontSize: tokens.fontSizeHero800,
    letterSpacing: '0.18em',
    fontWeight: tokens.fontWeightSemibold,
    fontFamily: tokens.fontFamilyMonospace,
    color: tokens.colorNeutralForeground1,
  },
  numbers: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    fontFamily: tokens.fontFamilyMonospace,
  },
  handset: {
    maxWidth: '360px',
    minHeight: '320px',
    padding: tokens.spacingVerticalL,
    ...shorthands.border('10px', 'solid', tokens.colorNeutralStroke1),
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  inlineCode: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  denominationGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  denominationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))',
    gap: tokens.spacingHorizontalS,
    '@media (max-width: 720px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
    '@media (max-width: 480px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  denominationCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  denominationCellInvalid: {
    ...shorthands.border('1px', 'solid', tokens.colorPaletteRedBorder2),
    backgroundColor: tokens.colorPaletteRedBackground1,
  },
  denominationValue: {
    color: tokens.colorNeutralForeground3,
    fontVariantNumeric: 'tabular-nums',
  },
  customAdd: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  customField: {
    width: '168px',
    minWidth: 0,
  },
  customHint: {
    flexBasis: '100%',
  },
  oneOffHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  footerStatus: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  captureState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  captureLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    fontWeight: tokens.fontWeightSemibold,
  },
  captureDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: tokens.colorPaletteGreenBackground3,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
  },
  dialogSurfaceWide: {
    '&&': {
      maxWidth: 'min(800px, calc(100vw - 32px))',
    },
  },
});
