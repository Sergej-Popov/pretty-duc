import fs from 'node:fs/promises';
import path from 'node:path';
import type { DucExecutor } from './duc';
import { ApiError } from './errors';
import { Semaphore, withLimit } from './concurrency';

type MockExecutorOptions = {
  database: string;
  fixtureRoot: string;
  maxConcurrency: number;
  virtualRoot: string;
};

type MockManifest = {
  version?: string;
  lastScanAt?: string;
  fileSizes?: Record<string, number>;
};

type MockNode = {
  name: string;
  sizeBytes: number;
  type: 'directory' | 'file';
  virtualPath: string;
  children?: MockNode[];
};

type MockTreeState = {
  nodes: Map<string, MockNode>;
  rootNode: MockNode;
  totalFiles: number;
  totalSizeBytes: number;
  lastScanAt: string;
  version: string;
};

export function createMockExecutor(options: MockExecutorOptions): DucExecutor {
  const semaphore = new Semaphore(options.maxConcurrency);
  let statePromise: Promise<MockTreeState> | null = null;

  function loadState() {
    statePromise ??= buildMockTreeState(options);
    return statePromise;
  }

  return async (args) => {
    return withLimit(semaphore, async () => {
      const state = await loadState();
      return executeMockCommand(args, options, state);
    });
  };
}

async function buildMockTreeState(options: MockExecutorOptions): Promise<MockTreeState> {
  const fixtureRoot = path.resolve(options.fixtureRoot);
  const manifest = await readManifest(fixtureRoot);
  const nodes = new Map<string, MockNode>();
  let totalFiles = 0;

  async function buildNode(fsPath: string, virtualPath: string, relativePath: string): Promise<MockNode> {
    const stats = await fs.stat(fsPath);

    if (!stats.isDirectory()) {
      totalFiles += 1;
      const manifestSize = manifest.fileSizes?.[relativePath];
      const sizeBytes = manifestSize ?? stats.size;
      const fileNode: MockNode = {
        name: path.basename(fsPath),
        sizeBytes,
        type: 'file',
        virtualPath
      };

      nodes.set(virtualPath, fileNode);
      return fileNode;
    }

    const entries = await fs.readdir(fsPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    const children: MockNode[] = [];
    for (const entry of entries) {
      const childFsPath = path.join(fsPath, entry.name);
      const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const childVirtualPath = virtualPath === '/' ? `/${entry.name}` : `${virtualPath}/${entry.name}`;
      children.push(await buildNode(childFsPath, childVirtualPath, childRelativePath));
    }

    const directoryNode: MockNode = {
      name: virtualPath === options.virtualRoot ? path.posix.basename(options.virtualRoot) : path.basename(fsPath),
      sizeBytes: children.reduce((sum, child) => sum + child.sizeBytes, 0),
      type: 'directory',
      virtualPath,
      children
    };

    nodes.set(virtualPath, directoryNode);
    return directoryNode;
  }

  const rootNode = await buildNode(fixtureRoot, options.virtualRoot, '');

  return {
    nodes,
    rootNode,
    totalFiles,
    totalSizeBytes: rootNode.sizeBytes,
    lastScanAt: manifest.lastScanAt ?? '2026-05-03 09:30:00',
    version: manifest.version ?? 'duc-mock 0.1.0'
  };
}

async function readManifest(fixtureRoot: string): Promise<MockManifest> {
  const manifestPath = `${fixtureRoot}.manifest.json`;

  try {
    const text = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(text) as MockManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

function executeMockCommand(args: string[], options: MockExecutorOptions, state: MockTreeState) {
  if (args.length === 1 && args[0] === '--version') {
    return { stdout: `${state.version}\n`, stderr: '' };
  }

  if (args[0] === 'info') {
    assertDatabaseArg(args, options.database);

    const datePart = state.lastScanAt.slice(0, 10);
    const timePart = state.lastScanAt.slice(11, 19);

    return {
      stdout: [
        'Date       Time       Files    Dirs    Size Path',
        `${datePart} ${timePart}  ${formatCompactCount(state.totalFiles)}  ${formatCompactCount(state.totalFiles)}  ${formatCompactSize(state.totalSizeBytes)} ${options.virtualRoot}`
      ].join('\n'),
      stderr: ''
    };
  }

  if (args[0] === 'ls') {
    assertDatabaseArg(args, options.database);
    const requestedPath = getPathArg(args);
    const node = getDirectoryNode(state, requestedPath);
    const stdout = (node.children ?? [])
      .map((child) => `${child.sizeBytes} ${child.name}${child.type === 'directory' ? '/' : ''}`)
      .join('\n');

    return { stdout: stdout ? `${stdout}\n` : '', stderr: '' };
  }

  if (args[0] === 'json') {
    assertDatabaseArg(args, options.database);
    const requestedPath = getPathArg(args);
    const node = getDirectoryNode(state, requestedPath);

    return {
      stdout: `${JSON.stringify(toDucJson(node), null, 2)}\n`,
      stderr: ''
    };
  }

  throw new ApiError(502, 'DUC_COMMAND_FAILED', 'Unsupported Duc mock command', { args });
}

function assertDatabaseArg(args: string[], expectedDatabase: string) {
  const dbFlagIndex = args.indexOf('-d');
  const database = dbFlagIndex >= 0 ? args[dbFlagIndex + 1] : undefined;

  if (database !== expectedDatabase) {
    throw new ApiError(502, 'DUC_COMMAND_FAILED', 'Unexpected mock database path', { args, expectedDatabase });
  }
}

function getPathArg(args: string[]) {
  const separatorIndex = args.indexOf('--');
  const requestedPath = separatorIndex >= 0 ? args[separatorIndex + 1] : undefined;

  if (!requestedPath) {
    throw new ApiError(502, 'DUC_COMMAND_FAILED', 'Mock command is missing a target path', { args });
  }

  return requestedPath;
}

function getDirectoryNode(state: MockTreeState, requestedPath: string) {
  const node = state.nodes.get(requestedPath);

  if (!node) {
    throw new ApiError(404, 'PATH_NOT_INDEXED', 'Path was not found in Duc index');
  }

  if (node.type !== 'directory') {
    throw new ApiError(404, 'PATH_NOT_INDEXED', 'Path is not a directory in Duc index');
  }

  return node;
}

function toDucJson(node: MockNode): Record<string, unknown> {
  return {
    name: node.name,
    size: node.sizeBytes,
    size_actual: node.sizeBytes,
    children: node.type === 'directory'
      ? (node.children ?? []).map((child) => toDucJson(child))
      : undefined
  };
}

function formatCompactCount(n: number): string {
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '')}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}G`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

function formatCompactSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 ** 4) return `${(sizeBytes / 1024 ** 4).toFixed(1).replace(/\.0$/, '')}T`;
  if (sizeBytes >= 1024 ** 3) return `${(sizeBytes / 1024 ** 3).toFixed(1).replace(/\.0$/, '')}G`;
  if (sizeBytes >= 1024 ** 2) return `${(sizeBytes / 1024 ** 2).toFixed(1).replace(/\.0$/, '')}M`;
  if (sizeBytes >= 1024) return `${(sizeBytes / 1024).toFixed(1).replace(/\.0$/, '')}K`;
  return `${sizeBytes}B`;
}
