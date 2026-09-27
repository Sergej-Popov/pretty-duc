import type { AppConfig } from '@pretty-duc/config';
import { getVolumes } from './disk';
import type { DucExecutor } from './duc';
import { historyFilePath, recordSample } from './history';
import { parseDucInfoOutput } from './parser';
import { readSnapshots, snapshotFilePath, takeSnapshot } from './snapshots';

const CHECK_INTERVAL_MS = 10 * 60 * 1000;

export type MonitorState = { snapshotRunning: boolean; lastError: string | null };

// Background job: records volume free space (at most hourly) and snapshots
// directory and file sizes whenever Duc finishes a new scan.
export function startMonitor(getConfig: () => AppConfig, executor: DucExecutor): MonitorState {
  const state: MonitorState = { snapshotRunning: false, lastError: null };

  async function tick() {
    const config = getConfig();

    try {
      await recordSample(historyFilePath(config.dataDir), await getVolumes(config));
    } catch (error) {
      console.error('[monitor] failed to record volume sample', error);
    }

    if (state.snapshotRunning) return;

    try {
      const info = await executor(['info', '-d', config.database], config.limits.ducTimeoutMs);
      const scanAt = parseDucInfoOutput(info.stdout).lastScanAt;
      const filePath = snapshotFilePath(config.dataDir);
      const latest = (await readSnapshots(filePath)).at(-1);

      if (latest && latest.scanAt === scanAt) return;

      state.snapshotRunning = true;
      const startedAt = Date.now();
      const snapshot = await takeSnapshot({ config, executor, filePath, scanAt });
      state.lastError = null;
      console.info(`[monitor] snapshot for scan ${scanAt}: ${Object.keys(snapshot.dirs).length} dirs, ${snapshot.files.length} files in ${Date.now() - startedAt}ms`);
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      console.error('[monitor] snapshot failed', error);
    } finally {
      state.snapshotRunning = false;
    }
  }

  setTimeout(() => void tick(), 5000);
  setInterval(() => void tick(), CHECK_INTERVAL_MS);
  return state;
}
