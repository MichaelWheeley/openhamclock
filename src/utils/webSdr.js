/**
 * webSdr.js — build "listen online" URLs for public web-accessible SDR receivers.
 *
 * Lets users without a connected rig hear a spotted station: click 🎧 on a
 * DX cluster spot and a browser SDR opens already tuned to the spot's
 * frequency and mode.
 *
 * Two receiver ecosystems matter here:
 *  - WebSDR (websdr.org software): tune via `?tune=<kHz><mode>`
 *  - KiwiSDR: tune via `?f=<kHz><mode>z<zoom>` (modes: am/amn/usb/lsb/cw/cwn/iq)
 *
 * Rather than hardcoding one receiver for the whole planet, we keep a tiny
 * curated list of well-known, long-running public wideband receivers per rough
 * region, and fall back to the KiwiSDR directory (rx.linkfanel.net) as a
 * "find a receiver near you" link when nothing on the list covers the
 * frequency. If you want a different receiver, the directory lists hundreds —
 * point users there.
 */

/** KiwiSDR public directory — "find a receiver near you" fallback. */
export const KIWISDR_DIRECTORY_URL = 'http://rx.linkfanel.net/';

/**
 * Map a cluster spot mode (from detectMode/classifySpotMode: FT8, FT4, FT2,
 * CW, SSB, RTTY, PSK, AM, FM, or null) to an SDR demodulator string.
 * Band convention: phone/unknown above 10 MHz is USB, below is LSB.
 * All the narrowband digital modes are transmitted as audio in a USB passband.
 *
 * @param {string|null} mode - spot mode label
 * @param {number} freqKhz - frequency in kHz (picks usb/lsb sideband)
 * @returns {string} demod: 'cw' | 'usb' | 'lsb' | 'am' | 'fm'
 */
export const spotModeToDemod = (mode, freqKhz) => {
  const sideband = freqKhz >= 10000 ? 'usb' : 'lsb';
  switch ((mode || '').toUpperCase()) {
    case 'CW':
      return 'cw';
    case 'AM':
      return 'am';
    case 'FM':
      return 'fm';
    case 'FT8':
    case 'FT4':
    case 'FT2':
    case 'RTTY':
    case 'PSK':
      return 'usb'; // digital modes ride in a USB audio passband
    case 'SSB':
    default:
      return sideband;
  }
};

/**
 * Build a KiwiSDR URL for a specific receiver host.
 * Form: http://<host>/?f=<kHz><mode>z<zoom>  e.g. ?f=14074usbz8
 * KiwiSDR has no plain 'fm' demod on HF; NBFM is spelled 'nbfm'.
 *
 * @param {string} host - receiver host[:port], with or without http://
 * @param {number} freqKhz
 * @param {string|null} mode - spot mode label (see spotModeToDemod)
 * @param {number} [zoom=8]
 */
export const buildKiwiUrl = (host, freqKhz, mode, zoom = 8) => {
  const base = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  const demod = spotModeToDemod(mode, freqKhz);
  const kiwiDemod = demod === 'fm' ? 'nbfm' : demod;
  return `${base.replace(/\/$/, '')}/?f=${Math.round(freqKhz)}${kiwiDemod}z${zoom}`;
};

/**
 * Curated public receivers. Short and factual on purpose — each entry is a
 * well-known, long-running, institutionally-run wideband receiver. Users who
 * want something closer to home can browse KIWISDR_DIRECTORY_URL.
 * `minKhz`/`maxKhz` bound the receiver's usable coverage; `tune` returns a
 * fully-formed URL.
 */
export const WEB_SDR_RECEIVERS = [
  {
    id: 'twente',
    name: 'University of Twente WebSDR',
    region: 'EU',
    // Continuous 0.03–29.16 MHz, Enschede NL — online since 2008.
    minKhz: 30,
    maxKhz: 29160,
    tune: (kHz, demod) => `http://websdr.ewi.utwente.nl:8901/?tune=${Math.round(kHz)}${demod}`,
  },
  {
    id: 'utah-low',
    name: 'Northern Utah WebSDR (low bands)',
    region: 'NA',
    // websdr1: 2200/630/160/80/60/40 m — sdrutah.org
    minKhz: 135,
    maxKhz: 7300,
    tune: (kHz, demod) => `http://websdr1.sdrutah.org:8901/?tune=${Math.round(kHz)}${demod}`,
  },
  {
    id: 'utah-high',
    name: 'Northern Utah WebSDR (high bands)',
    region: 'NA',
    // websdr2: 30/20/17/15/12/10/6 m — sdrutah.org
    minKhz: 10100,
    maxKhz: 54000,
    tune: (kHz, demod) => `http://websdr2.sdrutah.org:8902/?tune=${Math.round(kHz)}${demod}`,
  },
];

/**
 * Guess the user's rough region from the browser timezone. A receiver near
 * the *listener* best approximates what their own antenna would hear.
 * @returns {'NA'|'EU'}
 */
const guessRegion = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.startsWith('America')) return 'NA';
  } catch {
    /* default below */
  }
  return 'EU'; // Twente covers all of HF continuously — the safest default
};

/**
 * Build a listen URL for a spot: preferred-region receiver covering the
 * frequency, else any covering receiver, else the KiwiSDR directory so the
 * user can pick a receiver near them.
 *
 * @param {number} freqKhz - frequency in kHz
 * @param {string|null} mode - spot mode label (FT8/CW/SSB/…)
 * @returns {{url: string, name: string}|null} null for nonsense frequencies
 */
export const getListenUrl = (freqKhz, mode) => {
  if (!Number.isFinite(freqKhz) || freqKhz <= 0) return null;
  const demod = spotModeToDemod(mode, freqKhz);
  const covering = WEB_SDR_RECEIVERS.filter((r) => freqKhz >= r.minKhz && freqKhz <= r.maxKhz);
  const region = guessRegion();
  const pick = covering.find((r) => r.region === region) || covering[0];
  if (pick) return { url: pick.tune(freqKhz, demod), name: pick.name };
  return { url: KIWISDR_DIRECTORY_URL, name: 'KiwiSDR directory' };
};

export default getListenUrl;
