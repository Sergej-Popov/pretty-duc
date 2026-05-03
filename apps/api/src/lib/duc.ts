import type { AppConfig } from '@pretty-duc/config';
import type { ExplorerNode, SortMode } from '@pretty-duc/contracts';
import { parseDucLsOutput } from './parser';
import { ApiError } from './errors';

type ExecResult = { stdout: string; stderr: string };

export type DucExecutor = (args: string[], timeoutMs: number) => Promise<ExecResult>;

export function createExecutor(ducBin: string): DucExecutor {
  return async (args, timeoutMs) => {
    const proc = Bun.spawn([ducBin, ...args], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const timeout = setTimeout(() => {
      proc.kill();
    }, timeoutMs);

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]).finally(() => clearTimeout(timeout));

    if (exitCode !== 0) {
      if (stderr.toLowerCase().includes('not found')) {
        throw new ApiError(404, 'PATH_NOT_INDEXED', stderr.trim() || 'Path was not found in Duc index');
      }

      throw new ApiError(502, 'DUC_COMMAND_FAILED', stderr.trim() || 'Duc command failed', { args, exitCode });
    }

    return { stdout, stderr };
  };
}

export async function getChildrenTree(options: {
  config: AppConfig;
  path: string;
  levels: number;
  minSize: number | null;
  sort: SortMode;
  maxNodes: number;
  maxChildrenPerDirectory: number;
  maxResponseBytes: number;
  executor: DucExecutor;
}): Promise<{ children: ExplorerNode[]; truncated: boolean; totalSizeBytes: number; nodeCount: number }> {
  const startedAt = Date.now();
  let nodeCount = 0;
  let truncated = false;

  async function walk(currentPath: string, remainingLevels: number): Promise<ExplorerNode[]> {
    if (Date.now() - startedAt > options.config.limits.recursiveBudgetMs) {
      throw new ApiError(504, 'DUC_TIMEOUT', 'Recursive request exceeded configured time budget');
    }

    const args = ['ls', '-b', '-d', options.config.database, '-F', currentPath];
    if (options.sort === 'nameAsc') {
      args.splice(4, 0, '-n');
    }

    const result = await options.executor(args, options.config.limits.ducTimeoutMs);
    let children = parseDucLsOutput(result.stdout, currentPath, options.minSize);

    if (options.sort === 'sizeDesc') {
      children.sort((left, right) => right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name));
    } else {
      children.sort((left, right) => left.name.localeCompare(right.name));
    }

    if (children.length > options.maxChildrenPerDirectory) {
      children = children.slice(0, options.maxChildrenPerDirectory);
      truncated = true;
    }

    for (const child of children) {
      nodeCount += 1;
      if (nodeCount >= options.maxNodes) {
        truncated = true;
        return children;
      }

      if (remainingLevels > 1 && child.type === 'directory') {
        child.children = await walk(child.path, remainingLevels - 1);
      }
    }

    return children;
  }

  const children = await walk(options.path, options.levels);
  const totalSizeBytes = children.reduce((sum, child) => sum + child.sizeBytes, 0);
  return { children, truncated, totalSizeBytes, nodeCount };
}
