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
  root: z.string()
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const infoResponseSchema = z.object({
  database: z.string(),
  raw: z.string(),
  parsed: z.object({
    entries: z.number().nullable(),
    sizeBytes: z.number().nullable(),
    lastScanAt: z.string().nullable()
  })
});
export type InfoResponse = z.infer<typeof infoResponseSchema>;

export const childrenQuerySchema = z.object({
  path: z.string().min(1),
  levels: z.coerce.number().int().min(1).max(64).default(1),
  sort: sortModeSchema.default('sizeDesc'),
  minSize: z.coerce.number().int().nonnegative().nullable().optional()
});
export type ChildrenQuery = z.infer<typeof childrenQuerySchema>;

export const childrenResponseSchema = z.object({
  path: z.string(),
  levels: z.number().int().min(1),
  sort: sortModeSchema,
  appliedMinSize: z.number().nullable(),
  truncated: z.boolean(),
  totalSizeBytes: z.number().nonnegative(),
  children: z.array(explorerNodeSchema)
});
export type ChildrenResponse = z.infer<typeof childrenResponseSchema>;

export const treeQuerySchema = z.object({
  path: z.string().min(1),
  levels: z.coerce.number().int().min(1).max(2).default(2)
});
export type TreeQuery = z.infer<typeof treeQuerySchema>;

export const treeResponseSchema = z.object({
  path: z.string(),
  source: z.literal('duc-ls-recursive'),
  levels: z.number().int().min(1),
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
