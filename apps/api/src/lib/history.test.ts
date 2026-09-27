import { describe, expect, test } from 'bun:test';
import { addSample, forecastFreeSpace } from './history';

const GB = 1024 ** 3;
const volume = (freeBytes: number) => ({ path: '/scan/root', storageId: 'root', totalBytes: 100 * GB, freeBytes, usedBytes: 100 * GB - freeBytes });

describe('volume history', () => {
  test('records at most one sample per hour', () => {
    const start = new Date('2026-09-01T00:00:00Z');
    const once = addSample({ samples: [] }, [volume(50 * GB)], start);
    const again = addSample(once, [volume(49 * GB)], new Date('2026-09-01T00:30:00Z'));
    const later = addSample(once, [volume(49 * GB)], new Date('2026-09-01T01:00:00Z'));

    expect(once.samples).toHaveLength(1);
    expect(again).toBe(once);
    expect(later.samples).toHaveLength(2);
  });

  test('thins samples older than a week to one per day', () => {
    let history = { samples: [] as Array<{ at: string; volumes: Array<{ path: string; freeBytes: number; totalBytes: number }> }> };
    const start = Date.parse('2026-09-01T00:00:00Z');
    for (let hour = 0; hour < 24 * 10; hour += 1) {
      history = addSample(history, [volume(50 * GB)], new Date(start + hour * 3600_000));
    }

    const oldDays = history.samples.filter((sample) => Date.parse(sample.at) < Date.parse('2026-09-03T23:00:00Z'));
    expect(new Set(oldDays.map((sample) => sample.at.slice(0, 10))).size).toBe(oldDays.length);
    expect(history.samples.length).toBeLessThan(24 * 10);
  });

  test('forecasts days until full from a shrinking trend', () => {
    const now = new Date('2026-09-11T00:00:00Z');
    const samples = Array.from({ length: 11 }, (_, day) => ({
      at: new Date(Date.parse('2026-09-01T00:00:00Z') + day * 86_400_000).toISOString(),
      freeBytes: (30 - day) * GB,
      totalBytes: 100 * GB
    }));

    const forecast = forecastFreeSpace(samples, now)!;
    expect(forecast.freeBytesPerDay).toBeCloseTo(-GB, -3);
    expect(forecast.daysUntilFull).toBeCloseTo(20, 1);
  });

  test('has no fill date when free space is growing or data is too short', () => {
    const now = new Date('2026-09-02T00:00:00Z');
    const growing = [
      { at: '2026-09-01T00:00:00Z', freeBytes: 10 * GB, totalBytes: 100 * GB },
      { at: '2026-09-02T00:00:00Z', freeBytes: 12 * GB, totalBytes: 100 * GB }
    ];
    expect(forecastFreeSpace(growing, now)?.daysUntilFull).toBeNull();
    expect(forecastFreeSpace(growing.slice(0, 1), now)).toBeNull();
  });
});
