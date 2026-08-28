import { describe, it, expect } from 'vitest';
import {
  lonToX,
  latToY,
  normLon,
  fieldLabel,
  squareLabel,
  drapCmap,
  auroraCmap,
  paintMaidenhead,
  paintZones,
  paintDrap,
  paintAurora,
  GLOBE_OVERLAY_PAINTERS,
  GLOBE_OVERLAY_LAYER_IDS,
  ZONE_SOURCES,
} from './globeOverlays.js';

// Mock 2D context that records every draw call (and style assignment) in
// order, so painter output can be asserted without a real canvas.
function mockCtx() {
  const calls = [];
  const ctx = { calls };
  for (const m of [
    'save',
    'restore',
    'beginPath',
    'moveTo',
    'lineTo',
    'stroke',
    'fill',
    'fillRect',
    'clearRect',
    'fillText',
  ]) {
    ctx[m] = (...args) => calls.push([m, ...args]);
  }
  for (const p of [
    'strokeStyle',
    'fillStyle',
    'globalAlpha',
    'lineWidth',
    'font',
    'textAlign',
    'textBaseline',
    'shadowColor',
    'shadowBlur',
  ]) {
    Object.defineProperty(ctx, p, {
      set(v) {
        calls.push([`set:${p}`, v]);
      },
    });
  }
  return ctx;
}

const of = (ctx, name) => ctx.calls.filter((c) => c[0] === name);

describe('equirectangular projection helpers', () => {
  it('maps longitude to x across the full canvas width', () => {
    expect(lonToX(-180, 2048)).toBe(0);
    expect(lonToX(0, 2048)).toBe(1024);
    expect(lonToX(180, 2048)).toBe(2048);
    expect(lonToX(90, 360)).toBe(270);
  });

  it('maps latitude to y with north at the top', () => {
    expect(latToY(90, 1024)).toBe(0);
    expect(latToY(0, 1024)).toBe(512);
    expect(latToY(-90, 1024)).toBe(1024);
    expect(latToY(45, 180)).toBe(45);
  });

  it('normalizes world-wrapped longitudes into [-180, 180)', () => {
    expect(normLon(210)).toBe(-150);
    expect(normLon(-190)).toBe(170);
    expect(normLon(180)).toBe(-180);
    expect(normLon(0)).toBe(0);
  });
});

describe('Maidenhead helpers', () => {
  it('produces the field for a known locator (San Diego = DM)', () => {
    expect(fieldLabel(32.9, -117.1)).toBe('DM');
    expect(squareLabel(32.9, -117.1)).toBe('DM12');
  });

  it('handles the equator / prime meridian cell (JJ)', () => {
    expect(fieldLabel(0, 0)).toBe('JJ');
    expect(squareLabel(0, 0)).toBe('JJ00');
  });

  it('rejects out-of-range latitudes', () => {
    expect(fieldLabel(95, 0)).toBeNull();
  });
});

describe('paintMaidenhead', () => {
  it('draws every field line and a label per field', () => {
    const ctx = mockCtx();
    paintMaidenhead(ctx, { width: 360, height: 180, opacity: 0.5 });
    // 19 meridians + 19 parallels, one moveTo+lineTo pair each.
    expect(of(ctx, 'moveTo')).toHaveLength(38);
    expect(of(ctx, 'lineTo')).toHaveLength(38);
    expect(of(ctx, 'stroke')).toHaveLength(1);
    // 18 × 18 field labels.
    expect(of(ctx, 'fillText')).toHaveLength(324);
  });

  it('places grid lines and labels at projected lat/lon positions', () => {
    const ctx = mockCtx();
    paintMaidenhead(ctx, { width: 360, height: 180, opacity: 0.5 });
    // Meridian at lon 0 → x=180; parallel at lat 0 → y=90.
    expect(ctx.calls).toContainEqual(['moveTo', 180, 0]);
    expect(ctx.calls).toContainEqual(['moveTo', 0, 90]);
    // JJ field (lat 0..10, lon 0..20) labeled at its center (lon 10, lat 5).
    expect(ctx.calls).toContainEqual(['fillText', 'JJ', lonToX(10, 360), latToY(5, 180)]);
    // AA field (lat -90..-80, lon -180..-160) at (lon -170, lat -85).
    expect(ctx.calls).toContainEqual(['fillText', 'AA', lonToX(-170, 360), latToY(-85, 180)]);
  });
});

describe('drapCmap', () => {
  it('is transparent below 1 MHz', () => {
    expect(drapCmap(0)).toBeNull();
    expect(drapCmap(0.9)).toBeNull();
    expect(drapCmap(undefined)).toBeNull();
  });

  it('saturates to dark red at 30+ MHz', () => {
    expect(drapCmap(30)).toEqual({ r: 180, g: 0, b: 40, a: 1 });
    expect(drapCmap(99)).toEqual(drapCmap(30));
  });

  it('ramps alpha upward with frequency', () => {
    expect(drapCmap(2).a).toBeLessThan(drapCmap(10).a);
    expect(drapCmap(10).a).toBeLessThan(drapCmap(25).a);
  });
});

describe('paintDrap', () => {
  const grid = {
    lats: [45, -45],
    lons: [-90, 90],
    freqs: [
      [30, 0],
      [0, 15],
    ],
  };

  it('paints nothing without data', () => {
    const ctx = mockCtx();
    paintDrap(ctx, { width: 360, height: 180, opacity: 1, data: null });
    paintDrap(ctx, { width: 360, height: 180, opacity: 1, data: {} });
    paintDrap(ctx, { width: 360, height: 180, opacity: 1, data: { lats: [], lons: [], freqs: [] } });
    expect(ctx.calls).toHaveLength(0);
  });

  it('maps grid cells to rects centered on their lat/lon', () => {
    const ctx = mockCtx();
    paintDrap(ctx, { width: 360, height: 180, opacity: 1, data: grid });
    const rects = of(ctx, 'fillRect');
    // Only the two non-transparent cells are drawn. 2×2 grid → 180×90 cells.
    expect(rects).toHaveLength(2);
    // (lat 45, lon -90) center → (90, 45); cell top-left = (0, 0).
    expect(rects[0]).toEqual(['fillRect', 0, 0, 180.5, 90.5]);
    // (lat -45, lon 90) center → (270, 135); cell top-left = (180, 90).
    expect(rects[1]).toEqual(['fillRect', 180, 90, 180.5, 90.5]);
  });

  it('applies the shared color ramp scaled by layer opacity', () => {
    const ctx = mockCtx();
    paintDrap(ctx, { width: 360, height: 180, opacity: 0.5, data: grid });
    const fills = of(ctx, 'set:fillStyle');
    expect(fills[0][1]).toBe('rgba(180,0,40,0.5)'); // 30 MHz cell at half opacity
    expect(fills[1][1]).toBe(`rgba(255,140,0,${0.65 * 0.5})`); // 15 MHz cell
  });

  it('wraps cells that spill across the antimeridian', () => {
    const ctx = mockCtx();
    paintDrap(ctx, {
      width: 360,
      height: 180,
      opacity: 1,
      data: { lats: [0], lons: [-180], freqs: [[30]] },
    });
    const rects = of(ctx, 'fillRect');
    // One cell spans the whole world here (1×1 grid) but its center at
    // lon -180 puts its left half off-canvas — a wrapped copy is drawn.
    expect(rects).toHaveLength(2);
    expect(rects[0][1]).toBeLessThan(0);
    expect(rects[1][1]).toBe(rects[0][1] + 360);
  });
});

describe('auroraCmap', () => {
  it('is transparent below 4% probability', () => {
    expect(auroraCmap(0)).toBeNull();
    expect(auroraCmap(3.9)).toBeNull();
  });

  it('saturates to red at 84%+', () => {
    expect(auroraCmap(100)).toEqual({ r: 255, g: 0, b: 30, a: 1 });
  });

  it('starts green at low probability', () => {
    const c = auroraCmap(4);
    expect(c.r).toBe(0);
    expect(c.g).toBeGreaterThan(0);
  });
});

describe('paintAurora', () => {
  it('paints nothing without data', () => {
    const ctx = mockCtx();
    paintAurora(ctx, { width: 360, height: 181, opacity: 1, data: null });
    paintAurora(ctx, { width: 360, height: 181, opacity: 1, data: [] });
    expect(ctx.calls).toHaveLength(0);
  });

  it('maps NOAA 0-359 longitudes onto the -180-centered canvas', () => {
    const ctx = mockCtx();
    // Height 181 → 1 px per 1° cell, so positions come out integral.
    paintAurora(ctx, {
      width: 360,
      height: 181,
      opacity: 1,
      data: [
        [210, 65, 100], // lon 210 → -150 → x=30; lat 65 → row 25
        [0, -90, 2], // below threshold — skipped
      ],
    });
    const rects = of(ctx, 'fillRect');
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual(['fillRect', 30, 25, 1.5, 1.5]);
    expect(of(ctx, 'set:fillStyle')[0][1]).toBe('rgba(255,0,30,1)');
  });
});

describe('paintZones', () => {
  const geojson = {
    features: [
      {
        properties: { cq_zone_number: 5, cq_zone_name_loc: [20, 150] },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [170, 10],
              [-170, 10], // crosses the antimeridian
              [-170, -10],
            ],
          ],
        },
      },
    ],
  };

  it('paints nothing without data', () => {
    const ctx = mockCtx();
    paintZones(ctx, { width: 360, height: 180, opacity: 1, data: null });
    paintZones(ctx, { width: 360, height: 180, opacity: 1, data: { geojson: { features: [] } } });
    expect(ctx.calls).toHaveLength(0);
  });

  it('strokes boundaries, breaking the path at the antimeridian', () => {
    const ctx = mockCtx();
    paintZones(ctx, { width: 360, height: 180, opacity: 1, data: { geojson, color: '#e6a23c' } });
    // First point starts the path; the ±170 jump forces a second moveTo.
    expect(of(ctx, 'moveTo')).toEqual([
      ['moveTo', lonToX(170, 360), latToY(10, 180)],
      ['moveTo', lonToX(-170, 360), latToY(10, 180)],
    ]);
    expect(of(ctx, 'lineTo')).toEqual([['lineTo', lonToX(-170, 360), latToY(-10, 180)]]);
    expect(of(ctx, 'stroke')).toHaveLength(1);
  });

  it('labels the zone number at its label point ([lat, lon] order)', () => {
    const ctx = mockCtx();
    paintZones(ctx, { width: 360, height: 180, opacity: 1, data: { geojson, color: '#e6a23c' } });
    expect(ctx.calls).toContainEqual(['fillText', '5', lonToX(150, 360), latToY(20, 180)]);
  });

  it('uses the zone-set color for strokes and labels', () => {
    const ctx = mockCtx();
    paintZones(ctx, { width: 360, height: 180, opacity: 1, data: { geojson, color: ZONE_SOURCES.itu.color } });
    expect(of(ctx, 'set:strokeStyle')[0][1]).toBe('#4fc3f7');
    expect(of(ctx, 'set:fillStyle')[0][1]).toBe('#4fc3f7');
  });
});

describe('painter registry', () => {
  it('registers the four globe-capable layers under their plugin ids', () => {
    expect(GLOBE_OVERLAY_LAYER_IDS).toEqual(['maidenhead', 'zones', 'drap', 'aurora']);
    for (const id of GLOBE_OVERLAY_LAYER_IDS) {
      expect(typeof GLOBE_OVERLAY_PAINTERS[id]).toBe('function');
    }
  });

  it('registered painters are the exported ones', () => {
    expect(GLOBE_OVERLAY_PAINTERS.maidenhead).toBe(paintMaidenhead);
    expect(GLOBE_OVERLAY_PAINTERS.zones).toBe(paintZones);
    expect(GLOBE_OVERLAY_PAINTERS.drap).toBe(paintDrap);
    expect(GLOBE_OVERLAY_PAINTERS.aurora).toBe(paintAurora);
  });
});
