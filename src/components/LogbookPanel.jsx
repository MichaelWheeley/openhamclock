/**
 * LogbookPanel — native QSO logbook (dockable panel `logbook`).
 *
 * QSOs live in the browser via logbookStore (IndexedDB, in-memory fallback).
 * Features: searchable/filterable table (newest first, render-capped), a
 * New/Edit QSO form with UTC now defaults and rig prefill, ADIF import with
 * dedup, ADIF export, and a "log from spot" hand-off — spot panels call
 * requestLogQso() and this panel opens its form pre-filled.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogbook } from '../hooks/useLogbook.js';
import { consumePendingPrefill, subscribePrefill } from '../services/logbookStore.js';
import { getBandFromFreq } from '../utils/callsign.js';
import { useRig } from '../contexts/RigContext.jsx';
import CallsignLink from './CallsignLink.jsx';
import { useCallsignPopup } from './CallsignPopupManager.jsx';

const MAX_ROWS = 200;

const BANDS = ['630m', '160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m', '4m', '2m', '70cm'];

const MODES = ['SSB', 'CW', 'FT8', 'FT4', 'RTTY', 'PSK31', 'JS8', 'AM', 'FM', 'DIGITALVOICE', 'MFSK', 'OLIVIA'];

const PHONE_MODES = new Set(['SSB', 'USB', 'LSB', 'AM', 'FM', 'DIGITALVOICE']);
const rstDefaultFor = (mode) => (PHONE_MODES.has(String(mode || '').toUpperCase()) ? '59' : '599');
const isDefaultRst = (v) => v === '' || v === '59' || v === '599';

const utcNowFields = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return {
    qso_date: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
    time_on: `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`,
  };
};

/** Band derived from the freq input (MHz); '' when unknown. */
const bandForFreq = (freq) => {
  const f = parseFloat(freq);
  if (!Number.isFinite(f) || f <= 0) return '';
  const band = getBandFromFreq(f);
  return band === 'other' ? '' : band;
};

const blankForm = () => ({
  call: '',
  ...utcNowFields(),
  band: '',
  mode: 'SSB',
  freq: '',
  rst_sent: '59',
  rst_rcvd: '59',
  gridsquare: '',
  name: '',
  comment: '',
  tx_pwr: '',
});

const inputStyle = {
  padding: '4px 6px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '3px',
  color: 'var(--text-primary)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  minWidth: 0,
  width: '100%',
};

const smallBtnStyle = (active, color = 'var(--accent-green)') => ({
  background: active ? 'rgba(0, 255, 136, 0.15)' : 'rgba(100, 100, 100, 0.3)',
  border: `1px solid ${active ? color : '#666'}`,
  color: active ? color : '#888',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '10px',
  fontFamily: 'var(--font-mono)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

export const LogbookPanel = ({ userCallsign, myGrid }) => {
  const { t } = useTranslation();
  const { showPopup } = useCallsignPopup();
  const { qsos, add, update, remove, importAdif, exportAdif, stats } = useLogbook();

  // Rig state is optional — the panel renders inside RigProvider in the app,
  // but stay resilient if it is ever mounted elsewhere (tests, storybooks).
  let rig = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    rig = useRig();
  } catch {
    rig = null;
  }
  const rigFreqMHz = rig?.connected && rig.freq > 0 ? rig.freq / 1e6 : null;
  const rigMode = rig?.connected ? rig.mode || '' : '';

  // ── View state ────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = new QSO
  const [form, setForm] = useState(blankForm);
  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [importSummary, setImportSummary] = useState(null); // {imported, skipped} | {error}
  const fileInputRef = useRef(null);

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const openNewForm = (prefill = {}) => {
    const base = blankForm();
    // Prefill from the rig when the spot didn't bring a frequency.
    if (prefill.freq == null && rigFreqMHz) {
      base.freq = rigFreqMHz.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
      if (rigMode) base.mode = rigMode.toUpperCase();
    }
    const merged = { ...base, ...prefill };
    if (merged.freq != null && merged.freq !== '') {
      merged.freq = String(merged.freq);
      merged.band = bandForFreq(merged.freq) || merged.band || '';
    }
    if (merged.mode) {
      const def = rstDefaultFor(merged.mode);
      merged.rst_sent = def;
      merged.rst_rcvd = def;
    }
    setForm(merged);
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (qso) => {
    setForm({
      call: qso.call || '',
      qso_date: qso.qso_date || '',
      time_on: qso.time_on || '',
      band: qso.band || '',
      mode: qso.mode || '',
      freq: qso.freq != null ? String(qso.freq) : '',
      rst_sent: qso.rst_sent || '',
      rst_rcvd: qso.rst_rcvd || '',
      gridsquare: qso.gridsquare || '',
      name: qso.name || '',
      comment: qso.comment || '',
      tx_pwr: qso.tx_pwr || '',
    });
    setEditingId(qso.id);
    setShowForm(true);
  };

  // ── Log-from-spot hand-off ────────────────────────────────────────────────
  // Consume a prefill queued before this panel mounted, then listen for new
  // ones. openNewForm is intentionally read through a ref so the subscription
  // survives re-renders without re-subscribing.
  const openNewFormRef = useRef(openNewForm);
  openNewFormRef.current = openNewForm;
  useEffect(() => {
    const applyPrefill = (p) => {
      if (!p) return;
      const { requestedAt, ...fields } = p;
      openNewFormRef.current(fields);
    };
    applyPrefill(consumePendingPrefill());
    return subscribePrefill((p) => {
      applyPrefill(p);
      consumePendingPrefill();
    });
  }, []);

  // ── Derived table data ────────────────────────────────────────────────────
  const sorted = useMemo(
    () =>
      [...qsos].sort(
        (a, b) =>
          `${b.qso_date || ''}${b.time_on || ''}`.localeCompare(`${a.qso_date || ''}${a.time_on || ''}`) ||
          (a.call || '').localeCompare(b.call || ''),
      ),
    [qsos],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return sorted.filter((rec) => {
      if (bandFilter && rec.band !== bandFilter) return false;
      if (modeFilter && (rec.mode || '').toUpperCase() !== modeFilter) return false;
      if (!q) return true;
      return (
        (rec.call || '').toUpperCase().includes(q) ||
        (rec.name || '').toUpperCase().includes(q) ||
        (rec.comment || '').toUpperCase().includes(q)
      );
    });
  }, [sorted, search, bandFilter, modeFilter]);

  const visible = filtered.slice(0, MAX_ROWS);

  const bandOptions = useMemo(() => {
    const inLog = Object.keys(stats.byBand);
    return BANDS.filter((b) => inLog.includes(b));
  }, [stats.byBand]);

  const modeOptions = useMemo(
    () =>
      Object.keys(stats.byMode)
        .map((m) => m.toUpperCase())
        .sort(),
    [stats.byMode],
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    const call = form.call.trim().toUpperCase();
    if (!call) return;
    const freqNum = parseFloat(form.freq);
    const record = {
      call,
      qso_date: form.qso_date.trim(),
      time_on: form.time_on.trim(),
      band: form.band || bandForFreq(form.freq),
      mode: (form.mode || '').trim().toUpperCase(),
      freq: Number.isFinite(freqNum) ? freqNum : undefined,
      rst_sent: form.rst_sent.trim(),
      rst_rcvd: form.rst_rcvd.trim(),
      gridsquare: form.gridsquare.trim(),
      name: form.name.trim(),
      comment: form.comment.trim(),
      tx_pwr: form.tx_pwr.trim(),
      my_gridsquare: myGrid || '',
    };
    if (editingId) {
      await update(editingId, record);
    } else {
      await add({ ...record, extras: {} });
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = async () => {
    if (!editingId) return;
    const ok = window.confirm(t('logbook.deleteConfirm', { defaultValue: 'Delete this QSO from your logbook?' }));
    if (!ok) return;
    await remove(editingId);
    setShowForm(false);
    setEditingId(null);
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const result = await importAdif(text);
      setImportSummary(result);
    } catch (err) {
      setImportSummary({ error: String(err?.message || err) });
    }
    setTimeout(() => setImportSummary(null), 8000);
  };

  const handleExport = () => {
    const text = exportAdif({ myCall: userCallsign });
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(
      d.getUTCMinutes(),
    )}${p(d.getUTCSeconds())}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ohc-logbook-${stamp}.adi`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onFreqChange = (value) => {
    setForm((f) => ({ ...f, freq: value, band: bandForFreq(value) || f.band }));
  };

  const onModeChange = (value) => {
    setForm((f) => {
      const def = rstDefaultFor(value);
      return {
        ...f,
        mode: value,
        rst_sent: isDefaultRst(f.rst_sent) ? def : f.rst_sent,
        rst_rcvd: isDefaultRst(f.rst_rcvd) ? def : f.rst_rcvd,
      };
    });
  };

  const formatTime = (time_on) => {
    const tt = String(time_on || '');
    return tt.length >= 4 ? `${tt.slice(0, 2)}:${tt.slice(2, 4)}` : tt;
  };

  const formatDate = (qso_date) => {
    const d = String(qso_date || '');
    return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="panel"
      style={{ padding: '10px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: '12px',
          color: 'var(--accent-green)',
          fontWeight: '700',
          marginBottom: '6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span>
          📓 {t('logbook.title', { defaultValue: 'LOGBOOK' })}{' '}
          <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '400' }}>
            {t('logbook.qsoCount', { defaultValue: '{{total}} QSOs', total: stats.total })}
          </span>
        </span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => (showForm && !editingId ? setShowForm(false) : openNewForm())}
            title={t('logbook.newQsoTooltip', { defaultValue: 'Log a new QSO' })}
            aria-label={t('logbook.newQsoTooltip', { defaultValue: 'Log a new QSO' })}
            aria-pressed={showForm && !editingId}
            style={smallBtnStyle(showForm && !editingId)}
          >
            +{t('logbook.newQso', { defaultValue: 'QSO' })}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title={t('logbook.importTooltip', { defaultValue: 'Import an ADIF (.adi) log file' })}
            aria-label={t('logbook.importTooltip', { defaultValue: 'Import an ADIF (.adi) log file' })}
            style={smallBtnStyle(false)}
          >
            {t('logbook.import', { defaultValue: 'Import' })}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={stats.total === 0}
            title={t('logbook.exportTooltip', { defaultValue: 'Export your log as ADIF (.adi)' })}
            aria-label={t('logbook.exportTooltip', { defaultValue: 'Export your log as ADIF (.adi)' })}
            style={{ ...smallBtnStyle(false), cursor: stats.total === 0 ? 'not-allowed' : 'pointer' }}
          >
            {t('logbook.export', { defaultValue: 'Export' })}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".adi,.adif"
            style={{ display: 'none' }}
            onChange={(e) => {
              handleImportFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Import summary */}
      {importSummary && (
        <div
          role="status"
          style={{
            fontSize: '10px',
            marginBottom: '6px',
            color: importSummary.error ? 'var(--accent-red)' : 'var(--accent-green)',
          }}
        >
          {importSummary.error
            ? t('logbook.importFailed', { defaultValue: 'Import failed: {{error}}', error: importSummary.error })
            : t('logbook.importSummary', {
                defaultValue: 'Imported {{imported}}, skipped {{skipped}} dupes',
                imported: importSummary.imported,
                skipped: importSummary.skipped,
              })}
        </div>
      )}

      {/* QSO form */}
      {showForm && (
        <form
          onSubmit={handleSave}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            marginBottom: '8px',
            padding: '6px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr auto', gap: '4px' }}>
            <input
              type="text"
              required
              placeholder={t('logbook.form.call', { defaultValue: 'Callsign' })}
              aria-label={t('logbook.form.call', { defaultValue: 'Callsign' })}
              value={form.call}
              onChange={(e) => setField('call', e.target.value.toUpperCase())}
              style={{ ...inputStyle, textTransform: 'uppercase', fontWeight: 700 }}
            />
            <input
              type="text"
              placeholder="YYYYMMDD"
              aria-label={t('logbook.form.date', { defaultValue: 'QSO date (UTC, YYYYMMDD)' })}
              value={form.qso_date}
              onChange={(e) => setField('qso_date', e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="HHMMSS"
              aria-label={t('logbook.form.time', { defaultValue: 'Time on (UTC, HHMMSS)' })}
              value={form.time_on}
              onChange={(e) => setField('time_on', e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, ...utcNowFields() }))}
              title={t('logbook.form.nowTooltip', { defaultValue: 'Set date and time to now (UTC)' })}
              style={smallBtnStyle(false)}
            >
              {t('logbook.form.now', { defaultValue: 'now' })}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.9fr 1.1fr 0.7fr 0.7fr', gap: '4px' }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder={t('logbook.form.freq', { defaultValue: 'MHz' })}
              aria-label={t('logbook.form.freqLabel', { defaultValue: 'Frequency in MHz' })}
              value={form.freq}
              onChange={(e) => onFreqChange(e.target.value)}
              style={inputStyle}
            />
            <select
              value={form.band}
              onChange={(e) => setField('band', e.target.value)}
              aria-label={t('logbook.form.band', { defaultValue: 'Band' })}
              style={inputStyle}
            >
              <option value="">{t('logbook.form.band', { defaultValue: 'Band' })}</option>
              {BANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <input
              type="text"
              list="logbook-modes"
              placeholder={t('logbook.form.mode', { defaultValue: 'Mode' })}
              aria-label={t('logbook.form.mode', { defaultValue: 'Mode' })}
              value={form.mode}
              onChange={(e) => onModeChange(e.target.value.toUpperCase())}
              style={{ ...inputStyle, textTransform: 'uppercase' }}
            />
            <datalist id="logbook-modes">
              {MODES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <input
              type="text"
              placeholder={t('logbook.form.rstSent', { defaultValue: 'RST S' })}
              aria-label={t('logbook.form.rstSent', { defaultValue: 'RST sent' })}
              value={form.rst_sent}
              onChange={(e) => setField('rst_sent', e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder={t('logbook.form.rstRcvd', { defaultValue: 'RST R' })}
              aria-label={t('logbook.form.rstRcvd', { defaultValue: 'RST received' })}
              value={form.rst_rcvd}
              onChange={(e) => setField('rst_rcvd', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1fr 1.4fr 0.6fr', gap: '4px' }}>
            <input
              type="text"
              placeholder={t('logbook.form.grid', { defaultValue: 'Grid' })}
              aria-label={t('logbook.form.grid', { defaultValue: 'Gridsquare' })}
              value={form.gridsquare}
              onChange={(e) => setField('gridsquare', e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder={t('logbook.form.name', { defaultValue: 'Name' })}
              aria-label={t('logbook.form.name', { defaultValue: 'Operator name' })}
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder={t('logbook.form.comment', { defaultValue: 'Comment' })}
              aria-label={t('logbook.form.comment', { defaultValue: 'Comment' })}
              value={form.comment}
              onChange={(e) => setField('comment', e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder={t('logbook.form.power', { defaultValue: 'W' })}
              aria-label={t('logbook.form.powerLabel', { defaultValue: 'TX power in watts' })}
              value={form.tx_pwr}
              onChange={(e) => setField('tx_pwr', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button type="submit" style={smallBtnStyle(true)}>
              {editingId
                ? t('logbook.form.save', { defaultValue: 'Save' })
                : t('logbook.form.log', { defaultValue: 'Log QSO' })}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              style={smallBtnStyle(false)}
            >
              {t('logbook.form.cancel', { defaultValue: 'Cancel' })}
            </button>
            {rigFreqMHz && (
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    freq: String(rigFreqMHz.toFixed(4)).replace(/0+$/, '').replace(/\.$/, ''),
                    band: bandForFreq(rigFreqMHz) || f.band,
                    mode: rigMode ? rigMode.toUpperCase() : f.mode,
                  }))
                }
                title={t('logbook.form.fromRigTooltip', {
                  defaultValue: 'Fill frequency and mode from the connected rig',
                })}
                style={smallBtnStyle(false, 'var(--accent-cyan)')}
              >
                {t('logbook.form.fromRig', { defaultValue: 'Rig' })}
              </button>
            )}
            <span style={{ flex: 1 }} />
            {editingId && (
              <button
                type="button"
                onClick={handleDelete}
                title={t('logbook.deleteTooltip', { defaultValue: 'Delete this QSO' })}
                style={{
                  ...smallBtnStyle(false),
                  border: '1px solid var(--accent-red)',
                  color: 'var(--accent-red)',
                  background: 'rgba(255, 68, 68, 0.12)',
                }}
              >
                {t('logbook.form.delete', { defaultValue: 'Delete' })}
              </button>
            )}
          </div>
        </form>
      )}

      {/* Search + filters */}
      {stats.total > 0 && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
          <input
            type="text"
            placeholder={t('logbook.search', { defaultValue: 'Search call / name / comment...' })}
            aria-label={t('logbook.search', { defaultValue: 'Search logbook' })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <select
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
            aria-label={t('logbook.filterBand', { defaultValue: 'Filter by band' })}
            style={{ ...inputStyle, width: 'auto', flex: '0 0 auto' }}
          >
            <option value="">{t('logbook.allBands', { defaultValue: 'All bands' })}</option>
            {bandOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            aria-label={t('logbook.filterMode', { defaultValue: 'Filter by mode' })}
            style={{ ...inputStyle, width: 'auto', flex: '0 0 auto' }}
          >
            <option value="">{t('logbook.allModes', { defaultValue: 'All modes' })}</option>
            {modeOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Table / empty state */}
      {stats.total === 0 && !showForm ? (
        <div
          style={{
            textAlign: 'center',
            padding: '24px 12px',
            color: 'var(--text-muted)',
            fontSize: '12px',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontSize: '24px', marginBottom: '6px' }}>📓</div>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: '4px' }}>
            {t('logbook.emptyTitle', { defaultValue: 'Your logbook is empty' })}
          </div>
          <div style={{ maxWidth: '360px', margin: '0 auto' }}>
            {t('logbook.emptyBody', {
              defaultValue:
                'QSOs you log here are stored in this browser and can be exported as ADIF at any time. Log a contact with +QSO, use the 📓+ button on any DX cluster or activation spot, or import your existing log.',
            })}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{ ...smallBtnStyle(true), marginTop: '10px' }}
          >
            {t('logbook.emptyImport', { defaultValue: 'Import ADIF log' })}
          </button>
        </div>
      ) : (
        <div
          role="table"
          aria-label={t('logbook.tableLabel', { defaultValue: 'Logged QSOs' })}
          style={{ flex: 1, overflow: 'auto', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
        >
          <div className="visually-hidden" role="row">
            <span role="columnheader">{t('logbook.col.dateTime', { defaultValue: 'Date and time (UTC)' })}</span>
            <span role="columnheader">{t('logbook.col.call', { defaultValue: 'Callsign' })}</span>
            <span role="columnheader">{t('logbook.col.band', { defaultValue: 'Band' })}</span>
            <span role="columnheader">{t('logbook.col.mode', { defaultValue: 'Mode' })}</span>
            <span role="columnheader">{t('logbook.col.freq', { defaultValue: 'Frequency' })}</span>
            <span role="columnheader">{t('logbook.col.rst', { defaultValue: 'RST sent/received' })}</span>
            <span role="columnheader">{t('logbook.col.grid', { defaultValue: 'Grid' })}</span>
            <span role="columnheader">{t('logbook.col.name', { defaultValue: 'Name' })}</span>
          </div>
          {visible.map((qso, i) => (
            <div
              key={qso.id}
              role="row"
              onClick={() => openEditForm(qso)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openEditForm(qso);
                }
              }}
              tabIndex={0}
              title={t('logbook.rowTooltip', { defaultValue: 'Click to edit this QSO' })}
              style={{
                display: 'grid',
                gridTemplateColumns: '96px 1fr 38px 44px 58px 60px 48px minmax(0, 0.8fr)',
                gap: '6px',
                padding: '4px 6px',
                borderRadius: '3px',
                marginBottom: '1px',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div role="cell" style={{ color: 'var(--text-muted)', fontSize: '10px', alignSelf: 'center' }}>
                {formatDate(qso.qso_date)} {formatTime(qso.time_on)}
              </div>
              <div
                role="cell"
                style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                <CallsignLink
                  call={qso.call}
                  color="var(--text-primary)"
                  fontWeight="700"
                  onPopup={showPopup}
                  location={qso.gridsquare ? { grid: qso.gridsquare } : undefined}
                />
              </div>
              <div role="cell" style={{ color: 'var(--accent-cyan)', alignSelf: 'center', fontSize: '10px' }}>
                {qso.band || '—'}
              </div>
              <div role="cell" style={{ color: 'var(--text-secondary)', alignSelf: 'center', fontSize: '10px' }}>
                {qso.mode || '—'}
              </div>
              <div role="cell" style={{ color: 'var(--text-secondary)', alignSelf: 'center', fontSize: '10px' }}>
                {qso.freq != null && qso.freq !== '' ? Number(qso.freq).toFixed(3) : '—'}
              </div>
              <div role="cell" style={{ color: 'var(--text-muted)', alignSelf: 'center', fontSize: '10px' }}>
                {qso.rst_sent || '—'}/{qso.rst_rcvd || '—'}
              </div>
              <div role="cell" style={{ color: 'var(--text-muted)', alignSelf: 'center', fontSize: '10px' }}>
                {qso.gridsquare || ''}
              </div>
              <div
                role="cell"
                style={{
                  color: 'var(--text-muted)',
                  alignSelf: 'center',
                  fontSize: '10px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={qso.comment || undefined}
              >
                {qso.name || qso.comment || ''}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '11px' }}>
              {t('logbook.noMatch', { defaultValue: 'No QSOs match the current search/filters' })}
            </div>
          )}
        </div>
      )}

      {/* Footer: showing X of Y + per-band mini summary */}
      {stats.total > 0 && (
        <div
          style={{
            marginTop: '6px',
            fontSize: '9px',
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <span>
            {filtered.length > MAX_ROWS
              ? t('logbook.showing', {
                  defaultValue: 'Showing {{shown}} of {{total}}',
                  shown: visible.length,
                  total: filtered.length,
                })
              : t('logbook.showingAll', { defaultValue: '{{total}} shown', total: filtered.length })}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {BANDS.filter((b) => stats.byBand[b])
              .map((b) => `${b}:${stats.byBand[b]}`)
              .join(' ')}
          </span>
        </div>
      )}
    </div>
  );
};

export default LogbookPanel;
