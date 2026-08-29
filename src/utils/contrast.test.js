/**
 * WCAG AA contrast guard (#1112): every theme palette in themes.css must keep
 * its text readable and its accent colors distinguishable on the surfaces
 * they render on. Fails the build when a palette edit reintroduces an
 * invisible-text combination (Retro once shipped accent-cyan identical to its
 * own background).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrastRatio, parseHex, parseThemePalettes, relativeLuminance } from './contrast.js';

const css = readFileSync(resolve(process.cwd(), 'src/styles/themes.css'), 'utf8');
const themes = parseThemePalettes(css);

const TEXT_VARS = ['text-primary', 'text-secondary', 'text-muted'];
const ACCENT_VARS = ['accent-amber', 'accent-green', 'accent-red', 'accent-blue', 'accent-cyan', 'accent-purple'];
const SURFACES = ['bg-primary', 'bg-secondary'];

// Deliberate identity tradeoffs, each with a reason. Keep this list SHORT.
const EXCEPTIONS = new Set([
  // Win95 yellow on silver panels: retro's panel headers use the navy
  // title-bar chrome (white text), so amber text barely occurs on silver;
  // a 3:1 amber would be brown and cost the theme its identity.
  'retro:accent-amber:bg-secondary',
]);

describe('contrast math', () => {
  it('parses hex and computes known ratios', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('#008080')).toEqual([0, 128, 128]);
    expect(parseHex('teal')).toBeNull();
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#008080', '#008080')).toBeCloseTo(1, 5);
  });
});

describe('themes.css meets WCAG AA (#1112)', () => {
  it('found the theme palettes', () => {
    expect(Object.keys(themes).length).toBeGreaterThan(5);
    expect(themes.retro).toBeDefined();
    expect(themes.light).toBeDefined();
  });

  for (const [name, vars] of Object.entries(themes)) {
    for (const surface of SURFACES) {
      const bg = vars[surface];
      if (!parseHex(bg)) continue; // rgba()/gradient surfaces are out of scope

      it(`${name}: text >= 4.5:1 on ${surface}`, () => {
        for (const tv of TEXT_VARS) {
          if (!parseHex(vars[tv])) continue;
          if (EXCEPTIONS.has(`${name}:${tv}:${surface}`)) continue;
          const ratio = contrastRatio(vars[tv], bg);
          expect(
            ratio,
            `${name} --${tv} (${vars[tv]}) vs --${surface} (${bg}) = ${ratio?.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });

      it(`${name}: accents >= 3:1 on ${surface}`, () => {
        for (const av of ACCENT_VARS) {
          if (!parseHex(vars[av])) continue;
          if (EXCEPTIONS.has(`${name}:${av}:${surface}`)) continue;
          const ratio = contrastRatio(vars[av], bg);
          expect(
            ratio,
            `${name} --${av} (${vars[av]}) vs --${surface} (${bg}) = ${ratio?.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }
});
