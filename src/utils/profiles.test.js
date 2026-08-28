import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SHARE_CODE_PREFIX,
  decodeShareCode,
  encodeShareCode,
  exportProfileShareCode,
  getProfiles,
  importProfileFromShareCode,
  saveProfile,
} from './profiles.js';

const sample = {
  name: 'Contest',
  version: 1,
  snapshot: {
    openhamclock_config: JSON.stringify({ callsign: 'K0CJH', theme: 'dark' }),
    openhamclock_use12Hour: 'false',
    openhamclock_dxFilters: JSON.stringify({ bands: ['20m', '40m'], modes: ['CW'] }),
  },
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('share code encode/decode', () => {
  it('round-trips through the plain base64url fallback (no CompressionStream)', async () => {
    // jsdom-safe path: force the fallback regardless of what Node provides.
    vi.stubGlobal('CompressionStream', undefined);
    const code = await encodeShareCode(sample);
    expect(code.startsWith(SHARE_CODE_PREFIX)).toBe(true);
    // base64url only — safe to paste anywhere
    expect(code.slice(SHARE_CODE_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeShareCode(code)).toEqual(sample);
  });

  it('survives surrounding whitespace and non-ASCII content', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const obj = { name: 'Nürnberg 日本', version: 1, snapshot: { openhamclock_config: '{"callsign":"DL1ÄÖÜ"}' } };
    const code = await encodeShareCode(obj);
    expect(await decodeShareCode(`  ${code}\n`)).toEqual(obj);
  });

  const gzipAvailable = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

  it.runIf(gzipAvailable)('round-trips through the gzip path and is marked by the gzip magic', async () => {
    const code = await encodeShareCode(sample);
    expect(code.startsWith(SHARE_CODE_PREFIX)).toBe(true);
    // Assert the payload really is gzip (0x1f 0x8b) — a silent fallback to
    // plain JSON would still round-trip, hiding a broken gzip path.
    const b64 = code.slice(SHARE_CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    expect([bin.charCodeAt(0), bin.charCodeAt(1)]).toEqual([0x1f, 0x8b]);
    expect(await decodeShareCode(code)).toEqual(sample);
  });

  it.runIf(gzipAvailable)('decodes plain-fallback codes even when gzip is available', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const plainCode = await encodeShareCode(sample);
    vi.unstubAllGlobals();
    expect(await decodeShareCode(plainCode)).toEqual(sample);
  });

  it.runIf(gzipAvailable)('returns null for gzip codes when DecompressionStream is missing', async () => {
    const gzipCode = await encodeShareCode(sample);
    vi.stubGlobal('DecompressionStream', undefined);
    expect(await decodeShareCode(gzipCode)).toBe(null);
  });

  it('rejects garbage: wrong prefix, bad base64, bad JSON', async () => {
    expect(await decodeShareCode('')).toBe(null);
    expect(await decodeShareCode(null)).toBe(null);
    expect(await decodeShareCode('OHC2:abcdef')).toBe(null);
    expect(await decodeShareCode(`${SHARE_CODE_PREFIX}!!!not-base64!!!`)).toBe(null);
    // valid base64url of a non-JSON payload
    expect(await decodeShareCode(`${SHARE_CODE_PREFIX}aGVsbG8`)).toBe(null);
  });
});

describe('profile share-code integration', () => {
  it('exports a saved profile and imports it back as a new profile', async () => {
    localStorage.setItem('openhamclock_config', '{"callsign":"K0CJH"}');
    saveProfile('Contest');

    const code = await exportProfileShareCode('Contest');
    expect(code.startsWith(SHARE_CODE_PREFIX)).toBe(true);

    // Imports under a suffixed name since "Contest" already exists
    const imported = await importProfileFromShareCode(code);
    expect(imported).toBe('Contest (1)');
    expect(getProfiles()['Contest (1)'].snapshot.openhamclock_config).toBe('{"callsign":"K0CJH"}');
  });

  it('returns null for missing profiles and invalid codes', async () => {
    expect(await exportProfileShareCode('Nope')).toBe(null);
    expect(await importProfileFromShareCode('not a code')).toBe(null);
    // structurally valid JSON but not a profile
    vi.stubGlobal('CompressionStream', undefined);
    const code = await encodeShareCode({ hello: 'world' });
    expect(await importProfileFromShareCode(code)).toBe(null);
  });
});
