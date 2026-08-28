import { describe, it, expect } from 'vitest';
import { spotModeToDemod, buildKiwiUrl, getListenUrl, KIWISDR_DIRECTORY_URL, WEB_SDR_RECEIVERS } from './webSdr';

describe('spotModeToDemod', () => {
  it('maps CW to cw', () => {
    expect(spotModeToDemod('CW', 14025)).toBe('cw');
  });

  it('maps SSB by band convention: USB above 10 MHz, LSB below', () => {
    expect(spotModeToDemod('SSB', 14200)).toBe('usb');
    expect(spotModeToDemod('SSB', 7150)).toBe('lsb');
  });

  it('maps digital modes to usb regardless of band', () => {
    expect(spotModeToDemod('FT8', 3573)).toBe('usb');
    expect(spotModeToDemod('FT4', 7047)).toBe('usb');
    expect(spotModeToDemod('RTTY', 7040)).toBe('usb');
    expect(spotModeToDemod('PSK', 3580)).toBe('usb');
  });

  it('falls back to sideband convention for unknown mode', () => {
    expect(spotModeToDemod(null, 21300)).toBe('usb');
    expect(spotModeToDemod(null, 3790)).toBe('lsb');
  });

  it('maps AM and FM', () => {
    expect(spotModeToDemod('AM', 7290)).toBe('am');
    expect(spotModeToDemod('FM', 29600)).toBe('fm');
  });
});

describe('buildKiwiUrl', () => {
  it('builds the ?f=<kHz><mode>z<zoom> form', () => {
    expect(buildKiwiUrl('kiwi.example.com:8073', 14074, 'FT8')).toBe('http://kiwi.example.com:8073/?f=14074usbz8');
  });

  it('keeps an explicit scheme and translates FM to nbfm', () => {
    expect(buildKiwiUrl('http://kiwi.example.com:8073/', 29600, 'FM', 10)).toBe(
      'http://kiwi.example.com:8073/?f=29600nbfmz10',
    );
  });
});

describe('getListenUrl', () => {
  it('returns null for invalid frequencies', () => {
    expect(getListenUrl(NaN, 'CW')).toBeNull();
    expect(getListenUrl(0, 'CW')).toBeNull();
  });

  it('returns a covering curated receiver with a tuned URL', () => {
    const res = getListenUrl(14074, 'FT8');
    expect(res).not.toBeNull();
    expect(res.url).toMatch(/\?(tune|f)=14074usb/);
  });

  it('falls back to the KiwiSDR directory when nothing covers the frequency', () => {
    const res = getListenUrl(144300, 'SSB'); // 2m — outside every curated receiver
    expect(res.url).toBe(KIWISDR_DIRECTORY_URL);
  });

  it('curated list stays tiny (3-6 receivers)', () => {
    expect(WEB_SDR_RECEIVERS.length).toBeGreaterThanOrEqual(3);
    expect(WEB_SDR_RECEIVERS.length).toBeLessThanOrEqual(6);
  });
});
