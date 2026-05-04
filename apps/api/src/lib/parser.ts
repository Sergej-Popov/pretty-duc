import type { ExplorerNode } from '@pretty-duc/contracts';
import { formatBytes } from '@pretty-duc/ui-model';
import { ApiError } from './errors';
import { joinChildPath } from './path-policy';

export function parseDucLsOutput(stdout: string, parentPath: string, minSize: number | null): ExplorerNode[] {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsed: ExplorerNode[] = [];
  let parentTotal = 0;

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.+)$/);

    if (!match) {
      continue;
    }

    const sizeBytes = Number.parseInt(match[1]!, 10);
    const rawName = match[2]!.trim();
    const isDirectory = rawName.endsWith('/');
    const name = rawName.replace(/[\/*@=|]$/, '');

    if (!name || name === '.' || name === '..' || name === '-') {
      continue;
    }

    parentTotal += sizeBytes;

    if (minSize !== null && sizeBytes < minSize) {
      continue;
    }

    parsed.push({
      name,
      path: joinChildPath(parentPath, name),
      sizeBytes,
      humanSize: formatBytes(sizeBytes),
      type: isDirectory ? 'directory' : 'file',
      percentOfParent: 0,
      hasChildren: isDirectory
    });
  }

  return parsed.map((node) => ({
    ...node,
    percentOfParent: parentTotal > 0 ? Number(((node.sizeBytes / parentTotal) * 100).toFixed(2)) : 0
  }));
}

export function parseDucInfoOutput(stdout: string) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const paths: Array<{ path: string; files: number; dirs: number; sizeBytes: number; lastScanAt: string }> = [];

  let totalEntries = 0;
  let totalDirs = 0;
  let totalSizeBytes = 0;
  let lastScanAt: string | null = null;

  const dataLineRe = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([\d.]+)([KMGT]?)\s+([\d.]+)([KMGT]?)\s+([\d.]+)([KMGTB]?)\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(dataLineRe);
    if (!match) continue;

    const scanDate = match[1]!;
    const scanTime = match[2]!;
    const files = parseCountish(match[3]!, match[4]!);
    const dirs = parseCountish(match[5]!, match[6]!);
    const sizeBytes = parseSizeBytes(match[7]!, match[8]!);
    const path = match[9]!;
    const timestamp = `${scanDate} ${scanTime}`;

    paths.push({ path, files, dirs, sizeBytes, lastScanAt: timestamp });
    totalEntries += files;
    totalDirs += dirs;
    totalSizeBytes += sizeBytes;

    if (!lastScanAt || timestamp > lastScanAt) {
      lastScanAt = timestamp;
    }
  }

  return {
    entries: totalEntries > 0 ? totalEntries : null,
    dirs: totalDirs > 0 ? totalDirs : null,
    sizeBytes: totalSizeBytes > 0 ? totalSizeBytes : null,
    lastScanAt,
    paths
  };
}

function parseCountish(value: string, suffix: string): number {
  const num = Number.parseFloat(value);
  const multipliers: Record<string, number> = { '': 1, K: 1_000, M: 1_000_000, G: 1_000_000_000, T: 1_000_000_000_000 };
  return Math.round(num * (multipliers[suffix] ?? 1));
}

function parseSizeBytes(value: string, suffix: string): number {
  const num = Number.parseFloat(value);
  const multipliers: Record<string, number> = { '': 1, B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return Math.round(num * (multipliers[suffix.toUpperCase()] ?? 1));
}

export function assertReasonablePayload(nodeCount: number, maxBytes: number) {
  const estimatedBytes = nodeCount * 200;
  if (estimatedBytes > maxBytes) {
    console.error(`[payload] budget exceeded: nodeCount=${nodeCount} estimatedBytes=${estimatedBytes} maxBytes=${maxBytes} (threshold=${Math.floor(maxBytes / 200)} nodes)`);
    throw new ApiError(413, 'RESPONSE_TOO_LARGE', 'Response likely exceeds configured payload budget', {
      maxBytes,
      estimatedBytes,
      nodeCount
    });
  }
  console.info(`[payload] budget ok: nodeCount=${nodeCount} estimatedBytes=${estimatedBytes} maxBytes=${maxBytes}`);
}
