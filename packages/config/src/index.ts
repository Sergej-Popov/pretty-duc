import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { userConfigSchema, type UserConfig } from '@pretty-duc/contracts';

const LIMIT_KEYS = [
  'ducTimeoutMs',
  'recursiveBudgetMs',
  'defaultLevels',
  'maxChildrenLevels',
  'maxTreeLevels',
  'maxChildrenPerDirectory',
  'maxRecursiveNodes',
  'maxTreeNodes',
  'maxChildrenResponseBytes',
  'maxTreeResponseBytes',
  'recursiveConcurrency'
] as const;

export const appDefaults = {
  database: '/database/duc.db',
  root: '/scan/root',
  port: 3000,
  ducBin: 'duc',
  enableTreeApi: false,
  ducTimeoutMs: 10000,
  recursiveBudgetMs: 15000,
  defaultLevels: 2,
  maxChildrenLevels: 6,
  maxTreeLevels: 2,
  maxChildrenPerDirectory: 2000,
  maxRecursiveNodes: 10000,
  maxTreeNodes: 1000,
  maxChildrenResponseBytes: 10485760,
  maxTreeResponseBytes: 512 * 1024,
  recursiveConcurrency: 2
} as const;

const envSchema = z.object({
  DUC_DATABASE: z.string().default(appDefaults.database),
  DUC_ROOT: z.string().default(appDefaults.root),
  PORT: z.coerce.number().int().positive().default(appDefaults.port),
  DUC_BIN: z.string().default(appDefaults.ducBin),
  DUC_MOCK_ROOT: z.string().optional(),
  CONFIG_FILE: z.string().default('pretty-duc-config.json'),
  DATA_DIR: z.string().default('.'),
  ENABLE_TREE_API: z.string().optional().transform((v) => v === 'true'),
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
  mockScanRoot: string | null;
  configFilePath: string;
  dataDir: string;
  enableTreeApi: boolean;
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
    mockScanRoot: parsed.DUC_MOCK_ROOT?.trim() ? parsed.DUC_MOCK_ROOT.trim() : null,
    configFilePath: parsed.CONFIG_FILE,
    dataDir: parsed.DATA_DIR,
    enableTreeApi: parsed.ENABLE_TREE_API ?? appDefaults.enableTreeApi,
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

export function buildConfig(env: Record<string, string | undefined>): AppConfig {
  const base = parseConfig(env);
  const saved = readConfigFile(base.configFilePath);

  if (saved) {
    if (saved.enableTreeApi !== undefined) {
      base.enableTreeApi = saved.enableTreeApi;
    }

    if (saved.defaultMinSize !== undefined) {
      base.defaultMinSize = saved.defaultMinSize;
    }

    if (saved.limits) {
      for (const key of LIMIT_KEYS) {
        const value = saved.limits[key as keyof typeof saved.limits];
        if (value !== undefined) {
          (base.limits as Record<string, unknown>)[key] = value;
        }
      }
    }
  }

  return base;
}

export function readConfigFile(filePath: string): UserConfig | null {
  try {
    const content = fs.readFileSync(path.resolve(filePath), 'utf-8');
    const parsed = userConfigSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeConfigFile(filePath: string, config: UserConfig): void {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.resolve(filePath), JSON.stringify(config, null, 2), 'utf-8');
}

export function deleteConfigFile(filePath: string): void {
  try {
    fs.unlinkSync(path.resolve(filePath));
  } catch {
    // File doesn't exist, nothing to do
  }
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
