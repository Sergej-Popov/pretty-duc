import fs from 'node:fs/promises';
import path from 'node:path';
import type { Volume, VolumeForecast, VolumeHistory, VolumeSample } from '@pretty-duc/contracts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SAMPLE_INTERVAL_MS = HOUR_MS - 5 * 60 * 1000;
const FULL_RESOLUTION_MS = 7 * DAY_MS;
const RETENTION_MS = 365 * DAY_MS;
const FORECAST_WINDOW_MS = 14 * DAY_MS;
const MIN_FORECAST_SPAN_MS = 12 * HOUR_MS;

type StoredSample = { at: string; volumes: Array<{ path: string; freeBytes: number; totalBytes: number }> };
type HistoryFile = { samples: StoredSample[] };

export function historyFilePath(dataDir: string): string {
  return path.join(dataDir, 'volume-history.json');
}

export async function readHistory(filePath: string): Promise<HistoryFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as HistoryFile;
    return Array.isArray(parsed.samples) ? parsed : { samples: [] };
  } catch {
    return { samples: [] };
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value), 'utf8');
  await fs.rename(tempPath, filePath);
}

// Appends at most one sample per hour. Samples older than a week are thinned to
// one per day; samples older than a year are dropped.
export function addSample(history: HistoryFile, volumes: Volume[], now: Date): HistoryFile {
  const last = history.samples[history.samples.length - 1];
  if (last && now.getTime() - Date.parse(last.at) < SAMPLE_INTERVAL_MS) {
    return history;
  }

  const samples = [...history.samples, {
    at: now.toISOString(),
    volumes: volumes.map((volume) => ({ path: volume.path, freeBytes: volume.freeBytes, totalBytes: volume.totalBytes }))
  }];
  const seenDays = new Set<string>();
  const kept = samples.filter((sample) => {
    const age = now.getTime() - Date.parse(sample.at);
    if (age > RETENTION_MS) return false;
    if (age <= FULL_RESOLUTION_MS) return true;
    const day = sample.at.slice(0, 10);
    if (seenDays.has(day)) return false;
    seenDays.add(day);
    return true;
  });

  return { samples: kept };
}

export async function recordSample(filePath: string, volumes: Volume[], now = new Date()) {
  const history = await readHistory(filePath);
  const next = addSample(history, volumes, now);
  if (next !== history) {
    await writeJson(filePath, next);
  }
}

// Least-squares trend of free space over the last two weeks.
export function forecastFreeSpace(samples: VolumeSample[], now: Date): VolumeForecast | null {
  const recent = samples.filter((sample) => now.getTime() - Date.parse(sample.at) <= FORECAST_WINDOW_MS);
  if (recent.length < 2) return null;

  const times = recent.map((sample) => Date.parse(sample.at));
  const span = Math.max(...times) - Math.min(...times);
  if (span < MIN_FORECAST_SPAN_MS) return null;

  const meanX = times.reduce((sum, value) => sum + value, 0) / times.length;
  const meanY = recent.reduce((sum, sample) => sum + sample.freeBytes, 0) / recent.length;
  let numerator = 0;
  let denominator = 0;
  recent.forEach((sample, index) => {
    const dx = times[index]! - meanX;
    numerator += dx * (sample.freeBytes - meanY);
    denominator += dx * dx;
  });

  const freeBytesPerDay = denominator > 0 ? (numerator / denominator) * DAY_MS : 0;
  const latestFree = recent[recent.length - 1]!.freeBytes;
  const daysUntilFull = freeBytesPerDay < 0 ? latestFree / -freeBytesPerDay : null;

  return { freeBytesPerDay, daysUntilFull, basedOnDays: span / DAY_MS };
}

export function toVolumeHistories(history: HistoryFile, volumes: Volume[], now = new Date()): VolumeHistory[] {
  return volumes.map((volume) => {
    const samples: VolumeSample[] = history.samples.flatMap((sample) => {
      const match = sample.volumes.find((entry) => entry.path === volume.path);
      return match ? [{ at: sample.at, freeBytes: match.freeBytes, totalBytes: match.totalBytes }] : [];
    });

    return { ...volume, samples, forecast: forecastFreeSpace(samples, now) };
  });
}
