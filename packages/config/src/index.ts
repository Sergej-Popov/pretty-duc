import { z } from 'zod';

export const appDefaults = {
  database: '/database/duc.db',
  root: '/scan/root',
  port: 3000,
  ducBin: 'duc',
  ducTimeoutMs: 5000,
  recursiveBudgetMs: 15000,
  defaultLevels: 1,
  maxChildrenLevels: 4,
  maxTreeLevels: 2,
  maxChildrenPerDirectory: 500,
  maxRecursiveNodes: 2000,
  maxTreeNodes: 200,
  maxChildrenResponseBytes: 1024 * 1024,
  maxTreeResponseBytes: 512 * 1024,
  recursiveConcurrency: 2
} as const;

const envSchema = z.object({
  DUC_DATABASE: z.string().default(appDefaults.database),
  DUC_ROOT: z.string().default(appDefaults.root),
  PORT: z.coerce.number().int().positive().default(appDefaults.port),
  DUC_BIN: z.string().default(appDefaults.ducBin),
  DEFAULT_MIN_SIZE: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string())
    .optional()
});

export type AppConfig = {
  database: string;
  root: string;
  port: number;
  ducBin: string;
  defaultMinSize: number | null;
  limits: {
    ducTimeoutMs: number;
    recursiveBudgetMs: number;
    defaultLevels: number;
    maxChildrenLevels: number;
    maxTreeLevels: number;
    maxChildrenPerDirectory: number;
    maxRecursiveNodes: number;
    maxTreeNodes: number;
    maxChildrenResponseBytes: number;
    maxTreeResponseBytes: number;
    recursiveConcurrency: number;
  };
};

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.parse(env);
  const rawMinSize = parsed.DEFAULT_MIN_SIZE;
  const defaultMinSize = rawMinSize === undefined || rawMinSize === '' ? null : Number.parseInt(rawMinSize, 10);

  if (defaultMinSize !== null && Number.isNaN(defaultMinSize)) {
    throw new Error('DEFAULT_MIN_SIZE must be an integer number of bytes');
  }

  return {
    database: parsed.DUC_DATABASE,
    root: normalizeDucPath(parsed.DUC_ROOT),
    port: parsed.PORT,
    ducBin: parsed.DUC_BIN,
    defaultMinSize,
    limits: {
      ducTimeoutMs: appDefaults.ducTimeoutMs,
      recursiveBudgetMs: appDefaults.recursiveBudgetMs,
      defaultLevels: appDefaults.defaultLevels,
      maxChildrenLevels: appDefaults.maxChildrenLevels,
      maxTreeLevels: appDefaults.maxTreeLevels,
      maxChildrenPerDirectory: appDefaults.maxChildrenPerDirectory,
      maxRecursiveNodes: appDefaults.maxRecursiveNodes,
      maxTreeNodes: appDefaults.maxTreeNodes,
      maxChildrenResponseBytes: appDefaults.maxChildrenResponseBytes,
      maxTreeResponseBytes: appDefaults.maxTreeResponseBytes,
      recursiveConcurrency: appDefaults.recursiveConcurrency
    }
  };
}

export function normalizeDucPath(input: string): string {
  const path = input.replace(/\\/g, '/').trim();

  if (!path.startsWith('/')) {
    throw new Error('DUC paths must be absolute POSIX-style paths');
  }

  const parts = path.split('/');
  const normalized: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') {
      continue;
    }

    if (part === '..') {
      normalized.pop();
      continue;
    }

    normalized.push(part);
  }

  return `/${normalized.join('/')}` || '/';
}
