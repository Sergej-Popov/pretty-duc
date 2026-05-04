import path from 'node:path';
import fs from 'node:fs/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { AppConfig } from '@pretty-duc/config';
import { writeConfigFile, deleteConfigFile, readConfigFile } from '@pretty-duc/config';
import { treeQuerySchema, userConfigSchema, type SortMode } from '@pretty-duc/contracts';
import { parseDucInfoOutput, assertReasonablePayload } from './lib/parser';
import { createExecutor, getChildrenTree, getTreeJson } from './lib/duc';
import { ApiError, toErrorResponse } from './lib/errors';
import { resolveRequestedPath } from './lib/path-policy';

export function createApp(initialConfig: AppConfig) {
  const app = Fastify({ logger: true });
  let currentConfig: AppConfig = { ...initialConfig, limits: { ...initialConfig.limits } };
  const executor = createExecutor(currentConfig, 4);
  const webDist = path.resolve(import.meta.dir, '../../web/dist');

  app.register(cors, { origin: true });

  app.setErrorHandler((error, request, reply) => {
    const formatted = toErrorResponse(error);

    if (error instanceof ApiError) {
      request.log.error(
        { statusCode: error.statusCode, code: error.code, details: error.details },
        `API error: ${error.message}`
      );
    } else {
      request.log.error(
        { err: error, statusCode: formatted.statusCode },
        `Unhandled error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    reply.status(formatted.statusCode).send(formatted.payload);
  });

  app.get('/api/health', async () => {
    let ducAvailable = false;
    let databaseReadable = false;

    try {
      await executor(['--version'], currentConfig.limits.ducTimeoutMs);
      ducAvailable = true;
    } catch {
      ducAvailable = false;
    }

    try {
      await fs.access(currentConfig.database);
      databaseReadable = true;
    } catch {
      databaseReadable = false;
    }

    return {
      ok: ducAvailable && databaseReadable,
      ducAvailable,
      databaseReadable,
      database: currentConfig.database,
      root: currentConfig.root,
      deployEnv: process.env.DEPLOY_ENV || null
    };
  });

  app.get('/api/info', async () => {
    const result = await executor(['info', '-d', currentConfig.database], currentConfig.limits.ducTimeoutMs);
    const { paths, ...parsed } = parseDucInfoOutput(result.stdout);
    return {
      database: currentConfig.database,
      raw: result.stdout.trim(),
      parsed,
      paths
    };
  });

  app.get('/api/children', async (request) => {
    const parsed = parseChildrenQuery(request.query);

    const requestedPath = resolveRequestedPath(currentConfig.root, parsed.path);
    const minSize = parsed.minSize ?? currentConfig.defaultMinSize;
    const levels = Math.min(parsed.levels, currentConfig.limits.maxChildrenLevels);
    request.log.info(
      { path: requestedPath, levels, sort: parsed.sort, minSize, maxNodes: currentConfig.limits.maxRecursiveNodes, apparent: parsed.apparent },
      'children request started'
    );
    const result = await getChildrenTree({
      config: currentConfig,
      path: requestedPath,
      levels,
      minSize,
      sort: parsed.sort,
      maxNodes: currentConfig.limits.maxRecursiveNodes,
      maxChildrenPerDirectory: currentConfig.limits.maxChildrenPerDirectory,
      maxResponseBytes: currentConfig.limits.maxChildrenResponseBytes,
      executor,
      apparent: parsed.apparent
    });

    request.log.info(
      { path: requestedPath, levels, nodeCount: result.nodeCount, truncated: result.truncated, totalSizeBytes: result.totalSizeBytes, maxResponseBytes: currentConfig.limits.maxChildrenResponseBytes },
      'children walk completed'
    );

    const payload = {
      path: requestedPath,
      levels,
      sort: parsed.sort,
      appliedMinSize: minSize,
      apparent: parsed.apparent,
      truncated: result.truncated,
      totalSizeBytes: result.totalSizeBytes,
      children: result.children
    };

    assertReasonablePayload(result.nodeCount, currentConfig.limits.maxChildrenResponseBytes);
    return payload;
  });

  app.get('/api/tree', async (request) => {
    if (!currentConfig.enableTreeApi) {
      throw new ApiError(403, 'FEATURE_DISABLED', 'Tree endpoint is disabled by configuration');
    }

    const parsed = treeQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      throw new ApiError(422, 'INVALID_QUERY', 'Invalid tree query', { issues: parsed.error.issues });
    }

    const requestedPath = resolveRequestedPath(currentConfig.root, parsed.data.path);

    request.log.info(
      { path: requestedPath },
      'tree request started'
    );

    const result = await getTreeJson({
      config: currentConfig,
      path: requestedPath,
      executor
    });

    request.log.info(
      { path: requestedPath, nodeCount: result.nodeCount, totalSizeBytes: result.totalSizeBytes },
      'tree walk completed'
    );

    const payload = {
      path: requestedPath,
      source: 'duc-json' as const,
      nodeCount: result.nodeCount,
      truncated: result.truncated,
      totalSizeBytes: result.totalSizeBytes,
      children: result.children
    };

    return payload;
  });

  app.post('/api/index', async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const targetPath = typeof body.path === 'string' && body.path.length > 0 ? body.path : null;

    if (targetPath) {
      resolveRequestedPath(currentConfig.root, targetPath);
    }

    const displayPath = targetPath ?? currentConfig.root;
    const args = ['index', '-d', currentConfig.database, '--'];
    if (targetPath) {
      args.push(targetPath);
    }

    Bun.spawn([currentConfig.ducBin, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      onExit: (proc, exitCode) => {
        if (exitCode === 0) {
          request.log.info({ path: displayPath }, 'duc index completed successfully');
        } else {
          request.log.error({ path: displayPath, exitCode }, 'duc index failed');
        }
      }
    });

    request.log.info({ path: displayPath }, 'duc index started');
    return { ok: true, message: `Indexing started for ${displayPath}` };
  });

  app.get('/api/config', async () => {
    const hasSaved = readConfigFile(currentConfig.configFilePath) !== null;

    return {
      limits: currentConfig.limits,
      enableTreeApi: currentConfig.enableTreeApi,
      defaultMinSize: currentConfig.defaultMinSize,
      configFilePath: currentConfig.configFilePath,
      hasSavedConfig: hasSaved
    };
  });

  app.put('/api/config', async (request) => {
    const parsed = userConfigSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new ApiError(422, 'INVALID_CONFIG', 'Invalid config payload', { issues: parsed.error.issues });
    }

    const update = parsed.data;

    if (update.enableTreeApi !== undefined) {
      currentConfig.enableTreeApi = update.enableTreeApi;
    }

    if (update.defaultMinSize !== undefined) {
      currentConfig.defaultMinSize = update.defaultMinSize;
    }

    if (update.limits) {
      const limitKeys = Object.keys(update.limits) as Array<keyof typeof update.limits>;
      for (const key of limitKeys) {
        const value = update.limits[key];
        if (value !== undefined) {
          (currentConfig.limits as Record<string, unknown>)[key] = value;
        }
      }
    }

    writeConfigFile(currentConfig.configFilePath, {
      limits: currentConfig.limits,
      enableTreeApi: currentConfig.enableTreeApi,
      defaultMinSize: currentConfig.defaultMinSize
    });

    return { ok: true };
  });

  app.post('/api/config/reset', async () => {
    deleteConfigFile(currentConfig.configFilePath);

    currentConfig.enableTreeApi = initialConfig.enableTreeApi;
    currentConfig.defaultMinSize = initialConfig.defaultMinSize;
    currentConfig.limits = { ...initialConfig.limits };

    return { ok: true };
  });

  app.register(fastifyStatic, {
    root: webDist,
    prefix: '/'
  });

  app.setNotFoundHandler(async (request, reply) => {
    const url = request.raw.url ?? '/';

    if (url === '/api' || url.startsWith('/api/')) {
      throw new ApiError(404, 'NOT_FOUND', 'Route not found');
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      throw new ApiError(404, 'NOT_FOUND', 'Route not found');
    }

    const indexPath = path.join(webDist, 'index.html');
    try {
      await fs.access(indexPath);
      return reply.sendFile('index.html');
    } catch {
      reply.type('text/html').send('<!doctype html><title>Pretty Duc</title><p>Web app has not been built yet.</p>');
    }
  });

  return app;
}

function parseChildrenQuery(query: unknown): { path: string; levels: number; sort: SortMode; minSize?: number | null; apparent: boolean } {
  if (!query || typeof query !== 'object') {
    throw new ApiError(422, 'INVALID_QUERY', 'Invalid children query');
  }

  const source = query as Record<string, unknown>;
  const path = typeof source.path === 'string' ? source.path : '';
  const levels = typeof source.levels === 'string' || typeof source.levels === 'number'
    ? Number.parseInt(String(source.levels), 10)
    : 1;
  const sort = source.sort === 'nameAsc' ? 'nameAsc' : 'sizeDesc';
  const minSize = source.minSize === undefined || source.minSize === null || source.minSize === ''
    ? undefined
    : Number.parseInt(String(source.minSize), 10);
  const apparent = source.apparent === undefined || source.apparent === null
    ? true
    : source.apparent === 'true' || source.apparent === '1' || source.apparent === true;

  if (!path) {
    throw new ApiError(422, 'INVALID_QUERY', 'Invalid children query', { issues: [{ path: ['path'], message: 'Path is required' }] });
  }

  if (!Number.isInteger(levels) || levels < 1) {
    throw new ApiError(422, 'INVALID_QUERY', 'Invalid children query', { issues: [{ path: ['levels'], message: 'Levels must be a positive integer' }] });
  }

  if (minSize !== undefined && (!Number.isInteger(minSize) || minSize < 0)) {
    throw new ApiError(422, 'INVALID_QUERY', 'Invalid children query', { issues: [{ path: ['minSize'], message: 'Minimum size must be a non-negative integer' }] });
  }

  return { path, levels, sort, minSize, apparent };
}
