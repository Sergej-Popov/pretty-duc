import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { createMockExecutor } from './mock-duc';

const fixtureRoot = path.resolve(import.meta.dir, '../../../../tests/fixtures/mock-scan-root');

describe('mock duc executor', () => {
  const executor = createMockExecutor({
    database: path.resolve(import.meta.dir, '../../../../tests/fixtures/mock/duc.db'),
    fixtureRoot,
    maxConcurrency: 2,
    virtualRoot: '/scan/root'
  });

  test('returns duc-like ls output', async () => {
    const result = await executor(['ls', '-b', '-d', path.resolve(import.meta.dir, '../../../../tests/fixtures/mock/duc.db'), '-F', '--', '/scan/root/team-space'], 5000);
    expect(result.stdout).toContain('alpha/');
    expect(result.stdout).toContain('beta/');
  });

  test('returns duc-like json output', async () => {
    const result = await executor(['json', '-d', path.resolve(import.meta.dir, '../../../../tests/fixtures/mock/duc.db'), '-d', '2', '--', '/scan/root/media'], 5000);
    const json = JSON.parse(result.stdout) as { children?: Array<{ name: string }> };
    expect(Array.isArray(json.children)).toBe(true);
    expect(json.children?.some((child) => child.name === 'exports')).toBe(true);
  });
});
