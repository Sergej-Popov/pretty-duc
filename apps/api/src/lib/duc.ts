import path from 'node:path';
import type { AppConfig } from '@pretty-duc/config';
import type { ExplorerNode, SortMode } from '@pretty-duc/contracts';
import { formatBytes } from '@pretty-duc/ui-model';
import { createMockExecutor } from './mock-duc';
import { parseDucLsOutput } from './parser';
import { ApiError } from './errors';
import { Semaphore, withLimit } from './concurrency';

type ExecResult = { stdout: string; stderr: string };

export type DucExecutor = (args: string[], timeoutMs: number) => Promise<ExecResult>;

export function createExecutor(config: AppConfig, maxConcurrency: number): DucExecutor {
  if (config.mockScanRoot) {
    return createMockExecutor({
      database: config.database,
      fixtureRoot: config.mockScanRoot,
      maxConcurrency,
      virtualRoot: config.root
    });
  }

  const semaphore = new Semaphore(maxConcurrency);

  return async (args, timeoutMs) => {
    return withLimit(semaphore, async () => {
      const cmdLabel = args.length >= 2 ? `${args[0]} ${args[1]}` : args[0];
      console.info(`[duc] executing: ${config.ducBin} ${args.join(' ')} (timeout=${timeoutMs}ms)`);

      const proc = Bun.spawn([config.ducBin, ...args], {
        stdout: 'pipe',
        stderr: 'pipe'
      });

      const timeout = setTimeout(() => {
        proc.kill();
      }, timeoutMs);

      let stdout = '';
      let stderr = '';

      const [exitCode, stdoutText, stderrText] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text()
      ]).finally(() => clearTimeout(timeout));
      
      stdout = stdoutText;
      stderr = stderrText;

      if (exitCode !== 0) {
        const stderrPreview = stderr.trim().slice(0, 500);
        console.error(`[duc] command failed: ${cmdLabel} exitCode=${exitCode} stderr=${stderrPreview}`);

        if (stderr.toLowerCase().includes('not found') || stderr.toLowerCase().includes('no such file')) {
          throw new ApiError(404, 'PATH_NOT_INDEXED', stderr.trim() || 'Path was not found in Duc index');
        }

        throw new ApiError(502, 'DUC_COMMAND_FAILED', stderr.trim() || 'Duc command failed', { args, exitCode });
      }

      console.info(`[duc] completed: ${cmdLabel} (${stdout.split('\n').filter(Boolean).length} lines)`);
      return { stdout, stderr };
    });
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
  const localSemaphore = new Semaphore(options.config.limits.recursiveConcurrency);

  async function walk(currentPath: string, remainingLevels: number): Promise<ExplorerNode[]> {
    if (Date.now() - startedAt > options.config.limits.recursiveBudgetMs) {
      console.error(`[walk] timeout at ${currentPath} (${Date.now() - startedAt}ms > ${options.config.limits.recursiveBudgetMs}ms) nodeCount=${nodeCount}`);
      throw new ApiError(504, 'DUC_TIMEOUT', 'Recursive request exceeded configured time budget');
    }

    const args = ['ls', '-b', '-d', options.config.database, '-F', '--', currentPath];

    const result = await withLimit(localSemaphore, () => {
      if (Date.now() - startedAt > options.config.limits.recursiveBudgetMs) {
        console.error(`[walk] timeout in semaphore wait at ${currentPath} (${Date.now() - startedAt}ms) nodeCount=${nodeCount}`);
        throw new ApiError(504, 'DUC_TIMEOUT', 'Recursive request exceeded configured time budget');
      }

      return options.executor(args, options.config.limits.ducTimeoutMs);
    });
    let children = [];
    try {
      children = parseDucLsOutput(result.stdout, currentPath, options.minSize);
    } catch (e) {
      console.error(`[walk] failed to parse duc ls output for ${currentPath}: nodeCount=${nodeCount} remainingLevels=${remainingLevels}`, e);
      return [];
    }

    if (options.sort === 'sizeDesc') {
      children.sort((left, right) => right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name));
    } else {
      children.sort((left, right) => left.name.localeCompare(right.name));
    }

    if (children.length > options.maxChildrenPerDirectory) {
      console.warn(`[walk] truncated directory ${currentPath}: ${children.length} children exceeded maxChildrenPerDirectory=${options.maxChildrenPerDirectory}`);
      children = children.slice(0, options.maxChildrenPerDirectory);
      truncated = true;
    }

    const childrenPromises = children.map(async (child) => {
      nodeCount += 1;
      if (nodeCount >= options.maxNodes) {
        if (!truncated) {
          console.warn(`[walk] hit maxNodes cap at ${currentPath}/${child.name}: nodeCount=${nodeCount} maxNodes=${options.maxNodes} remainingLevels=${remainingLevels}`);
        }
        truncated = true;
        return child;
      }

      if (remainingLevels > 1 && child.type === 'directory') {
        child.children = await walk(child.path, remainingLevels - 1);
      }
      
      return child;
    });

    return Promise.all(childrenPromises);
  }

  const children = await walk(options.path, options.levels);
  const totalSizeBytes = children.reduce((sum, child) => sum + child.sizeBytes, 0);
  const elapsed = Date.now() - startedAt;
  console.info(`[walk] completed: path=${options.path} levels=${options.levels} nodeCount=${nodeCount} truncated=${truncated} totalSizeBytes=${totalSizeBytes} elapsedMs=${elapsed}`);
  return { children, truncated, totalSizeBytes, nodeCount };
}

export async function getTreeJson(options: {
  config: AppConfig;
  path: string;
  levels: number;
  maxNodes: number;
  executor: DucExecutor;
}): Promise<{ children: ExplorerNode[]; truncated: boolean; totalSizeBytes: number; nodeCount: number }> {
  const args = ['json', '-d', options.config.database, '-d', String(options.levels), '--', options.path];
  const result = await options.executor(args, options.config.limits.ducTimeoutMs);
  
  if (!result.stdout.trim()) {
    console.warn(`[tree] empty output for path=${options.path} levels=${options.levels}`);
    return { children: [], truncated: false, totalSizeBytes: 0, nodeCount: 0 };
  }

  let rawJson;
  try {
    rawJson = JSON.parse(result.stdout);
  } catch (e) {
    console.error(`[tree] failed to parse JSON for path=${options.path} levels=${options.levels}: stdout length=${result.stdout.length}`);
    throw new ApiError(502, 'DUC_INVALID_JSON', 'Failed to parse JSON from Duc output');
  }
  
  let nodeCount = 0;
  let truncated = false;
  
  function walkJson(node: any, currentPath: string, remainingLevels: number): ExplorerNode {
    nodeCount++;
    const isDir = typeof node.size === 'number' && node.children !== undefined;
    const type = isDir ? 'directory' : 'file';
    
    // duc json provides:
    // { "name": "...", "size": 123, "size_actual": 123, "children": [...] }
    
    const sizeBytes = node.size || node.size_actual || 0;
    
    const resultNode: ExplorerNode = {
      name: node.name || path.basename(currentPath) || '',
      path: currentPath,
      sizeBytes,
      humanSize: formatBytes(sizeBytes),
      type,
      percentOfParent: 0,
      hasChildren: isDir
    };
    
    if (isDir && remainingLevels > 0 && node.children && Array.isArray(node.children)) {
      resultNode.children = [];
      let parentTotal = 0;
      for (const child of node.children) {
        parentTotal += child.size || child.size_actual || 0;
      }
      
      for (const child of node.children) {
        if (nodeCount >= options.maxNodes) {
          truncated = true;
          break;
        }
        
        const childPath = currentPath === '/' ? `/${child.name}` : `${currentPath}/${child.name}`;
        const parsedChild = walkJson(child, childPath, remainingLevels - 1);
        parsedChild.percentOfParent = parentTotal > 0 ? Number(((parsedChild.sizeBytes / parentTotal) * 100).toFixed(2)) : 0;
        resultNode.children.push(parsedChild);
      }
      
      resultNode.children.sort((left, right) => right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name));
    }
    
    return resultNode;
  }
  
  const rootNode = walkJson(rawJson, options.path, options.levels);
  const children = rootNode.children || [];
  
  return {
    children,
    truncated,
    totalSizeBytes: rootNode.sizeBytes,
    nodeCount
  };
}
