import path from 'node:path';
import fs from 'node:fs/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { AppConfig } from '@pretty-duc/config';
import { treeQuerySchema, type SortMode } from '@pretty-duc/contracts';
import { parseDucInfoOutput, assertReasonablePayload } from './lib/parser';
import { createExecutor, getChildrenTree, getTreeJson } from './lib/duc';
import { ApiError, toErrorResponse } from './lib/errors';
import { resolveRequestedPath } from './lib/path-policy';

export function createApp(config: AppConfig) {
  const app = Fastify({ logger: true });
  const executor = createExecutor(config, 4); // Global Duc process concurrency: 4
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
      await executor(['--version'], config.limits.ducTimeoutMs);
      ducAvailable = true;
    } catch {
      ducAvailable = false;
    }

    try {
      await fs.access(config.database);
      databaseReadable = true;
    } catch {
      databaseReadable = false;
    }

    return {
      ok: ducAvailable && databaseReadable,
      ducAvailable,
      databaseReadable,
      database: config.database,
      root: config.root
    };
  });

  app.get('/api/info', async () => {
    const result = await executor(['info', '-d', config.database], config.limits.ducTimeoutMs);
    return {
      database: config.database,
      raw: result.stdout.trim(),
      parsed: parseDucInfoOutput(result.stdout)
    };
  });

  app.get('/api/children', async (request) => {
    const parsed = parseChildrenQuery(request.query);

    const requestedPath = resolveRequestedPath(config.root, parsed.path);
    const minSize = parsed.minSize ?? config.defaultMinSize;
    const levels = Math.min(parsed.levels, config.limits.maxChildrenLevels);
    request.log.info(
      { path: requestedPath, levels, sort: parsed.sort, minSize, maxNodes: config.limits.maxRecursiveNodes },
      'children request started'
    );
    const result = await getChildrenTree({
      config,
      path: requestedPath,
      levels,
      minSize,
      sort: parsed.sort,
      maxNodes: config.limits.maxRecursiveNodes,
      maxChildrenPerDirectory: config.limits.maxChildrenPerDirectory,
      maxResponseBytes: config.limits.maxChildrenResponseBytes,
      executor
    });

    request.log.info(
      { path: requestedPath, levels, nodeCount: result.nodeCount, truncated: result.truncated, totalSizeBytes: result.totalSizeBytes, maxResponseBytes: config.limits.maxChildrenResponseBytes },
      'children walk completed'
    );

    const payload = {
      path: requestedPath,
      levels,
      sort: parsed.sort,
      appliedMinSize: minSize,
      truncated: result.truncated,
      totalSizeBytes: result.totalSizeBytes,
      children: result.children
    };

    assertReasonablePayload(result.nodeCount, config.limits.maxChildrenResponseBytes);
    return payload;
  });

  app.get('/api/tree', async (request) => {
    if (!config.enableTreeApi) {
      throw new ApiError(403, 'FEATURE_DISABLED', 'Tree endpoint is disabled by configuration');
    }

    const parsed = treeQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      throw new ApiError(422, 'INVALID_QUERY', 'Invalid tree query', { issues: parsed.error.issues });
    }

    const requestedPath = resolveRequestedPath(config.root, parsed.data.path);
    
    request.log.info(
      { path: requestedPath, levels: parsed.data.levels, maxNodes: config.limits.maxTreeNodes },
      'tree request started'
    );

    const result = await getTreeJson({
      config,
      path: requestedPath,
      levels: parsed.data.levels,
      maxNodes: config.limits.maxTreeNodes,
      executor
    });

    request.log.info(
      { path: requestedPath, levels: parsed.data.levels, nodeCount: result.nodeCount, truncated: result.truncated, totalSizeBytes: result.totalSizeBytes, maxResponseBytes: config.limits.maxTreeResponseBytes },
      'tree walk completed'
    );

    const payload = {
      path: requestedPath,
      source: 'duc-json' as const,
      levels: parsed.data.levels,
      nodeCount: result.nodeCount,
      truncated: result.truncated,
      totalSizeBytes: result.totalSizeBytes,
      children: result.children
    };

    assertReasonablePayload(result.nodeCount, config.limits.maxTreeResponseBytes);
    return payload;
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

function parseChildrenQuery(query: unknown): { path: string; levels: number; sort: SortMode; minSize?: number | null } {
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

  if (!path) {
    throw new ApiError(422, 'INVALID_QUERY', 'Invalid children query', { issues: [{ path: ['path'], message: 'Path is required' }] });
  }

  if (!Number.isInteger(levels) || levels < 1) {
    throw new ApiError(422, 'INVALID_QUERY', 'Invalid children query', { issues: [{ path: ['levels'], message: 'Levels must be a positive integer' }] });
  }

  if (minSize !== undefined && (!Number.isInteger(minSize) || minSize < 0)) {
    throw new ApiError(422, 'INVALID_QUERY', 'Invalid children query', { issues: [{ path: ['minSize'], message: 'Minimum size must be a non-negative integer' }] });
  }

  return { path, levels, sort, minSize };
}
