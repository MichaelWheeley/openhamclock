/**
 * ContestLogStrip — the Contest layout's keyboard-first quick-log bar.
 *
 * One persistent callsign box: typing shows an instant DUPE / WORKED / NEW
 * verdict for the current band+mode (worked-before index) plus an award flag
 * when the call's DXCC entity would be a new one (ATNO) or a new band.
 * Enter logs the QSO straight into the native logbook with the rig's current
 * frequency/mode — or the manual band/mode picks when no rig is connected —
 * then clears the box and keeps focus, ready for the next call.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useRig } from '../../contexts/RigContext.jsx';
import { useWorkedBefore } from '../../hooks/useWorkedBefore.js';
import { useAwards } from '../../hooks/useAwards.js';
import { add as addQso } from '../../services/logbookStore.js';
import { onQsoLogged } from '../../utils/logsync.js';
import { getBandFromFreq } from '../../utils/callsign.js';

const BANDS = ['160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m', '2m', '70cm'];
const MODES = ['SSB', 'CW', 'FT8', 'FT4', 'RTTY', 'PSK31', 'FM', 'AM'];

/** Representative in-band frequency (MHz) when no rig supplies the real one. */
const BAND_FREQ_MHZ = {
  '160m': 1.9,
  '80m': 3.7,
  '60m': 5.36,
  '40m': 7.1,
  '30m': 10.12,
  '20m': 14.2,
  '17m': 18.12,
  '15m': 21.25,
  '12m': 24.95,
  '10m': 28.4,
  '6m': 50.15,
  '2m': 145,
  '70cm': 435,
};

const PHONE_MODES = new Set(['SSB', 'USB', 'LSB', 'AM', 'FM']);
const rstFor = (mode) => (PHONE_MODES.has(String(mode || '').toUpperCase()) ? '59' : '599');

/** Collapse a rig mode string to a loggable ADIF-ish mode. */
const logModeFromRig = (rigMode) => {
  const m = String(rigMode || '')
    .trim()
    .toUpperCase();
  if (!m) return '';
  if (m === 'USB' || m === 'LSB') return 'SSB';
  if (m.startsWith('CW')) return 'CW';
  if (m.startsWith('DATA') || m.startsWith('PKT') || m === 'RTTY-R') return 'DATA';
  return m;
};

const utcNowFields = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return {
    qso_date: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
    time_on: `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`,
  };
};

const BADGES = {
  dupe: { text: 'DUPE', color: '#ef4444', title: 'Already worked on this band+mode' },
  worked: { text: 'WKD', color: '#f59e0b', title: 'In the log, but not on this band+mode' },
  new: { text: 'NEW', color: '#22c55e', title: 'Not in the log' },
};

const AWARD_BADGES = {
  new: { text: 'NEW ENTITY', color: '#a855f7', title: 'DXCC entity not in the log at all (ATNO)' },
  'new-band': { text: 'NEW BAND', color: '#22d3ee', title: 'Entity worked, but not on this band' },
};

const selectStyle = {
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  color: 'var(--text-primary)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  padding: '5px 6px',
};

export const ContestLogStrip = ({ userCallsign, myGrid }) => {
  const { connected, freq: rigFreqHz, mode: rigModeRaw, tuneEnabled } = useRig();
  const { getStatus: getWorkedStatus, hasData: hasLogData } = useWorkedBefore();
  const { getSpotStatus: getAwardStatus } = useAwards();

  const [call, setCall] = useState('');
  const [manualBand, setManualBand] = useState('20m');
  const [manualMode, setManualMode] = useState('SSB');
  const [lastLogged, setLastLogged] = useState(null); // { call, band, mode, time_on }
  const inputRef = useRef(null);

  const rigActive = connected && rigFreqHz > 0;
  const freqMHz = rigActive ? rigFreqHz / 1e6 : BAND_FREQ_MHZ[manualBand];
  const band = rigActive ? getBandFromFreq(rigFreqHz) : manualBand;
  const mode = rigActive ? logModeFromRig(rigModeRaw) || manualMode : manualMode;

  const trimmed = call.trim().toUpperCase();

  // Live verdict — worked-before per band+mode, award status per entity/band.
  const workedStatus = useMemo(
    () => (trimmed.length >= 3 ? getWorkedStatus(trimmed, freqMHz, mode) : null),
    [trimmed, freqMHz, mode, getWorkedStatus],
  );
  const awardStatus = useMemo(
    () => (trimmed.length >= 3 ? getAwardStatus(trimmed, freqMHz) : null),
    [trimmed, freqMHz, getAwardStatus],
  );

  const badge = trimmed.length >= 3 ? BADGES[workedStatus || 'new'] : null;
  const awardBadge = awardStatus ? AWARD_BADGES[awardStatus] : null;

  const logIt = useCallback(async () => {
    if (!trimmed || !/\d/.test(trimmed) || trimmed.length < 3) return;
    const rst = rstFor(mode);
    const record = {
      call: trimmed,
      ...utcNowFields(),
      band: band && band !== 'other' ? band : '',
      mode,
      freq: rigActive ? Math.round((rigFreqHz / 1e6) * 1e6) / 1e6 : undefined,
      rst_sent: rst,
      rst_rcvd: rst,
      my_gridsquare: myGrid || '',
      extras: {},
    };
    const saved = await addQso(record);
    // Wavelog/QRZ push when those integrations are enabled (retry queue).
    onQsoLogged(saved, { myCall: userCallsign });
    setLastLogged({ call: record.call, band: record.band, mode: record.mode, time_on: record.time_on });
    setCall('');
    inputRef.current?.focus();
  }, [trimmed, band, mode, rigActive, rigFreqHz, myGrid, userCallsign]);

  return (
    <div
      className="panel"
      style={{
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={call}
        autoFocus
        onChange={(e) => setCall(e.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            logIt();
          } else if (e.key === 'Escape') {
            setCall('');
          }
        }}
        placeholder="CALLSIGN — Enter logs, Esc clears"
        aria-label="Quick log callsign entry"
        spellCheck={false}
        autoComplete="off"
        style={{
          flex: '1 1 220px',
          minWidth: '180px',
          padding: '8px 12px',
          background: 'var(--bg-secondary)',
          border: `2px solid ${badge ? badge.color : 'var(--border-color)'}`,
          borderRadius: '6px',
          color: 'var(--text-primary)',
          fontSize: '20px',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      />

      {/* Verdict badges */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', minWidth: '120px' }}>
        {badge && (
          <span
            title={badge.title}
            style={{
              background: `${badge.color}22`,
              border: `1px solid ${badge.color}`,
              color: badge.color,
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              padding: '3px 10px',
              borderRadius: '4px',
              letterSpacing: '1px',
            }}
          >
            {badge.text}
          </span>
        )}
        {awardBadge && (
          <span
            title={awardBadge.title}
            style={{
              background: `${awardBadge.color}22`,
              border: `1px solid ${awardBadge.color}`,
              color: awardBadge.color,
              fontSize: '10px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: '4px',
              letterSpacing: '0.5px',
            }}
          >
            {awardBadge.text}
          </span>
        )}
        {badge && !hasLogData && (
          <span
            style={{ fontSize: '9px', color: 'var(--text-muted)' }}
            title="Dupe checking starts once the log has QSOs"
          >
            (log empty)
          </span>
        )}
      </div>

      {/* Band / mode: live from the rig, manual picks otherwise */}
      {rigActive ? (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)' }}
          title={tuneEnabled ? 'Following the rig (click-to-tune enabled)' : 'Following the rig'}
        >
          <span style={{ color: 'var(--accent-green)', fontSize: '10px', fontWeight: 700 }}>● RIG</span>
          <span style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600 }}>
            {(rigFreqHz / 1e6).toFixed(3)} MHz
          </span>
          <span style={{ color: 'var(--accent-amber)', fontSize: '13px', fontWeight: 600 }}>
            {band !== 'other' ? band : ''} {mode}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <select
            value={manualBand}
            onChange={(e) => {
              setManualBand(e.target.value);
              inputRef.current?.focus();
            }}
            aria-label="Band"
            style={selectStyle}
          >
            {BANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={manualMode}
            onChange={(e) => {
              setManualMode(e.target.value);
              inputRef.current?.focus();
            }}
            aria-label="Mode"
            style={selectStyle}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Last logged confirmation */}
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: '150px' }}>
        {lastLogged
          ? `✓ ${lastLogged.call} · ${lastLogged.band} ${lastLogged.mode} · ${lastLogged.time_on.slice(0, 2)}:${lastLogged.time_on.slice(2, 4)}z`
          : 'No QSO logged yet this view'}
      </div>
    </div>
  );
};

export default ContestLogStrip;
