/**
 * WCAG 2.1 contrast helpers (#1112).
 *
 * Pure math for the theme contrast guard test and any future tooling:
 * hex → relative luminance → contrast ratio, plus a tiny parser that pulls
 * each theme's custom-property palette out of themes.css text.
 */

/** #rgb / #rrggbb → [r,g,b] 0-255, or null for anything else. */
export function parseHex(color) {
  const m = String(color || '')
    .trim()
    .match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3)
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

/** WCAG relative luminance of an sRGB hex color. */
export function relativeLuminance(color) {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors (1..21), or null if unparsable. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Parse `[data-theme='name'] { --var: value; ... }` blocks out of CSS text.
 * Returns { themeName: { varName: value } }. Only top-level custom properties
 * are collected; nested selectors and non-variable declarations are ignored.
 */
export function parseThemePalettes(cssText) {
  const palettes = {};
  const blockRe = /\[data-theme=['"]([\w-]+)['"]\]\s*\{([^}]*)\}/g;
  let m;
  while ((m = blockRe.exec(cssText)) !== null) {
    const name = m[1];
    const vars = palettes[name] || (palettes[name] = {});
    const varRe = /--([\w-]+)\s*:\s*([^;]+);/g;
    let v;
    while ((v = varRe.exec(m[2])) !== null) {
      vars[v[1]] = v[2].trim();
    }
  }
  return palettes;
}

export default { parseHex, relativeLuminance, contrastRatio, parseThemePalettes };
