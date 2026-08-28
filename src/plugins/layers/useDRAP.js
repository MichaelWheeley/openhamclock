import { useState, useEffect, useRef } from 'react';

/**
 * D-RAP (D-Region Absorption Prediction) Overlay Plugin
 *
 * NOAA SWPC's global D-region absorption product: the highest frequency
 * affected by 1 dB of absorption (HAF, MHz) on a global lat/lon grid.
 * During solar X-ray flares and proton events the dayside D-layer absorbs
 * HF — this overlay shows where and how badly.
 *
 * Data: GET /api/drap (server proxy of
 * https://services.swpc.noaa.gov/text/drap_global_frequencies.txt,
 * parsed to a compact JSON grid, 5-minute cache).
 *
 * Rendered like the aurora layer: a canvas painted per-cell, scaled up
 * with smoothing and placed as a semi-transparent L.imageOverlay.
 * During quiet sun the map is (correctly) almost fully transparent.
 */

export const metadata = {
  id: 'drap',
  name: 'plugins.layers.drap.name',
  description: 'plugins.layers.drap.description',
  icon: '🌞',
  category: 'space-weather',
  defaultEnabled: false,
  defaultOpacity: 0.6,
  version: '1.0.0',
};

// Color ramp: ~0 MHz transparent → yellow → orange → red → dark red at 30+ MHz.
// Below 1 MHz is treated as "no meaningful absorption" and left transparent.
function drapCmap(freq) {
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

// Paint the grid to a canvas spanning [-180,180] lon × [-90,90] lat and
// return a smoothed data URL (same approach as the aurora layer).
function buildDrapCanvas(grid) {
  const { lats, lons, freqs } = grid;
  const w = lons.length;
  const h = lats.length;
  if (!w || !h) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const imageData = ctx.createImageData(w, h);
  const pixels = imageData.data;

  // lats are ordered north → south in the SWPC product; ensure y=0 is north.
  const northFirst = lats[0] > lats[h - 1];

  for (let row = 0; row < h; row++) {
    const y = northFirst ? row : h - 1 - row;
    const rowFreqs = freqs[row];
    if (!rowFreqs) continue;
    for (let x = 0; x < w; x++) {
      const color = drapCmap(rowFreqs[x]);
      if (!color) continue;
      const idx = (y * w + x) * 4;
      pixels[idx] = color.r;
      pixels[idx + 1] = color.g;
      pixels[idx + 2] = color.b;
      pixels[idx + 3] = Math.round(color.a * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Scale up with smoothing for soft gradients instead of blocky cells
  const smooth = document.createElement('canvas');
  smooth.width = 720;
  smooth.height = 360;
  const sctx = smooth.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(canvas, 0, 0, 720, 360);

  return smooth.toDataURL('image/png');
}

export function useLayer({ enabled = false, opacity = 0.6, map = null }) {
  const [overlayLayer, setOverlayLayer] = useState(null);
  const [drapData, setDrapData] = useState(null);
  const fetchingRef = useRef(false);

  // Fetch D-RAP grid
  useEffect(() => {
    if (!enabled) return;

    const fetchDrap = async () => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      try {
        const res = await fetch('/api/drap');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.lats) && Array.isArray(data.lons) && Array.isArray(data.freqs)) {
            setDrapData(data);
          }
        }
      } catch (err) {
        console.error('[DRAP] data fetch error:', err);
      } finally {
        fetchingRef.current = false;
      }
    };

    fetchDrap();
    // Product updates every minute upstream; server caches 5 min
    const interval = setInterval(fetchDrap, 300000);
    return () => clearInterval(interval);
  }, [enabled]);

  // Render overlay when data or map changes
  useEffect(() => {
    if (!map || typeof L === 'undefined') return;

    if (overlayLayer) {
      try {
        map.removeLayer(overlayLayer);
      } catch (e) {}
      setOverlayLayer(null);
    }

    if (!enabled || !drapData) return;

    try {
      const dataUrl = buildDrapCanvas(drapData);
      if (!dataUrl) return;

      const overlay = L.imageOverlay(
        dataUrl,
        [
          [-90, -180],
          [90, 180],
        ],
        {
          opacity: opacity,
          zIndex: 210,
          interactive: false,
        },
      );

      overlay.addTo(map);
      setOverlayLayer(overlay);
    } catch (err) {
      console.error('[DRAP] overlay render error:', err);
    }

    return () => {
      if (overlayLayer && map) {
        try {
          map.removeLayer(overlayLayer);
        } catch (e) {}
      }
    };
  }, [enabled, drapData, map]);

  // Update opacity without rebuilding
  useEffect(() => {
    if (overlayLayer) {
      overlayLayer.setOpacity(opacity);
    }
  }, [opacity, overlayLayer]);

  return {
    layer: overlayLayer,
    validAt: drapData?.validAt || null,
    maxFreq: drapData?.maxFreq ?? null,
  };
}
