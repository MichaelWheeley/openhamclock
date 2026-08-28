import { useEffect, useRef } from 'react';
import { normLon, fieldLabel, squareLabel } from '../../utils/globeOverlays.js';

/**
 * Maidenhead Grid Squares Overlay Plugin
 *
 * Draws the Maidenhead locator grid with labels. Density adapts to zoom:
 * - Fields (20° lon × 10° lat, e.g. "EN") at low zoom
 * - Squares (2° lon × 1° lat, e.g. "EN34") when zoomed in
 *
 * Pure client-side math — no network requests. Lines and labels are drawn
 * only for the visible viewport (plus a margin) so panning at square-level
 * zoom stays cheap.
 *
 * On the azimuthal projection viewport bounds are unreliable (the whole
 * disc is always "visible"), so only field-level grid is drawn there.
 */

export const metadata = {
  id: 'maidenhead',
  name: 'plugins.layers.maidenhead.name',
  description: 'plugins.layers.maidenhead.description',
  icon: '🔲',
  category: 'overlay',
  defaultEnabled: false,
  defaultOpacity: 0.5,
  version: '1.0.0',
};

// Zoom level at which we switch from fields (AA) to squares (AA00)
const SQUARE_MIN_ZOOM = 5;
// Safety cap on drawn cells per pass (viewport culling should keep us far below)
const MAX_CELLS = 4000;

// Grid math (normLon / fieldLabel / squareLabel) lives in utils/globeOverlays.js,
// shared with the 3D globe's grid painter so the two projections cannot drift.

export function useLayer({ enabled = false, opacity = 0.5, map = null }) {
  const groupRef = useRef(null);

  useEffect(() => {
    if (!map || !enabled || typeof L === 'undefined') return;

    const isAzimuthal = map.options?.crs?.code === 'AzimuthalEquidistant';
    const group = L.layerGroup();
    group.addTo(map);
    groupRef.current = group;

    // Shared canvas renderer — many thin polylines render much faster on
    // canvas than as individual SVG paths.
    const renderer = L.canvas({ padding: 0.5 });

    // Line/label styling that stays subtle on both dark and light basemaps:
    // mid-gray semi-transparent lines, white labels with a dark outline.
    const lineStyle = (major) => ({
      color: '#999999',
      weight: major ? 1.2 : 0.7,
      opacity: opacity * (major ? 0.7 : 0.45),
      interactive: false,
      renderer,
    });

    const makeLabel = (lat, lon, text, fontSize) =>
      L.marker([lat, lon], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'maidenhead-grid-label',
          html: `<div style="
            font-family: var(--font-mono, monospace);
            font-size: ${fontSize}px;
            font-weight: 600;
            color: rgba(255,255,255,${Math.min(1, opacity + 0.2)});
            text-shadow: 0 0 3px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,0.9);
            white-space: nowrap;
            pointer-events: none;
            transform: translate(-50%, -50%);
          ">${text}</div>`,
          iconSize: [0, 0],
        }),
      });

    const draw = () => {
      group.clearLayers();

      // Determine cell size and visible range
      let zoom = 0;
      try {
        zoom = map.getZoom() ?? 0;
      } catch {
        zoom = 0;
      }

      let useSquares = !isAzimuthal && zoom >= SQUARE_MIN_ZOOM;

      // Visible range. On Mercator the map wraps, so bounds longitudes may
      // exceed ±180 — we iterate the unwrapped range and normalize per cell
      // for labels. On azimuthal, bounds are unreliable: draw the full world.
      let west = -180;
      let east = 180;
      let south = -90;
      let north = 90;
      if (!isAzimuthal) {
        try {
          const b = map.getBounds().pad(0.1);
          west = b.getWest();
          east = b.getEast();
          south = Math.max(-90, b.getSouth());
          north = Math.min(90, b.getNorth());
        } catch {
          /* fall back to whole world */
        }
      }

      // If square-level density would exceed the cell cap for this viewport
      // (very wide screens right at the zoom threshold), degrade to fields
      // rather than drawing nothing.
      if (useSquares && Math.ceil((east - west) / 2 + 1) * Math.ceil((north - south) / 1 + 1) > MAX_CELLS) {
        useSquares = false;
      }

      const lonStep = useSquares ? 2 : 20;
      const latStep = useSquares ? 1 : 10;

      // Snap to grid
      const lonStart = Math.floor(west / lonStep) * lonStep;
      const latStart = Math.floor(south / latStep) * latStep;

      const cols = Math.ceil((east - lonStart) / lonStep);
      const rows = Math.ceil((north - latStart) / latStep);

      // Grid lines. Field boundaries (20°/10°) are drawn heavier so the
      // field structure stays readable at square-level zoom.
      for (let lon = lonStart; lon <= east + 1e-9; lon += lonStep) {
        const major = Math.abs((((normLon(lon) + 180) % 20) + 20) % 20) < 1e-6;
        group.addLayer(
          L.polyline(
            [
              [Math.max(-90, south - latStep), lon],
              [Math.min(90, north + latStep), lon],
            ],
            lineStyle(major),
          ),
        );
      }
      for (let lat = latStart; lat <= north + 1e-9; lat += latStep) {
        if (lat < -90 || lat > 90) continue;
        const major = Math.abs((((lat + 90) % 10) + 10) % 10) < 1e-6;
        group.addLayer(
          L.polyline(
            [
              [lat, lonStart - lonStep],
              [lat, lonStart + (cols + 1) * lonStep],
            ],
            lineStyle(major),
          ),
        );
      }

      // Labels at cell centers
      const fontSize = useSquares ? 10 : 12;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const cellLon = lonStart + c * lonStep;
          const cellLat = latStart + r * latStep;
          if (cellLat < -90 || cellLat + latStep > 90 + 1e-9) continue;
          const text = useSquares ? squareLabel(cellLat, cellLon) : fieldLabel(cellLat, cellLon);
          if (!text) continue;
          group.addLayer(makeLabel(cellLat + latStep / 2, cellLon + lonStep / 2, text, fontSize));
        }
      }
    };

    draw();
    map.on('moveend zoomend', draw);

    return () => {
      try {
        map.off('moveend zoomend', draw);
      } catch {}
      try {
        group.clearLayers();
        map.removeLayer(group);
      } catch {}
      groupRef.current = null;
    };
  }, [map, enabled, opacity]);

  return {};
}
