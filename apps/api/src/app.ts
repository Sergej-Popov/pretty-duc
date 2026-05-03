import path from 'node:path';
import fs from 'node:fs/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { AppConfig } from '@pretty-duc/config';
import { childrenQuerySchema, treeQuerySchema, type SortMode } from '@pretty-duc/contracts';
import { parseDucInfoOutput, assertReasonablePayload } from './lib/parser';
import { createExecutor, getChildrenTree, getTreeJson } from './lib/duc';
import { ApiError, toErrorResponse } from './lib/errors';
import { resolveRequestedPath } from './lib/path-policy';

export function createApp(config: AppConfig) {
  const app = Fastify({ logger: true });
  const executor = createExecutor(config.ducBin, 4); // Global Duc process concurrency: 4
  const webDist = path.resolve(import.meta.dir, '../../web/dist');

  app.register(cors, { origin: true });

  app.setErrorHandler((error, _request, reply) => {
    const formatted = toErrorResponse(error);
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
    const parsed = childrenQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      throw new ApiError(422, 'INVALID_QUERY', 'Invalid children query', { issues: parsed.error.issues });
    }

    const requestedPath = resolveRequestedPath(config.root, parsed.data.path);
    const minSize = parsed.data.minSize ?? config.defaultMinSize;
    const result = await getChildrenTree({
      config,
      path: requestedPath,
      levels: parsed.data.levels,
      minSize,
      sort: parsed.data.sort as SortMode,
      maxNodes: config.limits.maxRecursiveNodes,
      maxChildrenPerDirectory: config.limits.maxChildrenPerDirectory,
      maxResponseBytes: config.limits.maxChildrenResponseBytes,
      executor
    });

    const payload = {
      path: requestedPath,
      levels: parsed.data.levels,
      sort: parsed.data.sort,
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
    
    const result = await getTreeJson({
      config,
      path: requestedPath,
      levels: parsed.data.levels,
      maxNodes: config.limits.maxTreeNodes,
      executor
    });

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

  app.get('/*', async (_request, reply) => {
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
