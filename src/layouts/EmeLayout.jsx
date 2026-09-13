/**
 * EmeLayout — Earth-Moon-Earth (moonbounce) operating dashboard.
 *
 * The 3D globe is pinned (the user's saved projection is untouched) and
 * framed so Earth and Moon share the view, with the DE→Moon and Moon→DX legs
 * drawn between them. The rail carries what a moonbounce operator plans by:
 * where the moon is from both ends right now, the next mutual windows, the
 * sky tracks for both stations on one dial, a DX entry, and cluster spots
 * that look like EME traffic.
 *
 * Satellite-relay (DE→sat→DX) is a planned follow-up on the same chassis.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { WorldMap } from '../components';
import { DXGridInput } from '../components/DXGridInput.jsx';
import { MoonSkyChart } from '../components/MoonSkyChart.jsx';
import { latLonToMaidenhead } from '../utils/geo.js';
import {
  computeEmeSnapshot,
  computeMutualWindows,
  computeSkyTracks,
  isEmeSpot,
  formatDurationShort,
} from '../utils/eme.js';
import { findDXPathForSpot } from '../utils/dxClusterSpotMatcher';

const ACCENT = '#c9d1e6'; // moonlight
const DE_COLOR = '#4488ff';
const DX_COLOR = '#00ddff';

const fmtUtc = (d) => (d ? d.toISOString().substring(11, 16) + 'z' : '—');
const fmtDay = (d) => (d ? d.toISOString().substring(5, 10) : '');

export default function EmeLayout(props) {
  const {
    config,
    utcTime,
    isLocalInstall,
    dxLocation,
    dxCallsign,
    dxGrid,
    dxLocked,
    handleDXChange,
    handleToggleDxLock,
    dxClusterData,
    dxFilters,
    mapBandFilter,
    setMapBandFilter,
    mapLayers,
    toggleDXLabels,
    hoveredSpot,
    setShowSettings,
  } = props;

  const [seconds, setSeconds] = useState(() => String(new Date().getUTCSeconds()).padStart(2, '0'));
  const [minuteTick, setMinuteTick] = useState(0);
  const [frameKey, setFrameKey] = useState(0);
  const [minElev, setMinElev] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setSeconds(String(now.getUTCSeconds()).padStart(2, '0'));
      if (now.getUTCSeconds() === 0) setMinuteTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const de = config.location;
  const dxLat = dxLocation?.lat;
  const dxLon = dxLocation?.lon;

  // Moon now, both ends — one-minute cadence (the moon moves ≤0.25°/min).
  const snap = useMemo(
    () => computeEmeSnapshot(new Date(), de, dxLocation),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [de?.lat, de?.lon, dxLat, dxLon, minuteTick],
  );

  // Mutual windows and sky tracks are heavier scans; every 10 minutes or on
  // a DX / threshold change is plenty.
  const tenMinTick = Math.floor(minuteTick / 10);
  const windows = useMemo(
    () => computeMutualWindows(new Date(), de, dxLocation, { hours: 48, minElev }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [de?.lat, de?.lon, dxLat, dxLon, minElev, tenMinTick],
  );
  const tracks = useMemo(
    () => computeSkyTracks(new Date(), de, dxLocation),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [de?.lat, de?.lon, dxLat, dxLon, tenMinTick],
  );

  const emeSpots = useMemo(() => (dxClusterData?.spots || []).filter(isEmeSpot), [dxClusterData?.spots]);

  const handleSpotClick = useCallback(
    (spot) => {
      const path = findDXPathForSpot(dxClusterData?.paths || [], spot);
      if (path && Number.isFinite(path.dxLat) && Number.isFinite(path.dxLon)) {
        handleDXChange({ lat: path.dxLat, lon: path.dxLon, callsign: spot.call ?? null });
      }
    },
    [dxClusterData?.paths, handleDXChange],
  );

  const nextWindow = windows.find((w) => !w.open);
  const openWindow = windows.find((w) => w.open);
  const deGridStr = (config.locator || (de ? latLonToMaidenhead(de, 6) : '') || '').toUpperCase();

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'grid',
        gridTemplateRows: '44px 1fr',
        background: '#05060a',
        fontFamily: 'var(--font-mono)',
        overflow: 'hidden',
        color: '#ccc',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: '#0b0d14',
          borderBottom: '1px solid #232838',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{ color: ACCENT, fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
            onClick={() => setShowSettings(true)}
            title="Open settings"
          >
            {config.callsign || 'N0CALL'}
          </span>
          <span style={{ color: '#667', fontSize: '11px' }}>{deGridStr}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{snap?.moon.phaseEmoji || '🌙'}</span>
          <span style={{ color: ACCENT, fontWeight: 700, fontSize: '16px', letterSpacing: '2px' }}>
            EME · MOONBOUNCE
          </span>
          <span
            style={{
              color: '#888',
              fontSize: '9px',
              border: '1px solid #555',
              borderRadius: '3px',
              padding: '1px 4px',
              marginLeft: '4px',
            }}
          >
            BETA
          </span>
          {snap && (
            <span
              style={{
                marginLeft: '10px',
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '10px',
                background: snap.mutual ? 'rgba(34,197,94,0.15)' : 'rgba(136,136,136,0.12)',
                color: snap.mutual ? '#22c55e' : '#888',
                border: `1px solid ${snap.mutual ? '#22c55e' : '#444'}`,
              }}
            >
              {snap.mutual ? 'MUTUAL WINDOW OPEN' : snap.dx ? 'NO COMMON MOON' : 'SET A DX TARGET'}
            </span>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px' }}>
          <span style={{ color: '#fff', fontWeight: 600 }}>
            {utcTime}:{seconds}
          </span>
          <span style={{ color: '#888', marginLeft: '6px', fontSize: '11px' }}>UTC</span>
        </div>
      </div>

      {/* MAIN: GLOBE + SIDEBAR */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', overflow: 'hidden' }}>
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <WorldMap
            config={config}
            isLocalInstall={isLocalInstall}
            deLocation={config.location}
            dxLocation={dxLocation}
            onDXChange={handleDXChange}
            dxLocked={dxLocked}
            projectionOverride="globe3d"
            emeMode={true}
            emeFrameKey={frameKey}
            potaSpots={[]}
            sotaSpots={[]}
            wwbotaSpots={[]}
            canparksSpots={[]}
            mySpots={[]}
            dxPaths={[]}
            dxFilters={dxFilters}
            mapBandFilter={mapBandFilter}
            onMapBandFilterChange={setMapBandFilter}
            satellites={[]}
            pskReporterSpots={[]}
            showDeDxMarkers={mapLayers?.showDeDxMarkers ?? true}
            showDXPaths={false}
            showDXLabels={false}
            onToggleDXLabels={toggleDXLabels}
            showPOTA={false}
            showSOTA={false}
            showWWBOTA={false}
            showCANParks={false}
            showSatellites={false}
            showPSKReporter={false}
            showPSKPaths={false}
            wsjtxSpots={[]}
            showWSJTX={false}
            showDXNews={false}
            showAPRS={false}
            showMeshCom={false}
            hoveredSpot={hoveredSpot}
            hideOverlays={true}
            callsign={config.callsign}
            lowMemoryMode={config.lowMemoryMode}
            allUnits={config.allUnits}
            mouseZoom={config.mouseZoom}
          />
          <button
            onClick={() => setFrameKey((k) => k + 1)}
            title="Frame Earth and Moon"
            style={{
              position: 'absolute',
              left: '12px',
              bottom: '12px',
              zIndex: 1000,
              background: 'rgba(11,13,20,0.85)',
              color: ACCENT,
              border: `1px solid ${ACCENT}55`,
              borderRadius: '4px',
              padding: '5px 10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }}
          >
            🌙 Frame Earth + Moon
          </button>
        </div>

        {/* SIDEBAR */}
        <div
          style={{
            background: '#0b0d14',
            borderLeft: '1px solid #232838',
            overflowY: 'auto',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* MOON NOW */}
          <PanelSection title="Moon Now" color={ACCENT}>
            {!snap ? (
              <EmptyState text="Set your station location in Settings" />
            ) : (
              <div style={{ padding: '4px 8px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', marginBottom: '6px' }}>
                  <span>
                    {snap.moon.phaseEmoji} {phaseName(snap.moon.phase)}
                  </span>
                  <span>{Math.round(snap.moon.distanceKm).toLocaleString()} km</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', marginBottom: '8px' }}>
                  <span>
                    Dec{' '}
                    <b style={{ color: snap.moon.declination >= 0 ? '#22c55e' : '#f59e0b' }}>
                      {snap.moon.declination >= 0 ? '+' : ''}
                      {snap.moon.declination.toFixed(1)}°
                    </b>
                  </span>
                  <span>
                    Path{' '}
                    <b style={{ color: snap.moon.pathDeltaDb <= 0 ? '#22c55e' : '#f59e0b' }}>
                      {snap.moon.pathDeltaDb >= 0 ? '+' : ''}
                      {snap.moon.pathDeltaDb.toFixed(1)} dB
                    </b>
                    <span style={{ color: '#667' }}> vs mean</span>
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <StationCard label="DE" color={DE_COLOR} view={snap.de} grid={deGridStr} />
                  <StationCard
                    label={dxCallsign ? `DX · ${dxCallsign}` : 'DX'}
                    color={DX_COLOR}
                    view={snap.dx}
                    grid={dxGrid}
                  />
                </div>
              </div>
            )}
          </PanelSection>

          {/* SKY TRACKS */}
          <PanelSection title="Sky Tracks · next 24h" color={ACCENT}>
            {!snap ? (
              <EmptyState text="No station location" />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 8px' }}>
                <MoonSkyChart
                  size={150}
                  ariaLabel="Moon sky tracks for DE and DX"
                  tracks={[
                    { points: tracks.de, color: DE_COLOR },
                    { points: tracks.dx, color: DX_COLOR, dash: '3,2' },
                  ]}
                  markers={[
                    { az: snap.de?.azimuth, el: snap.de?.elevation, color: DE_COLOR, label: 'DE' },
                    ...(snap.dx ? [{ az: snap.dx.azimuth, el: snap.dx.elevation, color: DX_COLOR, label: 'DX' }] : []),
                  ]}
                />
                <div style={{ fontSize: '10px', color: '#aaa', lineHeight: 1.7 }}>
                  <div>
                    <span style={{ color: DE_COLOR }}>━━</span> DE track
                  </div>
                  <div>
                    <span style={{ color: DX_COLOR }}>┄┄</span> DX track
                  </div>
                  <div style={{ color: '#667', marginTop: '4px' }}>
                    Centre = zenith
                    <br />
                    Edge = horizon
                    <br />
                    Hollow = below
                  </div>
                </div>
              </div>
            )}
          </PanelSection>

          {/* MUTUAL WINDOWS */}
          <PanelSection
            title="Mutual Windows · 48h"
            count={windows.length}
            color="#22c55e"
            extra={
              <select
                value={minElev}
                onChange={(e) => setMinElev(Number(e.target.value))}
                title="Minimum elevation at both ends"
                style={{
                  background: '#141826',
                  border: '1px solid #2a3040',
                  borderRadius: '3px',
                  color: '#aaa',
                  fontSize: '9px',
                  padding: '1px 4px',
                  marginLeft: '6px',
                }}
              >
                {[0, 5, 10, 15, 20, 30].map((v) => (
                  <option key={v} value={v}>
                    ≥ {v}°
                  </option>
                ))}
              </select>
            }
          >
            {!snap?.dx ? (
              <EmptyState text="Set a DX target to see when you both see the moon" />
            ) : windows.length === 0 ? (
              <EmptyState text={`No shared moon above ${minElev}° in the next 48 hours`} />
            ) : (
              <div style={{ padding: '2px 4px' }}>
                {nextWindow && !openWindow && (
                  <div style={{ fontSize: '10px', color: '#667', padding: '2px 4px 6px' }}>
                    Next window opens in {formatDurationShort(nextWindow.start - Date.now())}
                  </div>
                )}
                {windows.map((w, i) => (
                  <WindowRow key={i} w={w} />
                ))}
              </div>
            )}
          </PanelSection>

          {/* DX TARGET */}
          <PanelSection title="DX Target" color={DX_COLOR}>
            <div style={{ padding: '4px 8px', fontSize: '11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ color: '#888', fontSize: '10px', minWidth: '34px' }}>GRID</span>
                <DXGridInput
                  dxGrid={dxGrid || ''}
                  onDXChange={handleDXChange}
                  dxLocked={dxLocked}
                  style={{ color: DX_COLOR, fontWeight: 600, fontSize: '13px' }}
                />
                <button
                  onClick={handleToggleDxLock}
                  title={dxLocked ? 'Unlock DX target' : 'Lock DX target'}
                  style={{
                    background: 'none',
                    border: '1px solid #333',
                    borderRadius: '3px',
                    color: dxLocked ? '#f59e0b' : '#888',
                    fontSize: '11px',
                    padding: '1px 6px',
                    cursor: 'pointer',
                  }}
                >
                  {dxLocked ? '🔒' : '🔓'}
                </button>
              </div>
              <div style={{ color: '#667', fontSize: '10px' }}>
                {dxCallsign ? `${dxCallsign} · ` : ''}
                {Number.isFinite(dxLat)
                  ? `${dxLat.toFixed(2)}°, ${dxLon.toFixed(2)}°`
                  : 'Type a grid, click the globe, or pick a spot'}
              </div>
            </div>
          </PanelSection>

          {/* EME SPOTS */}
          <PanelSection title="EME Spots" count={emeSpots.length} color="#a855f7">
            {emeSpots.length === 0 ? (
              <EmptyState text="No cluster spots on EME bands mentioning EME / JT65 / Q65 right now" />
            ) : (
              emeSpots.map((spot, i) => (
                <div
                  key={`${spot.call}-${spot.freq}-${spot.spotter}-${i}`}
                  onClick={() => handleSpotClick(spot)}
                  title="Set as DX target"
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    marginBottom: '2px',
                    borderLeft: '2px solid #a855f7',
                    background: '#0d1117',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#161b2a')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#0d1117')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      <b style={{ color: '#a855f7' }}>{spot.call}</b>
                      <span style={{ color: '#888', marginLeft: '6px', fontSize: '10px' }}>{spot.freq} MHz</span>
                    </span>
                    <span style={{ color: '#667', fontSize: '10px' }}>
                      {spot.time} · {spot.spotter}
                    </span>
                  </div>
                  {spot.comment && (
                    <div
                      style={{
                        color: '#aaa',
                        fontSize: '10px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {spot.comment}
                    </div>
                  )}
                </div>
              ))
            )}
          </PanelSection>
        </div>
      </div>
    </div>
  );
}

function phaseName(phase) {
  if (phase < 0.0625 || phase >= 0.9375) return 'New Moon';
  if (phase < 0.1875) return 'Waxing Crescent';
  if (phase < 0.3125) return 'First Quarter';
  if (phase < 0.4375) return 'Waxing Gibbous';
  if (phase < 0.5625) return 'Full Moon';
  if (phase < 0.6875) return 'Waning Gibbous';
  if (phase < 0.8125) return 'Last Quarter';
  return 'Waning Crescent';
}

/** Per-station az/el card. `view` null → no position yet. */
function StationCard({ label, color, view, grid }) {
  return (
    <div style={{ background: '#0d1117', borderRadius: '4px', padding: '6px 8px', borderTop: `2px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color, fontWeight: 700, fontSize: '10px' }}>{label}</span>
        <span style={{ color: '#667', fontSize: '10px' }}>{grid || ''}</span>
      </div>
      {!view ? (
        <div style={{ color: '#667', fontSize: '10px' }}>no target</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#888' }}>AZ</span>
            <b style={{ color: '#ddd' }}>{Math.round(view.azimuth)}°</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#888' }}>EL</span>
            <b style={{ color: view.up ? '#22c55e' : '#888' }}>
              {view.up ? '▲' : '▼'} {Math.abs(view.elevation).toFixed(1)}°
            </b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#888' }}>{view.up ? 'Set' : 'Rise'}</span>
            <span style={{ color: '#aaa' }}>{fmtUtc(view.up ? view.set : view.rise)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function WindowRow({ w }) {
  const now = Date.now();
  const active = w.start.getTime() <= now && w.end.getTime() > now;
  return (
    <div
      style={{
        padding: '4px 8px',
        fontSize: '11px',
        marginBottom: '2px',
        borderLeft: `2px solid ${active ? '#22c55e' : '#2a3040'}`,
        background: active ? 'rgba(34,197,94,0.08)' : '#0d1117',
        borderRadius: '4px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: active ? '#22c55e' : '#ddd', fontWeight: 600 }}>
          {fmtDay(w.start)} {fmtUtc(w.start)} → {fmtUtc(w.end)}
          {w.truncated ? '+' : ''}
        </span>
        <span style={{ color: '#888' }}>{formatDurationShort(w.end - w.start)}</span>
      </div>
      <div style={{ color: '#667', fontSize: '10px' }}>
        {active ? `open · closes in ${formatDurationShort(w.end - now)}` : w.open ? 'in progress' : ''}
        {active ? ' · ' : ''}peak common elevation {w.peakMinEl.toFixed(0)}° at {fmtUtc(w.peakAt)}
      </div>
    </div>
  );
}

/** Collapsible panel section wrapper (EmComm sibling) */
function PanelSection({ title, count, color, extra, children }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ background: '#080a10', borderRadius: '6px', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 10px',
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid #1c2130',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#888', fontSize: '10px' }}>{collapsed ? '▶' : '▼'}</span>
          <span
            style={{
              color: color || '#ccc',
              fontWeight: 600,
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {title}
          </span>
          {extra && <span onClick={(e) => e.stopPropagation()}>{extra}</span>}
        </div>
        {count > 0 && (
          <span
            style={{
              background: color || '#888',
              color: '#000',
              fontSize: '10px',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '8px',
              minWidth: '18px',
              textAlign: 'center',
            }}
          >
            {count}
          </span>
        )}
      </div>
      {!collapsed && <div style={{ padding: '4px 2px', maxHeight: '320px', overflowY: 'auto' }}>{children}</div>}
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ padding: '12px 8px', color: '#556', fontSize: '11px', textAlign: 'center' }}>{text}</div>;
}
