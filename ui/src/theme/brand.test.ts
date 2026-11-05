import { describe, expect, it } from 'vitest';
import { BRAND_RAMPS, themeFor, type Scheme } from './brand';

const STOPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160] as const;
const WHITE = '#ffffff';

type RampAccent = keyof typeof BRAND_RAMPS;

const ACCENT_IDS = Object.keys(BRAND_RAMPS) as RampAccent[];

/**
 * The Fluent stops that receive white text as a brand background in either
 * scheme: Pressed/Selected use 40/60, the dark base uses 70 and the light base
 * uses 80.
 */
const WHITE_TEXT_STOPS = [40, 60, 70, 80] as const;

/** Fluent's brand-background tokens; each is painted with white label text. */
const BACKGROUND_TOKENS = [
  'colorBrandBackground',
  'colorBrandBackgroundHover',
  'colorBrandBackgroundPressed',
  'colorBrandBackgroundSelected',
  'colorBrandBackgroundStatic',
] as const;

/** Brand text tokens; these are read on the scheme's neutral surface. */
const TEXT_TOKENS = [
  'colorBrandForeground1',
  'colorBrandForeground2',
  'colorBrandForegroundLink',
  'colorBrandForegroundLinkHover',
  'colorBrandForegroundLinkPressed',
  'colorBrandForegroundLinkSelected',
] as const;

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  return (
    0.2126 * channel(Number.parseInt(clean.slice(0, 2), 16)) +
    0.7152 * channel(Number.parseInt(clean.slice(2, 4), 16)) +
    0.0722 * channel(Number.parseInt(clean.slice(4, 6), 16))
  );
}

function contrast(left: string, right: string): number {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('brand ramps', () => {
  it('covers the three custom accents', () => {
    expect(ACCENT_IDS).toEqual(['ocean', 'meadow', 'plum']);
  });

  describe.each(ACCENT_IDS)('%s', (accent) => {
    it('runs darkest to lightest across every Fluent stop', () => {
      const luminances = STOPS.map((stop) => luminance(BRAND_RAMPS[accent][stop]));

      for (const [index, value] of luminances.entries()) {
        if (index === 0) continue;
        expect(
          value,
          `${accent}[${STOPS[index]}] must be lighter than ${accent}[${STOPS[index - 1]}]`,
        ).toBeGreaterThan(luminances[index - 1]!);
      }
    });

    it('carries white text at AA on every brand-background stop', () => {
      for (const stop of WHITE_TEXT_STOPS) {
        expect(
          contrast(WHITE, BRAND_RAMPS[accent][stop]),
          `${accent}[${stop}] white contrast`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    describe.each(['light', 'dark'] as const)('%s scheme', (scheme: Scheme) => {
      const theme = themeFor(accent, scheme);

      it('keeps every Fluent brand background at AA against white text', () => {
        for (const token of BACKGROUND_TOKENS) {
          expect(
            contrast(WHITE, String(theme[token])),
            `${accent}/${scheme} ${token}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });

      it('keeps every Fluent brand text token readable on the surface', () => {
        const surface = String(theme.colorNeutralBackground1);
        for (const token of TEXT_TOKENS) {
          expect(
            contrast(String(theme[token]), surface),
            `${accent}/${scheme} ${token} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    });
  });
});
