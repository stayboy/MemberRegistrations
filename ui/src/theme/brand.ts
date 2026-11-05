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
 *
 * Each ramp runs darkest (10) to lightest (160) with strictly increasing
 * relative luminance. Fluent maps hover/pressed/selected tokens by index, so a
 * dip would invert the interaction states. Stop 80 is the light-scheme primary
 * and stop 70 the dark-scheme primary; both carry white text, and stops 90-110
 * carry the dark-scheme brand text, so those stops are held to WCAG AA
 * (FR-49). `brand.test.ts` guards both properties.
 */
const ocean: BrandVariants = {
  10: '#001219',
  20: '#001F2B',
  30: '#002B3D',
  40: '#00384F',
  50: '#004561',
  60: '#005173',
  70: '#005E85',
  80: '#006994',
  90: '#009BDB',
  100: '#00B5FF',
  110: '#2EC2FF',
  120: '#57CEFF',
  130: '#80DAFF',
  140: '#A3E4FF',
  150: '#C7EFFF',
  160: '#E5F8FF',
};

const meadow: BrandVariants = {
  10: '#051509',
  20: '#082310',
  30: '#0B3216',
  40: '#0F401D',
  50: '#124F23',
  60: '#155E2A',
  70: '#196C30',
  80: '#1C7B37',
  90: '#29B350',
  100: '#33D160',
  110: '#55D87A',
  120: '#76E094',
  130: '#97E7AE',
  140: '#B4EEC5',
  150: '#D1F5DB',
  160: '#EAFAEF',
};

const plum: BrandVariants = {
  10: '#160413',
  20: '#270722',
  30: '#3B0A33',
  40: '#4E0E44',
  50: '#621155',
  60: '#751567',
  70: '#891878',
  80: '#9C1C89',
  90: '#E25ACE',
  100: '#E56CD3',
  110: '#E981D9',
  120: '#ED97E0',
  130: '#F1B1E8',
  140: '#F5C7EE',
  150: '#F9DCF5',
  160: '#FCEEFA',
};

/** Exposed so the palette test can guard monotonicity and AA contrast. */
export const BRAND_RAMPS: Readonly<Record<Exclude<AccentId, 'fluent'>, BrandVariants>> = {
  ocean,
  meadow,
  plum,
};

export function themeFor(accent: AccentId, scheme: Scheme): Theme {
  if (accent === 'fluent') {
    return scheme === 'dark' ? webDarkTheme : webLightTheme;
  }

  return scheme === 'dark'
    ? createDarkTheme(BRAND_RAMPS[accent])
    : createLightTheme(BRAND_RAMPS[accent]);
}
