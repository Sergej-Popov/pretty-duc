import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from '@pretty-duc/config';
import type { ChangeEntry, ExplorerNode, LargeFile, SnapshotInfo } from '@pretty-duc/contracts';
import { getChildrenTree, type DucExecutor } from './duc';
import { toFilesystemPath } from './disk';

// Entries below this size are not recorded. Every ancestor of a large file is
// at least as large, so a walk pruned at this size still reaches all of them.
export const SNAPSHOT_MIN_SIZE = 100 * 1024 * 1024;
const MAX_SNAPSHOTS = 14;

export type Snapshot = {
  scanAt: string | null;
  takenAt: string;
  dirs: Record<string, number>;
  files: Array<{ path: string; sizeBytes: number; modifiedAt: string | null }>;
};
type SnapshotFile = { snapshots: Snapshot[] };

export function snapshotFilePath(dataDir: string): string {
  return path.join(dataDir, 'snapshots.json');
}

export async function readSnapshots(filePath: string): Promise<Snapshot[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as SnapshotFile;
    return Array.isArray(parsed.snapshots) ? parsed.snapshots : [];
  } catch {
    return [];
  }
}

export function flattenTree(nodes: ExplorerNode[]): { dirs: Record<string, number>; files: Array<{ path: string; sizeBytes: number }> } {
  const dirs: Record<string, number> = {};
  const files: Array<{ path: string; sizeBytes: number }> = [];

  const visit = (list: ExplorerNode[]) => {
    for (const node of list) {
      if (node.type === 'directory') {
        dirs[node.path] = node.sizeBytes;
        visit(node.children ?? []);
      } else {
        files.push({ path: node.path, sizeBytes: node.sizeBytes });
      }
    }
  };

  visit(nodes);
  return { dirs, files };
}

async function readModifiedAt(config: AppConfig, ducPath: string): Promise<string | null> {
  try {
    return (await fs.stat(toFilesystemPath(config, ducPath))).mtime.toISOString();
  } catch {
    return null;
  }
}

export async function takeSnapshot(options: { config: AppConfig; executor: DucExecutor; filePath: string; scanAt: string | null }): Promise<Snapshot> {
  const { config } = options;
  const walkConfig: AppConfig = { ...config, limits: { ...config.limits, recursiveBudgetMs: 10 * 60 * 1000 } };
  const result = await getChildrenTree({
    config: walkConfig,
    path: config.root,
    levels: 64,
    minSize: SNAPSHOT_MIN_SIZE,
    sort: 'sizeDesc',
    maxNodes: 50000,
    maxChildrenPerDirectory: config.limits.maxChildrenPerDirectory,
    maxResponseBytes: Number.MAX_SAFE_INTEGER,
    executor: options.executor,
    apparent: true
  });

  const { dirs, files } = flattenTree(result.children);
  const datedFiles = await Promise.all(files.map(async (file) => ({ ...file, modifiedAt: await readModifiedAt(config, file.path) })));
  const snapshot: Snapshot = { scanAt: options.scanAt, takenAt: new Date().toISOString(), dirs, files: datedFiles };

  const snapshots = [...await readSnapshots(options.filePath), snapshot].slice(-MAX_SNAPSHOTS);
  await fs.mkdir(path.dirname(options.filePath), { recursive: true });
  await fs.writeFile(`${options.filePath}.tmp`, JSON.stringify({ snapshots }), 'utf8');
  await fs.rename(`${options.filePath}.tmp`, options.filePath);
  return snapshot;
}

export function toSnapshotInfo(snapshot: Snapshot | undefined): SnapshotInfo | null {
  return snapshot ? { scanAt: snapshot.scanAt, takenAt: snapshot.takenAt } : null;
}

function isBelow(parentPath: string, candidate: string) {
  return candidate.startsWith(`${parentPath}/`);
}

// Size changes between two snapshots under `underPath`. A directory is left out
// when one of its listed descendants accounts for most of its change, so the
// list points at where the change actually happened.
export function computeChanges(previous: Snapshot, current: Snapshot, underPath: string, limit = 15): { grown: ChangeEntry[]; shrunk: ChangeEntry[] } {
  const sizes = (snapshot: Snapshot) => {
    const map = new Map<string, { size: number; type: 'directory' | 'file' }>();
    for (const [entryPath, size] of Object.entries(snapshot.dirs)) map.set(entryPath, { size, type: 'directory' });
    for (const file of snapshot.files) map.set(file.path, { size: file.sizeBytes, type: 'file' });
    return map;
  };
  const before = sizes(previous);
  const after = sizes(current);
  const paths = new Set([...before.keys(), ...after.keys()].filter((entryPath) => isBelow(underPath, entryPath)));

  const entries: ChangeEntry[] = [...paths].map((entryPath) => {
    const beforeSize = before.get(entryPath)?.size ?? null;
    const afterSize = after.get(entryPath)?.size ?? null;
    return {
      path: entryPath,
      type: (after.get(entryPath) ?? before.get(entryPath))!.type,
      beforeBytes: beforeSize,
      afterBytes: afterSize,
      deltaBytes: (afterSize ?? 0) - (beforeSize ?? 0)
    };
  }).filter((entry) => entry.deltaBytes !== 0);

  const pick = (sign: 1 | -1) => {
    const candidates = entries
      .filter((entry) => Math.sign(entry.deltaBytes) === sign)
      .sort((left, right) => right.path.split('/').length - left.path.split('/').length);
    const kept: ChangeEntry[] = [];

    for (const entry of candidates) {
      const explained = kept.some((child) => isBelow(entry.path, child.path) && Math.abs(child.deltaBytes) >= Math.abs(entry.deltaBytes) * 0.8);
      if (!explained) kept.push(entry);
    }

    return kept.sort((left, right) => Math.abs(right.deltaBytes) - Math.abs(left.deltaBytes)).slice(0, limit);
  };

  return { grown: pick(1), shrunk: pick(-1) };
}

export function findLargeFiles(snapshot: Snapshot, underPath: string, options: { olderThanDays: number; limit: number; now?: Date }): LargeFile[] {
  const cutoff = (options.now ?? new Date()).getTime() - options.olderThanDays * 24 * 60 * 60 * 1000;

  return snapshot.files
    .filter((file) => isBelow(underPath, file.path))
    .filter((file) => options.olderThanDays <= 0 || (file.modifiedAt !== null && Date.parse(file.modifiedAt) <= cutoff))
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
    .slice(0, options.limit);
}
