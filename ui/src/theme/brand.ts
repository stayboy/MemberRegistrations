import {
  createDarkTheme,
  createLightTheme,
  webDarkTheme,
  webLightTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components';

export type AccentId = 'fluent' | 'ocean' | 'meadow' | 'plum';
export type Scheme = 'light' | 'dark';

export interface AccentOption {
  readonly id: AccentId;
  readonly label: string;
}

export const ACCENTS: readonly AccentOption[] = [
  { id: 'fluent', label: 'Fluent' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'meadow', label: 'Meadow' },
  { id: 'plum', label: 'Plum' },
];

export function isAccentId(value: unknown): value is AccentId {
  return ACCENTS.some((accent) => accent.id === value);
}

/*
 * Accent ramps. Fluent's own light/dark themes are used for `fluent`; the other
 * three are brand ramps consumed by createLightTheme/createDarkTheme so every
 * surface, stroke and focus token derives from the single ramp.
 */
const ocean: BrandVariants = {
  10: '#001A26',
  20: '#00303F',
  30: '#00475C',
  40: '#005E79',
  50: '#007696',
  60: '#008EB4',
  70: '#00A7D3',
  80: '#0DBFE9',
  90: '#3FD0F2',
  100: '#67DCF7',
  110: '#8AE6FA',
  120: '#ABEDFB',
  130: '#C7F2FD',
  140: '#DEF7FE',
  150: '#EEFAFE',
  160: '#F6FDFF',
};

const meadow: BrandVariants = {
  10: '#041A0C',
  20: '#0A2B14',
  30: '#103D1C',
  40: '#155025',
  50: '#19642D',
  60: '#1C7936',
  70: '#1E8E3E',
  80: '#20A447',
  90: '#23BA50',
  100: '#3BCB63',
  110: '#58D87B',
  120: '#77E294',
  130: '#98EBAD',
  140: '#B8F2C7',
  150: '#D6F8DF',
  160: '#EDFCF1',
};

const plum: BrandVariants = {
  10: '#1A0417',
  20: '#2D0727',
  30: '#410B38',
  40: '#550E4A',
  50: '#6A125C',
  60: '#7F166E',
  70: '#951A81',
  80: '#AB1E94',
  90: '#C223A8',
  100: '#D53DBA',
  110: '#E05EC9',
  120: '#E980D6',
  130: '#F0A2E2',
  140: '#F6C2EC',
  150: '#FBDEF5',
  160: '#FEF4FC',
};

const ramps: Record<Exclude<AccentId, 'fluent'>, BrandVariants> = { ocean, meadow, plum };

export function themeFor(accent: AccentId, scheme: Scheme): Theme {
  if (accent === 'fluent') {
    return scheme === 'dark' ? webDarkTheme : webLightTheme;
  }

  return scheme === 'dark' ? createDarkTheme(ramps[accent]) : createLightTheme(ramps[accent]);
}
