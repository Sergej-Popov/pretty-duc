import type { ChildrenResponse, ConfigResponse, HealthResponse, InfoResponse, SortMode, TreeResponse, UserConfig } from '@pretty-duc/contracts';

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
