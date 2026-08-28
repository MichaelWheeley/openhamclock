/**
 * Globe overlay painters — plugin map layers on the 3D globe.
 *
 * The Leaflet plugin layers (src/plugins/layers/*) attach to a Leaflet map
 * instance, so they cannot render on the WebGL globe. Instead, globe-capable
 * layers paint onto ONE shared equirectangular canvas in plain lat/lon space:
 *
 *   x = (lon + 180) / 360 * width      (lon -180 at the left edge)
 *   y = (90 - lat)  / 180 * height     (lat +90 at the top edge)
 *
 * Globe3D drapes that canvas as a texture on a transparent sphere shell just
 * above the earth mesh; the UV layout of THREE.SphereGeometry matches this
 * projection exactly (u=0 at lon -180, v=1 at lat +90), so painters never
 * need to know about three.js — they are pure canvas-2D functions, testable
 * with a mocked context.
 *
 * Repainting is driven by Globe3D and happens only when a layer toggle,
 * opacity, or its data changes — never per frame (render-on-change design,
 * Raspberry Pi target). A painter given no data paints nothing; it must
 * never block or fetch.
 *
 * Shared helpers (colour ramps, Maidenhead math, zone sources) live here so
 * the flat Leaflet layers and the globe painters cannot drift apart.
 */

// ── Equirectangular projection ─────────────────────────────
export const lonToX = (lon, width) => ((lon + 180) / 360) * width;
export const latToY = (lat, height) => ((90 - lat) / 180) * height;

// Normalize a (possibly world-wrapped) longitude into [-180, 180)
export function normLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

// ── Maidenhead math (shared with useMaidenheadGrid.js) ─────
const FIELD_LETTERS = 'ABCDEFGHIJKLMNOPQR';

// Field label ("EN") for a cell's SW corner in normalized coordinates
export function fieldLabel(lat, lon) {
  const lonIdx = Math.floor((normLon(lon) + 180) / 20);
  const latIdx = Math.floor((lat + 90) / 10);
  if (lonIdx < 0 || lonIdx > 17 || latIdx < 0 || latIdx > 17) return null;
  return FIELD_LETTERS[lonIdx] + FIELD_LETTERS[latIdx];
}

// Square label ("EN34") for a cell's SW corner in normalized coordinates
export function squareLabel(lat, lon) {
  const field = fieldLabel(lat, lon);
  if (!field) return null;
  const lonDigit = Math.floor(((normLon(lon) + 180) % 20) / 2);
  const latDigit = Math.floor(((lat + 90) % 10) / 1);
  return field + String(lonDigit) + String(latDigit);
}

// ── Colour ramps (shared with useDRAP.js / useAurora.js) ───

// D-RAP ramp: ~0 MHz transparent → yellow → orange → red → dark red at 30+
// MHz. Below 1 MHz is treated as "no meaningful absorption" → null.
export function drapCmap(freq) {
  if (!(freq >= 1)) return null;

  const t = Math.min(freq / 30, 1); // normalize 0-30+ MHz to 0-1

  let r, g, b, a;
  if (t < 0.25) {
    // Faint yellow, ramping in
    const s = t / 0.25;
    r = 255;
    g = 230;
    b = Math.round(80 * (1 - s));
    a = 0.15 + s * 0.3;
  } else if (t < 0.5) {
    // Yellow → orange
    const s = (t - 0.25) / 0.25;
    r = 255;
    g = Math.round(230 - s * 90);
    b = 0;
    a = 0.45 + s * 0.2;
  } else if (t < 0.75) {
    // Orange → red
    const s = (t - 0.5) / 0.25;
    r = 255;
    g = Math.round(140 - s * 140);
    b = 0;
    a = 0.65 + s * 0.15;
  } else {
    // Red → dark red
    const s = (t - 0.75) / 0.25;
    r = Math.round(255 - s * 75);
    g = 0;
    b = Math.round(s * 40);
    a = 0.8 + s * 0.2;
  }

  return { r, g, b, a };
}

// Aurora ramp: transparent → green → yellow → red, matching NOAA's official
// OVATION visualization. Probabilities under 4% → null.
export function auroraCmap(probability) {
  if (probability < 4) return null;

  // Normalize 4-100 to 0-1
  const t = Math.min((probability - 4) / 80, 1);

  let r, g, b, a;
  if (t < 0.25) {
    // Dark green to green
    const s = t / 0.25;
    r = 0;
    g = Math.round(80 + s * 175);
    b = Math.round(40 * (1 - s));
    a = 0.3 + s * 0.3;
  } else if (t < 0.5) {
    // Green to yellow-green
    const s = (t - 0.25) / 0.25;
    r = Math.round(s * 200);
    g = 255;
    b = 0;
    a = 0.6 + s * 0.15;
  } else if (t < 0.75) {
    // Yellow to orange
    const s = (t - 0.5) / 0.25;
    r = 255;
    g = Math.round(255 - s * 120);
    b = 0;
    a = 0.75 + s * 0.1;
  } else {
    // Orange to red
    const s = (t - 0.75) / 0.25;
    r = 255;
    g = Math.round(135 - s * 135);
    b = Math.round(s * 30);
    a = 0.85 + s * 0.15;
  }

  return { r, g, b, a };
}

// ── Zone sources (shared with useZones.js) ─────────────────
// Vendored GeoJSON from https://github.com/HB9HIL/hamradio-zones-geojson (MIT).
export const ZONE_SOURCES = {
  cq: { file: '/geo/cq-zones.geojson', color: '#e6a23c' },
  itu: { file: '/geo/itu-zones.geojson', color: '#4fc3f7' },
};

// ── Painters ───────────────────────────────────────────────
// Every painter has the signature (ctx, { width, height, opacity, data })
// and draws in the equirectangular space above. No data → paint nothing.

/**
 * Maidenhead grid — field level only (20° lon × 10° lat), lines + labels.
 * The whole world is always "visible" on a globe, so square-level density
 * is never drawn (same reasoning as the azimuthal projection).
 */
export function paintMaidenhead(ctx, { width, height, opacity = 0.5 }) {
  ctx.save();

  // Field boundary lines — mid-gray, semi-transparent, same styling family
  // as the Leaflet layer's major lines.
  ctx.strokeStyle = '#999999';
  ctx.globalAlpha = Math.min(1, opacity * 0.7);
  ctx.lineWidth = Math.max(1, width / 2048);
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 20) {
    const x = lonToX(lon, width);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let lat = -90; lat <= 90; lat += 10) {
    const y = latToY(lat, height);
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  // Field labels at cell centers — white with a dark halo so they read on
  // any basemap.
  ctx.globalAlpha = Math.min(1, opacity + 0.2);
  ctx.font = `600 ${Math.max(4, Math.round((width / 2048) * 22))}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 3;
  for (let lon = -180; lon < 180; lon += 20) {
    for (let lat = -90; lat < 90; lat += 10) {
      const text = fieldLabel(lat, lon);
      if (!text) continue;
      ctx.fillText(text, lonToX(lon + 10, width), latToY(lat + 5, height));
    }
  }
  ctx.restore();
}

/**
 * CQ/ITU zone boundaries + zone numbers.
 * data: { geojson, color } — geojson from ZONE_SOURCES[type].file, colour
 * matching the flat layer for the same zone set.
 */
export function paintZones(ctx, { width, height, opacity = 0.7, data }) {
  const features = data?.geojson?.features;
  if (!Array.isArray(features) || !features.length) return;
  const color = data.color || ZONE_SOURCES.cq.color;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = Math.min(1, opacity * 0.9);
  ctx.lineWidth = Math.max(1, (width / 2048) * 1.5);

  for (const feature of features) {
    const geom = feature?.geometry;
    if (!geom) continue;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const poly of polys) {
      if (!Array.isArray(poly)) continue;
      for (const ring of poly) {
        if (!Array.isArray(ring) || ring.length < 2) continue;
        ctx.beginPath();
        let prevLon = null;
        for (const pt of ring) {
          const lon = pt[0];
          const lat = pt[1];
          const x = lonToX(lon, width);
          const y = latToY(lat, height);
          // A lon jump > 180° means the ring crosses the antimeridian;
          // break the path there instead of streaking across the canvas.
          if (prevLon === null || Math.abs(lon - prevLon) > 180) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          prevLon = lon;
        }
        ctx.stroke();
      }
    }
  }

  // Zone numbers at each zone's label point (props *_zone_name_loc = [lat, lon]).
  ctx.globalAlpha = Math.min(1, opacity + 0.2);
  ctx.font = `700 ${Math.max(5, Math.round((width / 2048) * 26))}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 3;
  for (const feature of features) {
    const props = feature?.properties || {};
    const zoneNumber = props.cq_zone_number ?? props.itu_zone_number;
    const loc = props.cq_zone_name_loc ?? props.itu_zone_name_loc;
    if (zoneNumber == null || !Array.isArray(loc) || loc.length !== 2) continue;
    ctx.fillText(String(zoneNumber), lonToX(loc[1], width), latToY(loc[0], height));
  }
  ctx.restore();
}

/**
 * D-RAP absorption grid as translucent heat cells.
 * data: { lats, lons, freqs } — the /api/drap grid (freqs[row][col] MHz,
 * rows ordered by lats, columns by lons). Each grid point is drawn as a cell
 * centered on it; layer opacity multiplies the ramp's own alpha.
 */
export function paintDrap(ctx, { width, height, opacity = 0.6, data }) {
  const lats = data?.lats;
  const lons = data?.lons;
  const freqs = data?.freqs;
  if (!Array.isArray(lats) || !Array.isArray(lons) || !Array.isArray(freqs)) return;
  if (!lats.length || !lons.length) return;

  const cw = (width / 360) * (360 / lons.length); // cell size from grid spacing
  const ch = (height / 180) * (180 / lats.length);

  ctx.save();
  for (let row = 0; row < lats.length; row++) {
    const rowFreqs = freqs[row];
    if (!rowFreqs) continue;
    const y = latToY(lats[row], height) - ch / 2;
    for (let col = 0; col < lons.length; col++) {
      const color = drapCmap(rowFreqs[col]);
      if (!color) continue;
      const x = lonToX(normLon(lons[col]), width) - cw / 2;
      ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a * opacity})`;
      // +0.5 overdraw hides seams between adjacent cells.
      ctx.fillRect(x, y, cw + 0.5, ch + 0.5);
      // A cell centered near the antimeridian spills off one edge — draw the
      // wrapped remainder on the other side so the seam has no gap.
      if (x < 0) ctx.fillRect(x + width, y, cw + 0.5, ch + 0.5);
      else if (x + cw > width) ctx.fillRect(x - width, y, cw + 0.5, ch + 0.5);
    }
  }
  ctx.restore();
}

/**
 * Aurora (OVATION) probability grid.
 * data: the coordinates array from /api/noaa/aurora — [[lon 0-359, lat -90..90,
 * probability 0-100], ...] on a 1° grid, 181 latitude rows.
 */
export function paintAurora(ctx, { width, height, opacity = 0.6, data }) {
  if (!Array.isArray(data) || !data.length) return;

  const cw = width / 360;
  const ch = height / 181;

  ctx.save();
  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    const prob = point[2];
    const color = auroraCmap(prob);
    if (!color) continue;
    const x = lonToX(normLon(point[0]), width);
    const y = (90 - Math.round(point[1])) * ch;
    ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a * opacity})`;
    ctx.fillRect(x, y, cw + 0.5, ch + 0.5);
  }
  ctx.restore();
}

// ── Registry ───────────────────────────────────────────────
// layerId → painter, keyed by the plugin layer ids from layerRegistry.js.
// Adding a globe rendering for another layer = add a painter here (plus its
// data fetch in Globe3D's overlay-data effects); WorldMap's suppressed-layers
// note picks the id up automatically via GLOBE_OVERLAY_LAYER_IDS.
export const GLOBE_OVERLAY_PAINTERS = {
  maidenhead: paintMaidenhead,
  zones: paintZones,
  drap: paintDrap,
  aurora: paintAurora,
};

// Plugin layer ids the globe can draw itself (satellites render natively and
// are handled separately).
export const GLOBE_OVERLAY_LAYER_IDS = Object.keys(GLOBE_OVERLAY_PAINTERS);
