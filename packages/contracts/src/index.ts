import { z } from 'zod';

export const sortModeSchema = z.enum(['sizeDesc', 'nameAsc']);
export type SortMode = z.infer<typeof sortModeSchema>;

export const nodeTypeSchema = z.enum(['directory', 'file']);
export type NodeType = z.infer<typeof nodeTypeSchema>;

export const explorerNodeSchema: z.ZodType<ExplorerNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    sizeBytes: z.number().nonnegative(),
    humanSize: z.string(),
    type: nodeTypeSchema,
    percentOfParent: z.number().min(0),
    hasChildren: z.boolean(),
    children: z.array(explorerNodeSchema).optional()
  })
);

export type ExplorerNode = {
  name: string;
  path: string;
  sizeBytes: number;
  humanSize: string;
  type: NodeType;
  percentOfParent: number;
  hasChildren: boolean;
  children?: ExplorerNode[];
};

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  ducAvailable: z.boolean(),
  databaseReadable: z.boolean(),
  database: z.string(),
  root: z.string(),
  deployEnv: z.string().nullable().optional()
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const infoResponseSchema = z.object({
  database: z.string(),
  raw: z.string(),
  parsed: z.object({
    entries: z.number().nullable(),
    dirs: z.number().nullable(),
    sizeBytes: z.number().nullable(),
    lastScanAt: z.string().nullable()
  }),
  paths: z.array(z.object({
    path: z.string(),
    files: z.number().nonnegative(),
    dirs: z.number().nonnegative(),
    sizeBytes: z.number().nonnegative(),
    lastScanAt: z.string()
  }))
});
export type InfoResponse = z.infer<typeof infoResponseSchema>;

export const childrenQuerySchema = z.object({
  path: z.string().min(1),
  levels: z.coerce.number().int().min(1).max(64).default(1),
  sort: sortModeSchema.default('sizeDesc'),
  minSize: z.coerce.number().int().nonnegative().nullable().optional(),
  apparent: z.coerce.boolean().default(true)
});
export type ChildrenQuery = z.infer<typeof childrenQuerySchema>;

export const childrenResponseSchema = z.object({
  path: z.string(),
  levels: z.number().int().min(1),
  sort: sortModeSchema,
  appliedMinSize: z.number().nullable(),
  apparent: z.boolean(),
  truncated: z.boolean(),
  totalSizeBytes: z.number().nonnegative(),
  children: z.array(explorerNodeSchema)
});
export type ChildrenResponse = z.infer<typeof childrenResponseSchema>;

export const volumeSchema = z.object({
  path: z.string(),
  storageId: z.string(),
  totalBytes: z.number().nonnegative(),
  freeBytes: z.number().nonnegative(),
  usedBytes: z.number().nonnegative()
});
export type Volume = z.infer<typeof volumeSchema>;

export const volumesResponseSchema = z.object({
  volumes: z.array(volumeSchema)
});
export type VolumesResponse = z.infer<typeof volumesResponseSchema>;

export const volumeSampleSchema = z.object({
  at: z.string(),
  freeBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative()
});
export type VolumeSample = z.infer<typeof volumeSampleSchema>;

export const volumeForecastSchema = z.object({
  freeBytesPerDay: z.number(),
  daysUntilFull: z.number().nonnegative().nullable(),
  basedOnDays: z.number().nonnegative()
});
export type VolumeForecast = z.infer<typeof volumeForecastSchema>;

export const volumeHistorySchema = volumeSchema.extend({
  samples: z.array(volumeSampleSchema),
  forecast: volumeForecastSchema.nullable()
});
export type VolumeHistory = z.infer<typeof volumeHistorySchema>;

export const volumeHistoryResponseSchema = z.object({
  volumes: z.array(volumeHistorySchema)
});
export type VolumeHistoryResponse = z.infer<typeof volumeHistoryResponseSchema>;

export const snapshotInfoSchema = z.object({
  scanAt: z.string().nullable(),
  takenAt: z.string()
});
export type SnapshotInfo = z.infer<typeof snapshotInfoSchema>;

export const changeEntrySchema = z.object({
  path: z.string(),
  type: nodeTypeSchema,
  beforeBytes: z.number().nullable(),
  afterBytes: z.number().nullable(),
  deltaBytes: z.number()
});
export type ChangeEntry = z.infer<typeof changeEntrySchema>;

export const changesResponseSchema = z.object({
  path: z.string(),
  from: snapshotInfoSchema.nullable(),
  to: snapshotInfoSchema.nullable(),
  minSizeBytes: z.number(),
  snapshotRunning: z.boolean(),
  grown: z.array(changeEntrySchema),
  shrunk: z.array(changeEntrySchema)
});
export type ChangesResponse = z.infer<typeof changesResponseSchema>;

export const largeFileSchema = z.object({
  path: z.string(),
  sizeBytes: z.number().nonnegative(),
  modifiedAt: z.string().nullable()
});
export type LargeFile = z.infer<typeof largeFileSchema>;

export const largeFilesResponseSchema = z.object({
  path: z.string(),
  snapshot: snapshotInfoSchema.nullable(),
  minSizeBytes: z.number(),
  olderThanDays: z.number().int().nonnegative(),
  snapshotRunning: z.boolean(),
  files: z.array(largeFileSchema)
});
export type LargeFilesResponse = z.infer<typeof largeFilesResponseSchema>;

export const treeQuerySchema = z.object({
  path: z.string().min(1)
});
export type TreeQuery = z.infer<typeof treeQuerySchema>;

export const treeResponseSchema = z.object({
  path: z.string(),
  source: z.literal('duc-json'),
  nodeCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  totalSizeBytes: z.number().nonnegative(),
  children: z.array(explorerNodeSchema)
});
export type TreeResponse = z.infer<typeof treeResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional()
  })
});
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;

export const configLimitsSchema = z.object({
  ducTimeoutMs: z.number().int().positive(),
  recursiveBudgetMs: z.number().int().positive(),
  defaultLevels: z.number().int().min(1).max(6),
  maxChildrenLevels: z.number().int().min(1).max(10),
  maxTreeLevels: z.number().int().min(1).max(5),
  maxChildrenPerDirectory: z.number().int().positive(),
  maxRecursiveNodes: z.number().int().positive(),
  maxTreeNodes: z.number().int().positive(),
  maxChildrenResponseBytes: z.number().int().positive(),
  maxTreeResponseBytes: z.number().int().positive(),
  recursiveConcurrency: z.number().int().min(1).max(8)
});
export type ConfigLimits = z.infer<typeof configLimitsSchema>;

export const partialConfigLimitsSchema = configLimitsSchema.partial();
export type PartialConfigLimits = z.infer<typeof partialConfigLimitsSchema>;

export const userConfigSchema = z.object({
  limits: partialConfigLimitsSchema.optional(),
  enableTreeApi: z.boolean().optional(),
  defaultMinSize: z.number().int().nonnegative().nullable().optional()
});
export type UserConfig = z.infer<typeof userConfigSchema>;

export const configResponseSchema = z.object({
  limits: configLimitsSchema,
  enableTreeApi: z.boolean(),
  defaultMinSize: z.number().int().nonnegative().nullable(),
  configFilePath: z.string(),
  hasSavedConfig: z.boolean()
});
export type ConfigResponse = z.infer<typeof configResponseSchema>;
