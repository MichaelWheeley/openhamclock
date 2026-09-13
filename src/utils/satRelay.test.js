import { describe, it, expect } from 'vitest';
import {
  makeObserver,
  satrecFor,
  relayGeometry,
  computeMutualPasses,
  rankRelayCandidates,
  hasRelay,
  dopplerCorrected,
} from './satRelay.js';

// ISS-like element set (mid-2026 epoch). Structural checks only — the tests
// never assert specific pass times.
const ISS_OMM = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  EPOCH: '2026-09-13T00:00:00.000000',
  MEAN_MOTION: 15.49,
  ECCENTRICITY: 0.0004,
  INCLINATION: 51.64,
  RA_OF_ASC_NODE: 120.5,
  ARG_OF_PERICENTER: 30.1,
  MEAN_ANOMALY: 330.0,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 50000,
  BSTAR: 0.0001,
  MEAN_MOTION_DOT: 0.00002,
  MEAN_MOTION_DDOT: 0,
};
const DE = { lat: 44.98, lon: -93.27, stationAlt: 260 };
const DX = { lat: 40.0, lon: -80.0, stationAlt: 300 }; // ~1,100 km away — shares ISS passes
const FAR = { lat: -33.87, lon: 151.21 }; // Sydney — never a common ISS pass with Minneapolis
const T0 = new Date('2026-09-13T00:00:00Z');

describe('makeObserver / satrecFor', () => {
  it('builds a geodetic observer in radians and km', () => {
    const o = makeObserver(DE);
    expect(o.latitude).toBeCloseTo((44.98 * Math.PI) / 180, 6);
    expect(o.height).toBeCloseTo(0.26, 6);
    expect(makeObserver(null)).toBeNull();
    expect(makeObserver({ lat: 'x' })).toBeNull();
  });
  it('memoises satrecs per element set', () => {
    expect(satrecFor(ISS_OMM)).toBe(satrecFor(ISS_OMM));
    expect(satrecFor(null)).toBeNull();
  });
});

describe('relayGeometry', () => {
  it('returns a LEO position and per-observer look angles', () => {
    const g = relayGeometry(satrecFor(ISS_OMM), T0, makeObserver(DE), makeObserver(DX));
    expect(g.altKm).toBeGreaterThan(350);
    expect(g.altKm).toBeLessThan(500);
    expect(Math.abs(g.lat)).toBeLessThanOrEqual(52);
    expect(g.de.azimuth).toBeGreaterThanOrEqual(0);
    expect(g.de.azimuth).toBeLessThan(360);
    expect(g.de.rangeKm).toBeGreaterThan(350);
    expect(g.dx.dopplerFactor).toBeGreaterThan(0.99);
    expect(g.dx.dopplerFactor).toBeLessThan(1.01);
  });
  it('omits dx when no DX observer is given', () => {
    const g = relayGeometry(satrecFor(ISS_OMM), T0, makeObserver(DE), null);
    expect(g.dx).toBeNull();
  });
});

describe('computeMutualPasses', () => {
  it('finds passes both nearby stations share, with consistent per-station edges', () => {
    const passes = computeMutualPasses(ISS_OMM, T0, DE, DX, { hours: 24, minElev: 5 });
    expect(passes.length).toBeGreaterThan(0);
    for (const p of passes) {
      expect(p.end.getTime()).toBeGreaterThan(p.start.getTime());
      expect(p.end - p.start).toBeLessThan(15 * 60_000); // a LEO pass
      expect(p.peakCommonEl).toBeGreaterThanOrEqual(5);
      // Each station's own pass must contain the common window
      expect(p.de.aos.getTime()).toBeLessThanOrEqual(p.start.getTime() + 2000);
      expect(p.de.los.getTime()).toBeGreaterThanOrEqual(p.end.getTime() - 2000);
      expect(p.dx.aos.getTime()).toBeLessThanOrEqual(p.start.getTime() + 2000);
      expect(p.dx.los.getTime()).toBeGreaterThanOrEqual(p.end.getTime() - 2000);
    }
  });
  it('finds nothing for stations that can never share a footprint', () => {
    expect(computeMutualPasses(ISS_OMM, T0, DE, FAR, { hours: 24 })).toEqual([]);
  });
  it('returns [] without elements or an observer', () => {
    expect(computeMutualPasses(null, T0, DE, DX)).toEqual([]);
    expect(computeMutualPasses(ISS_OMM, T0, DE, null)).toEqual([]);
  });
});

describe('rankRelayCandidates / hasRelay', () => {
  const relaySat = {
    name: 'ISS',
    omm: ISS_OMM,
    relayTransmitters: [{ uplinkLowHz: 145990000, downlinkLowHz: 437800000 }],
  };
  const beaconOnly = { name: 'CUBE', omm: ISS_OMM, relayTransmitters: [] };
  it('puts relay-capable satellites first, ordered by next pass', () => {
    const rows = rankRelayCandidates([beaconOnly, relaySat], T0, DE, DX, { hours: 24 });
    expect(rows[0].sat.name).toBe('ISS');
    expect(rows[0].relay).toBe(true);
    expect(rows[0].nextPass).not.toBeNull();
    expect(rows[1].sat.name).toBe('CUBE');
    expect(rows[1].nextPass).toBeNull();
    expect(hasRelay(relaySat)).toBe(true);
    expect(hasRelay(beaconOnly)).toBe(false);
  });
});

describe('dopplerCorrected', () => {
  const tx = { uplinkLowHz: 145990000, uplinkHighHz: 145990000, downlinkLowHz: 437800000, downlinkHighHz: 437800000 };
  it('shifts the downlink by the factor and the uplink by its inverse', () => {
    const c = dopplerCorrected(tx, 1.00002); // approaching: received higher
    expect(c.downlinkHz).toBeCloseTo(437800000 * 1.00002, 0);
    expect(c.uplinkHz).toBeCloseTo(145990000 / 1.00002, 0);
    expect(c.downlinkShiftHz).toBeGreaterThan(0);
    expect(c.uplinkShiftHz).toBeLessThan(0);
  });
  it('handles missing data', () => {
    expect(dopplerCorrected(null, 1)).toBeNull();
    expect(dopplerCorrected(tx, 0)).toBeNull();
  });
});
