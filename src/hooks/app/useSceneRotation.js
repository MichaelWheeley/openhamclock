/**
 * useSceneRotation — kiosk-style automatic layout ("scene") rotation.
 *
 * Settings → Display → Scene rotation persists (with the sibling display
 * settings, via the normal config save path):
 *   config.sceneRotation = {
 *     enabled: boolean,
 *     intervalSec: number,   // 30–600
 *     layouts: string[],     // layout ids from the Settings layout picker
 *   }
 *
 * Rotation is active only when enabled AND at least two layouts are selected.
 * Every tick advances config.layout to the next selected layout (wrapping),
 * through the same save path the Settings layout picker uses, so a reload
 * lands on the last shown scene.
 *
 * Pause semantics:
 *  • `paused` (prop) — true while Settings or any other app modal is open;
 *    while paused the countdown is continuously re-armed to the full
 *    interval, so closing a modal never causes an instant flip.
 *  • user interaction — any pointer/key/wheel/touch activity defers the next
 *    switch until the user has been idle for the 60 s grace period.
 *
 * Returns { active, flash } — `active` drives the on-screen indicator dot,
 * `flash` is { layout, ts } for ~2.5 s after each switch so the indicator can
 * flash the new layout's name.
 */
import { useEffect, useRef, useState } from 'react';

export const SCENE_ROTATION_MIN_SEC = 30;
export const SCENE_ROTATION_MAX_SEC = 600;
const IDLE_GRACE_MS = 60_000;
const FLASH_MS = 2500;
const TICK_MS = 1000;

/** Clamp a stored interval into the supported 30 s – 10 min range. */
export const clampSceneInterval = (sec) => {
  const n = parseInt(sec, 10);
  if (!Number.isFinite(n)) return 60;
  return Math.min(SCENE_ROTATION_MAX_SEC, Math.max(SCENE_ROTATION_MIN_SEC, n));
};

export default function useSceneRotation(config, onSaveConfig, { paused = false } = {}) {
  const rotation = config?.sceneRotation;
  const layouts = Array.isArray(rotation?.layouts) ? rotation.layouts : [];
  const intervalMs = clampSceneInterval(rotation?.intervalSec) * 1000;
  const active = !!rotation?.enabled && layouts.length >= 2;

  const [flash, setFlash] = useState(null); // { layout, ts } | null

  // Refs so the single ticker sees fresh values without re-subscribing.
  const configRef = useRef(config);
  configRef.current = config;
  const saveRef = useRef(onSaveConfig);
  saveRef.current = onSaveConfig;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const lastActivityRef = useRef(0); // 0 = no interaction seen yet
  const dueAtRef = useRef(0);

  // User-activity tracking (capture phase so panels can't swallow it).
  useEffect(() => {
    if (!active) return undefined;
    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    const opts = { capture: true, passive: true };
    window.addEventListener('pointerdown', bump, opts);
    window.addEventListener('pointermove', bump, opts);
    window.addEventListener('keydown', bump, opts);
    window.addEventListener('wheel', bump, opts);
    window.addEventListener('touchstart', bump, opts);
    return () => {
      window.removeEventListener('pointerdown', bump, opts);
      window.removeEventListener('pointermove', bump, opts);
      window.removeEventListener('keydown', bump, opts);
      window.removeEventListener('wheel', bump, opts);
      window.removeEventListener('touchstart', bump, opts);
    };
  }, [active]);

  // The ticker. A 1 s heartbeat checking a deadline (rather than one long
  // setTimeout) keeps pause/idle handling trivial and drift-free.
  useEffect(() => {
    if (!active) return undefined;
    dueAtRef.current = Date.now() + intervalMs;
    const id = setInterval(() => {
      const now = Date.now();
      if (pausedRef.current) {
        // Modal open — full re-arm so the scene holds a while after closing.
        dueAtRef.current = now + intervalMs;
        return;
      }
      if (lastActivityRef.current && now - lastActivityRef.current < IDLE_GRACE_MS) {
        // Someone is using the screen — hold until 60 s of quiet.
        dueAtRef.current = Math.max(dueAtRef.current, lastActivityRef.current + IDLE_GRACE_MS);
        return;
      }
      if (now < dueAtRef.current) return;

      const cfg = configRef.current;
      const list = Array.isArray(cfg?.sceneRotation?.layouts) ? cfg.sceneRotation.layouts : [];
      if (list.length < 2) return;
      const cur = list.indexOf(cfg.layout);
      // Current layout not in the rotation (user picked something else
      // manually) → start from the first selected scene.
      const next = cur === -1 ? list[0] : list[(cur + 1) % list.length];
      dueAtRef.current = now + intervalMs;
      if (!next || next === cfg.layout) return;
      saveRef.current?.({ ...cfg, layout: next });
      setFlash({ layout: next, ts: now });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  // Clear the name flash after a short beat.
  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(id);
  }, [flash]);

  return { active, flash };
}
