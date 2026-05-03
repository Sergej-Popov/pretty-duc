import type { ExplorerNode, SortMode } from '@pretty-duc/contracts';

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;

  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = size;
  let unitIndex = -1;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function buildBreadcrumbs(path: string): Array<{ label: string; path: string }> {
  const segments = path.split('/').filter(Boolean);
  const crumbs = [{ label: '/', path: '/' }];
  let current = '';

  for (const segment of segments) {
    current += `/${segment}`;
    crumbs.push({ label: segment, path: current });
  }

  return crumbs;
}

export function sortNodes(nodes: ExplorerNode[], mode: SortMode): ExplorerNode[] {
  const copy = [...nodes];

  if (mode === 'nameAsc') {
    copy.sort((left, right) => left.name.localeCompare(right.name));
    return copy;
  }

  copy.sort((left, right) => right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name));
  return copy;
}

export function filterNodes(nodes: ExplorerNode[], query: string): ExplorerNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;
  return nodes.filter((node) => node.name.toLowerCase().includes(normalized) || node.path.toLowerCase().includes(normalized));
}

export function largestItems(nodes: ExplorerNode[], limit = 5): ExplorerNode[] {
  return [...nodes].sort((left, right) => right.sizeBytes - left.sizeBytes).slice(0, limit);
}

export function toChartTree(nodes: ExplorerNode[]): Array<Record<string, unknown>> {
  return nodes.map((node) => ({
    id: node.path,
    name: node.name,
    value: node.sizeBytes,
    path: node.path,
    type: node.type,
    children: node.children ? toChartTree(node.children) : undefined
  }));
}
