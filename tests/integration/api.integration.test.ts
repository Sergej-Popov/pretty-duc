import { describe, expect, test } from 'bun:test';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

async function waitFor(path: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (response.ok) {
        return response;
      }
    } catch {
      // retry
    }

    await Bun.sleep(1000);
  }

  throw new Error(`Timed out waiting for ${path}`);
}

describe('docker integration', () => {
  test('health endpoint reports readiness', { timeout: 35000 }, async () => {
    const response = await waitFor('/api/health');
    const json = await response.json();
    expect(json.database).toBe('/database/duc.db');
    expect(typeof json.ducAvailable).toBe('boolean');
  });

  test('children endpoint lists fixture directories', { timeout: 35000 }, async () => {
    const response = await waitFor('/api/children?path=/scan/root&levels=2');
    const json = await response.json();
    expect(Array.isArray(json.children)).toBe(true);
    expect(json.children.some((child: { name: string }) => child.name === 'projects')).toBe(true);
  });

  test('traversal outside root is rejected', { timeout: 35000 }, async () => {
    await waitFor('/api/health');
    const response = await fetch(`${baseUrl}/api/children?path=/etc`);
    expect(response.status).toBe(403);
  });

  test('ui html loads', { timeout: 35000 }, async () => {
    const response = await waitFor('/');
    const html = await response.text();
    expect(html).toContain('Pretty Duc');
  });
});
