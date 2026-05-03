import type { ChildrenResponse, HealthResponse, InfoResponse, SortMode, TreeResponse } from '@pretty-duc/contracts';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Request failed: ${response.status}`);
  }

  return data as T;
}

export function fetchHealth() {
  return getJson<HealthResponse>('/api/health');
}

export function fetchInfo() {
  return getJson<InfoResponse>('/api/info');
}

export function fetchChildren(path: string, levels: number, sort: SortMode, minSize?: number | null) {
  const params = new URLSearchParams({
    path,
    levels: String(levels),
    sort
  });

  if (minSize !== undefined && minSize !== null) {
    params.set('minSize', String(minSize));
  }

  return getJson<ChildrenResponse>(`/api/children?${params.toString()}`);
}

export function fetchTree(path: string, levels = 2) {
  const params = new URLSearchParams({ path, levels: String(levels) });
  return getJson<TreeResponse>(`/api/tree?${params.toString()}`);
}
