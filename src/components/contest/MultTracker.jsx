/**
 * MultTracker — session multipliers + score estimate for the Contest layout.
 *
 * Scoped to QSOs logged since the session's "Start contest" marker. Counts
 * unique DXCC entities, CQ zones, and (when the log carries ADIF STATE
 * fields) US states, overall and per band — all via utils/contestSession.js,
 * which reuses the awards.js resolution rules (cty.dat).
 *
 * The score is QSOs × mults, clearly labeled as a generic estimate — real
 * contests each have their own point and multiplier rules.
 */
import { useEffect, useMemo, useState } from 'react';
import { computeSessionMults } from '../../utils/contestSession.js';

const BAND_ORDER = ['160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m', '4m', '2m', '70cm'];

const Big = ({ label, value, accent }) => (
  <div style={{ textAlign: 'center', minWidth: '60px' }}>
    <div
      style={{
        fontSize: '20px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color: accent || 'var(--text-primary)',
        lineHeight: 1.1,
      }}
    >
      {value}
    </div>
    <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {label}
    </div>
  </div>
);

export const MultTracker = ({ qsos, session }) => {
  // cty.dat may land after the first compute — recompute when it does.
  const [ctyTick, setCtyTick] = useState(0);
  useEffect(() => {
    const onCty = () => setCtyTick((n) => n + 1);
    window.addEventListener('openhamclock-cty-loaded', onCty);
    return () => window.removeEventListener('openhamclock-cty-loaded', onCty);
  }, []);

  const mults = useMemo(
    () => computeSessionMults(qsos, { startedAt: session?.startedAt }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qsos, session?.startedAt, ctyTick],
  );

  const bands = useMemo(() => {
    const known = BAND_ORDER.filter((b) => mults.perBand.has(b));
    const extra = [...mults.perBand.keys()].filter((b) => !BAND_ORDER.includes(b));
    return [...known, ...extra];
  }, [mults]);

  if (!session) {
    return (
      <div className="panel" style={{ padding: '10px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '12px', color: 'var(--accent-cyan)', fontWeight: 700, marginBottom: '8px' }}>
          MULTIPLIERS
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic', padding: '12px 4px' }}>
          Press <b>Start contest</b> in the header to begin a session. Multipliers and the score count QSOs logged after
          that moment — your logbook itself is untouched.
        </div>
      </div>
    );
  }

  return (
    <div
      className="panel"
      style={{ padding: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}
    >
      <div
        style={{
          fontSize: '12px',
          color: 'var(--accent-cyan)',
          fontWeight: 700,
          marginBottom: '8px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>MULTIPLIERS</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '9px', fontWeight: 400 }}>this session</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', gap: '6px', marginBottom: '10px' }}>
        <Big label="QSOs" value={mults.qsoCount} />
        <Big label="DXCC" value={mults.entities.size} accent="var(--accent-green)" />
        <Big label="Zones" value={mults.zones.size} accent="var(--accent-amber)" />
        <Big label="States" value={mults.states.size} accent="var(--accent-purple)" />
      </div>

      {/* Score estimate */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'var(--bg-tertiary)',
          borderRadius: '6px',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Score est.</span>
        <span
          style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}
          title={`${mults.qsoCount} QSOs × ${mults.multTotal} mults`}
        >
          {mults.score.toLocaleString()}
        </span>
      </div>

      {/* Per-band table */}
      <div style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
        {bands.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic', padding: '8px 4px' }}>
            No session QSOs yet — work someone!
          </div>
        ) : (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
          >
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: '9px', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '2px 4px' }}>Band</th>
                <th style={{ textAlign: 'right', padding: '2px 4px' }}>Q</th>
                <th style={{ textAlign: 'right', padding: '2px 4px' }}>DXCC</th>
                <th style={{ textAlign: 'right', padding: '2px 4px' }}>Zn</th>
                <th style={{ textAlign: 'right', padding: '2px 4px' }}>St</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b) => {
                const rec = mults.perBand.get(b);
                return (
                  <tr key={b} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '3px 4px', color: 'var(--accent-amber)', fontWeight: 600 }}>{b}</td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-primary)' }}>{rec.qsos}</td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--accent-green)' }}>
                      {rec.entities.size}
                    </td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--accent-amber)' }}>
                      {rec.zones.size}
                    </td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--accent-purple)' }}>
                      {rec.states.size}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
        Score = QSOs × (DXCC + zones + states) — a generic estimate, not any specific contest's rules. States count only
        when QSOs carry an ADIF STATE field.
      </div>
    </div>
  );
};

export default MultTracker;
