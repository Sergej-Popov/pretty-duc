import type { ChangesResponse, ChildrenResponse, ConfigResponse, HealthResponse, InfoResponse, LargeFilesResponse, SortMode, TreeResponse, UserConfig, VolumeHistoryResponse } from '@pretty-duc/contracts';

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

export function fetchChildren(path: string, levels: number, sort: SortMode, minSize?: number | null, apparent = true) {
  const params = new URLSearchParams({
    path,
    levels: String(levels),
    sort,
    apparent: String(apparent)
  });

  if (minSize !== undefined && minSize !== null) {
    params.set('minSize', String(minSize));
  }

  return getJson<ChildrenResponse>(`/api/children?${params.toString()}`);
}

export function fetchVolumeHistory() {
  return getJson<VolumeHistoryResponse>('/api/volumes/history');
}

export function fetchChanges(path: string) {
  const params = new URLSearchParams({ path });
  return getJson<ChangesResponse>(`/api/changes?${params.toString()}`);
}

export function fetchLargeFiles(path: string, olderThanDays: number) {
  const params = new URLSearchParams({ path, olderThanDays: String(olderThanDays), limit: '50' });
  return getJson<LargeFilesResponse>(`/api/large-files?${params.toString()}`);
}

export function fetchTree(path: string) {
  const params = new URLSearchParams({ path });
  return getJson<TreeResponse>(`/api/tree?${params.toString()}`);
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Request failed: ${response.status}`);
  }

  return data as T;
}

export function fetchConfig() {
  return getJson<ConfigResponse>('/api/config');
}

export function updateConfig(config: UserConfig) {
  return putJson<{ ok: boolean }>('/api/config', config);
}

export function resetConfig() {
  return fetch('/api/config/reset', { method: 'POST' });
}

export function triggerIndex(path?: string) {
  return fetch('/api/index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(path ? { path } : {})
  });
}
