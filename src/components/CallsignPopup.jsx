/**
 * CallsignPopup — floating info popup for station lookup.
 *
 * Shown when a user clicks a callsign in the UI. Displays station info
 * (name, grid, country, state) and includes a
 * clickable icon to open the callsign in the user's configured callbook.
 *
 *
 * Usage:
 *   <CallsignPopup
 *     anchorRef={refToCallsignSpan}
 *     call="K1ABC"
 *     onClose={() => setShowPopup(false)}
 *   />
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useCallsignLookup from '../hooks/app/useCallsignLookup.js';
import usePopupPosition, { POPUP_HEIGHT_ESTIMATE } from '../hooks/app/usePopupPosition.js';
import useTimezone from '../hooks/app/useTimezone.js';
import { getCallbookUrl, getCallbook, CALLBOOKS } from '../utils/callbook.js';
import { ctyLookup } from '../utils/ctyLookup.js';
import { latLonToMaidenhead } from '../utils/index.js';
import { getListenUrl, loadNearbyReceivers } from '../utils/webSdr.js';

import { IconGlobe, IconRefresh } from './Icons.jsx';
import { extractBaseCall } from './CallsignLink.jsx';

// Styling helpers
const accentColor = 'var(--accent-cyan)';
const borderColor = 'var(--border-color)';
const bgColor = 'var(--bg-secondary)';
const textColor = 'var(--text-primary)';
const mutedColor = 'var(--text-muted)';

// spot — optional { freq, mode } spot context from the surface that opened the
//        popup (freq in kHz). When present, a 🎧 "listen on a web SDR" action
//        is rendered, tuned to the spot's frequency/mode.
// deLocation — optional { lat, lon } of the user's DE location, used to warm
//        the nearby web-SDR receiver directory so 🎧 picks a close receiver.
function CallsignPopup({ anchorRef, call, onClose, popupHeightRef, location, spot, deLocation }) {
  const { t } = useTranslation();
  const popupRef = useRef(null);
  const recalculateRef = useRef(null);
  const pos = usePopupPosition(anchorRef, popupHeightRef, POPUP_HEIGHT_ESTIMATE, (fn) => {
    recalculateRef.current = fn;
  });

  // Measure actual popup height and report it back to the hook
  useEffect(() => {
    const el = popupRef.current;
    if (!el) return;

    const reportHeight = () => {
      const h = el.getBoundingClientRect().height;
      if (popupHeightRef && h > 0 && h !== popupHeightRef.current) {
        popupHeightRef.current = h;
        recalculateRef.current?.();
      }
    };

    // Initial measurement
    reportHeight();

    // Watch for async content changes (e.g., API data arriving)
    const observer = new ResizeObserver(reportHeight);
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // Fetch rich data from server
  const { data, loading: apiLoading, error } = useCallsignLookup(call);

  // Warm the nearby web-SDR receiver cache so the 🎧 link can be computed
  // synchronously at render time (same pattern as DXClusterPanel). Popups
  // opened from non-cluster surfaces still get directory receivers this way.
  // One re-render when the list lands; getListenUrl() reads the module-level
  // cache directly.
  const [, setSdrDirectoryTick] = useState(0);
  useEffect(() => {
    if (spot == null) return undefined; // no listen action — skip the fetch
    let cancelled = false;
    loadNearbyReceivers(deLocation?.lat, deLocation?.lon).then((list) => {
      if (!cancelled && list) setSdrDirectoryTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [spot, deLocation?.lat, deLocation?.lon]);

  // Web SDR "listen" link — lets rig-less users hear the spotted station.
  const spotFreqKhz = Number(spot?.freq);
  const listen = Number.isFinite(spotFreqKhz) && spotFreqKhz > 0 ? getListenUrl(spotFreqKhz, spot?.mode) : null;

  // Synchronous ctyLookup for grid and country/entity
  const cty = ctyLookup(call);

  // Whether body is expanded (API resolved) — drives grid-template-rows animation
  const expanded = !apiLoading && !!data;

  // Extract base call for callbook URL
  const baseCall = extractBaseCall(call);

  // Get configured callbook ID
  const callbookId = getCallbook();

  // Close on outside click
  const handleClickOutside = useCallback(
    (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target) && !anchorRef?.current?.contains(e.target)) {
        onClose();
      }
    },
    [anchorRef, onClose],
  );

  // Close on Escape
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClickOutside, handleKeyDown]);

  // Build display values
  const name = data?.name || data?.fname || null;
  const grid = data?.grid || cty?.grid || null;
  const country = data?.country && data?.country !== 'Unknown' ? data.country : cty?.entity || null;
  const state = data?.state || null;

  // Local time — cache timezone by grid, format with Intl on demand
  // Convert lat/lon to Maidenhead grid for stable cache keys
  // Debug: track source for hover tooltip
  const effectiveGrid =
    location?.grid ??
    (location?.lat != null && location?.lon != null
      ? latLonToMaidenhead({ lat: location.lat, lon: location.lon })
      : null) ??
    (data?.lat != null && data?.lon != null ? latLonToMaidenhead({ lat: data.lat, lon: data.lon }) : null) ??
    grid ??
    null;

  // Debug: time source string for hover tooltip
  let timeSource = null;
  if (location?.grid) {
    timeSource = `Source: spot grid ${effectiveGrid}`;
  } else if (location?.lat != null && location?.lon != null) {
    timeSource = `Source: spot ${location.lat}, ${location.lon}`;
  } else if (data?.lat != null && data?.lon != null) {
    timeSource = `Source: callbook ${data.lat}, ${data.lon}`;
  } else if (grid) {
    timeSource = 'Source: callbook/cty grid';
  }

  const timeTooltip = timeSource;

  const { localTime } = useTimezone(effectiveGrid);

  const handleCallbookClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (baseCall) {
      window.open(getCallbookUrl(baseCall), '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      ref={popupRef}
      role="tooltip"
      aria-label={`Station info for ${call}`}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        minWidth: 180,
        maxWidth: 300,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        padding: '0',
        zIndex: 10000,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        fontSize: '12px',
        color: textColor,
        lineHeight: 1.4,
        animation: 'fadeIn 0.15s ease-out',
      }}
      className="callsign-popup"
    >
      {/* Header row: callsign + local time + controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px 4px',
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span
            style={{
              fontWeight: '700',
              fontSize: '13px',
              fontFamily: 'var(--font-mono, monospace)',
              letterSpacing: '0.5px',
            }}
          >
            {call}
          </span>
          {localTime && (
            <span
              title={timeTooltip}
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '12px',
                color: accentColor,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {localTime}
            </span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {apiLoading && !data && (
            <IconRefresh size={12} color={accentColor} style={{ animation: 'spin 1s linear infinite' }} />
          )}
          {error && !data && !apiLoading && (
            <span title={error} aria-label={`Lookup error: ${error}`} style={{ cursor: 'help', opacity: 0.7 }}>
              <IconRefresh size={12} color="var(--accent-red)" />
            </span>
          )}
          <a
            href={getCallbookUrl(baseCall)}
            onClick={handleCallbookClick}
            title={`Open ${call} in ${CALLBOOKS.find((cb) => cb.id === callbookId)?.label || 'QRZ.com'}`}
            aria-label={`Open ${call} in ${CALLBOOKS.find((cb) => cb.id === callbookId)?.label || 'QRZ.com'}`}
            rel="noopener noreferrer"
            style={{
              color: accentColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              opacity: 0.7,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.7';
            }}
          >
            <IconGlobe size={12} color={accentColor} />
          </a>
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          padding: '6px 10px 8px',
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.1s ease',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          {/* Name */}
          {name && <div style={{ marginBottom: '3px', opacity: 0.9 }}>{name}</div>}

          {/* Grid + Country/State */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px', opacity: 0.85 }}>
            {grid && (
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontWeight: '600',
                  fontSize: '11px',
                }}
              >
                {grid}
              </span>
            )}
            {grid && country && <span>·</span>}
            {(country || state) && (
              <span style={{ fontSize: '11px' }}>
                {country}
                {state ? ` · ${state}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Listen action — web SDR tuned to the spot frequency/mode */}
      {listen && (
        <div style={{ padding: '0 10px 8px' }}>
          <a
            href={listen.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={t('dxClusterPanel.listenTooltip', {
              defaultValue: 'Listen on a web SDR ({{receiver}})',
              receiver: listen.name,
            })}
            aria-label={t('dxClusterPanel.listenTooltip', {
              defaultValue: 'Listen on a web SDR ({{receiver}})',
              receiver: listen.name,
            })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              color: accentColor,
              textDecoration: 'none',
              fontSize: '11px',
              opacity: 0.85,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.85';
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '10px' }}>
              🎧
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {listen.name}
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

export default CallsignPopup;
