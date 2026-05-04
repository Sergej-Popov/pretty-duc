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
  const sizeMatch = stdout.match(/\((\d+(?:\.\d+)?)\s*([KMGTP]?B).*?total\)/i);
  const entriesMatch = stdout.match(/Indexed\s+(\d+)\s+files?/i);
  const timeMatch = stdout.match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/);

  return {
    entries: entriesMatch ? Number.parseInt(entriesMatch[1]!, 10) : null,
    sizeBytes: sizeMatch ? parseHumanishSize(sizeMatch[1]!, sizeMatch[2]!) : null,
    lastScanAt: timeMatch?.[1] ?? null
  };
}

function parseHumanishSize(value: string, unit: string): number {
  const num = Number.parseFloat(value);
  const scale: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
    PB: 1024 ** 5
  };

  return Math.round(num * (scale[unit.toUpperCase()] ?? 1));
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
