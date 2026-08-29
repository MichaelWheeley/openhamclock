/**
 * History Playback layer — scrub through the last 24 hours of DX spots.
 *
 * "What was 10m doing at 1800Z?" — the server records the cluster flow into
 * a rolling 24h ring (server/routes/history.js); this layer adds a draggable
 * transport control (timeline slider, window size, play/pause, speed) and
 * draws the selected window's spot paths on the flat map, colored by band,
 * fading older spots within the window.
 *
 * Data starts accumulating when the server boots, so a fresh install only
 * has history back to its own start — the control shows the earliest
 * available time.
 */
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../utils/apiFetch.js';
import { getGreatCirclePoints, replicatePath } from '../../utils/geo.js';
import { getBandColorForFreq } from '../../utils/bandColors.js';
import { makeDraggable } from './makeDraggable.js';
import { addMinimizeToggle } from './addMinimizeToggle.js';

export const metadata = {
  id: 'history-playback',
  name: 'History Playback',
  description: 'Replay the last 24 hours of DX spots with a time scrubber',
  icon: '⏪',
  category: 'activity',
  defaultEnabled: false,
  defaultOpacity: 0.8,
  version: '1.0.0',
};

const DAY_MIN = 24 * 60;
const WINDOW_CHOICES = [5, 15, 30, 60];
const SPEED_CHOICES = [
  { label: '1 min/s', minPerTick: 0.5 }, // ticks run every 500 ms
  { label: '5 min/s', minPerTick: 2.5 },
  { label: '15 min/s', minPerTick: 7.5 },
];
const MAX_DRAWN = 500;

const utcHHMM = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}z`;
};

export function useLayer({ enabled = false, opacity = 0.8, map = null }) {
  // endOffsetMin = minutes before "now" where the window ENDS (0 = live edge)
  const [endOffsetMin, setEndOffsetMin] = useState(0);
  const [windowMin, setWindowMin] = useState(15);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [meta, setMeta] = useState(null); // { earliest, latest, count }
  const [result, setResult] = useState(null); // last fetch response

  const layerRef = useRef(null);
  const controlRef = useRef(null);
  const fetchDebounceRef = useRef(null);
  const stateRef = useRef({});
  stateRef.current = { endOffsetMin, windowMin, playing, speedIdx };

  // ── Server meta (earliest available history) ──────────────────────────────
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = () =>
      apiFetch('/api/history/meta')
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => alive && m && setMeta(m))
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);

  // ── Playback clock ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !playing) return undefined;
    const t = setInterval(() => {
      setEndOffsetMin((cur) => {
        const next = cur - SPEED_CHOICES[stateRef.current.speedIdx].minPerTick;
        if (next <= 0) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
    }, 500);
    return () => clearInterval(t);
  }, [enabled, playing, speedIdx]);

  // ── Window fetch (debounced while scrubbing) ──────────────────────────────
  useEffect(() => {
    if (!enabled) return undefined;
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = setTimeout(() => {
      const to = Date.now() - endOffsetMin * 60 * 1000;
      const from = to - windowMin * 60 * 1000;
      apiFetch(`/api/history/spots?from=${Math.round(from)}&to=${Math.round(to)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setResult(data))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(fetchDebounceRef.current);
  }, [enabled, endOffsetMin, windowMin]);

  // ── Draw ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const L = window.L;
    if (!map || !L) return undefined;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!enabled || !result?.spots?.length) return undefined;

    const group = L.layerGroup();
    const { from, to } = result;
    const span = Math.max(1, to - from);
    const drawn = result.spots.slice(-MAX_DRAWN);

    for (const s of drawn) {
      if (s.dxLat == null || s.dxLon == null) continue;
      const color = getBandColorForFreq(s.freq);
      // Newer spots within the window draw stronger
      const age = Math.max(0, Math.min(1, (s.timestamp - from) / span));
      const alpha = opacity * (0.25 + 0.75 * age);

      if (s.spotterLat != null && s.spotterLon != null) {
        const arc = getGreatCirclePoints(s.spotterLat, s.spotterLon, s.dxLat, s.dxLon, 24);
        for (const copy of replicatePath(arc)) {
          group.addLayer(L.polyline(copy, { color, weight: 1, opacity: alpha, interactive: false }));
        }
      }
      const dot = L.circleMarker([s.dxLat, s.dxLon], {
        radius: 3,
        fillColor: color,
        color: '#000',
        weight: 0.5,
        opacity: alpha,
        fillOpacity: alpha,
      });
      dot.bindTooltip(`${s.dxCall} · ${s.freq} · ${utcHHMM(s.timestamp)}`, { direction: 'top' });
      group.addLayer(dot);
    }

    group.addTo(map);
    layerRef.current = group;
    return undefined;
  }, [map, enabled, result, opacity]);

  // ── Transport control ─────────────────────────────────────────────────────
  useEffect(() => {
    const L = window.L;
    if (!enabled || !map || !L || controlRef.current) return undefined;

    const Control = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const wrapper = L.DomUtil.create('div', 'panel-wrapper');
        const div = L.DomUtil.create('div', 'history-playback-control', wrapper);
        div.style.minWidth = '230px';
        div.innerHTML = `
          <div class="floating-panel-header">⏪ History Playback</div>
          <div class="history-panel-content">
            <div id="hist-label" style="font-family:var(--font-mono);font-size:12px;color:var(--text-primary);margin-bottom:4px;">—</div>
            <input id="hist-slider" type="range" min="0" max="${DAY_MIN}" step="1" style="width:100%;direction:rtl;" aria-label="Playback time (minutes before now)" />
            <div style="display:flex;gap:4px;align-items:center;margin-top:6px;">
              <button id="hist-play" style="flex:0 0 auto;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;">▶</button>
              <select id="hist-window" aria-label="Window size" style="background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);padding:3px;font-size:11px;">
                ${WINDOW_CHOICES.map((w) => `<option value="${w}">${w} min</option>`).join('')}
              </select>
              <select id="hist-speed" aria-label="Playback speed" style="background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);padding:3px;font-size:11px;">
                ${SPEED_CHOICES.map((s, i) => `<option value="${i}">${s.label}</option>`).join('')}
              </select>
              <button id="hist-live" title="Jump to now" style="background:var(--bg-tertiary);color:var(--accent-green);border:1px solid var(--border-color);border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">LIVE</button>
            </div>
            <div id="hist-stats" style="font-size:10px;color:var(--text-muted);margin-top:6px;">Loading…</div>
          </div>`;

        div.querySelector('#hist-slider').addEventListener('input', (e) => {
          setPlaying(false);
          setEndOffsetMin(parseInt(e.target.value, 10) || 0);
        });
        div.querySelector('#hist-play').addEventListener('click', () => {
          // Playing from the live edge makes no sense — rewind first
          if (stateRef.current.endOffsetMin <= 0 && !stateRef.current.playing) return;
          setPlaying((p) => !p);
        });
        div.querySelector('#hist-window').value = String(stateRef.current.windowMin);
        div.querySelector('#hist-window').addEventListener('change', (e) => setWindowMin(parseInt(e.target.value, 10)));
        div.querySelector('#hist-speed').addEventListener('change', (e) => setSpeedIdx(parseInt(e.target.value, 10)));
        div.querySelector('#hist-live').addEventListener('click', () => {
          setPlaying(false);
          setEndOffsetMin(0);
        });

        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        return wrapper;
      },
    });

    const control = new Control();
    map.addControl(control);
    controlRef.current = control;

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const container = controlRef.current?.getContainer()?.querySelector('.history-playback-control');
        if (!container) return;
        const saved = localStorage.getItem('history-playback-panel-position');
        if (saved) {
          try {
            const { top, left } = JSON.parse(saved);
            container.style.position = 'fixed';
            container.style.top = top + 'px';
            container.style.left = left + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
          } catch (_) {}
        }
        makeDraggable(container, 'history-playback-panel-position', { snap: 5 });
        addMinimizeToggle(container, 'history-playback-panel-position', {
          contentClassName: 'history-panel-content',
          buttonClassName: 'history-minimize-btn',
        });
      }),
    );

    return () => {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
    };
  }, [map, enabled]);

  // ── Control readouts ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !controlRef.current) return;
    const root = controlRef.current.getContainer();
    if (!root) return;

    const to = Date.now() - endOffsetMin * 60 * 1000;
    const from = to - windowMin * 60 * 1000;
    const label = root.querySelector('#hist-label');
    if (label) label.textContent = `${utcHHMM(from)} – ${utcHHMM(to)}${endOffsetMin <= 0 ? ' (live edge)' : ''}`;

    const slider = root.querySelector('#hist-slider');
    if (slider && parseInt(slider.value, 10) !== Math.round(endOffsetMin))
      slider.value = String(Math.round(endOffsetMin));

    const play = root.querySelector('#hist-play');
    if (play) play.textContent = playing ? '⏸' : '▶';

    const stats = root.querySelector('#hist-stats');
    if (stats) {
      const parts = [];
      if (result) {
        parts.push(`${result.total} spot${result.total === 1 ? '' : 's'} in window`);
        if (result.total > MAX_DRAWN) parts.push(`drawing newest ${MAX_DRAWN}`);
        else if (result.downsampled) parts.push('downsampled');
      }
      if (meta?.earliest) parts.push(`history since ${utcHHMM(meta.earliest)}`);
      stats.textContent = parts.join(' · ') || 'Loading…';
    }
  }, [enabled, endOffsetMin, windowMin, playing, result, meta]);

  // Cleanup when the layer is disabled
  useEffect(() => {
    if (enabled) return undefined;
    setPlaying(false);
    setEndOffsetMin(0);
    setResult(null);
    if (layerRef.current && map) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    return undefined;
  }, [enabled, map]);

  return null;
}

export default { metadata, useLayer };
