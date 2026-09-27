import { describe, expect, test } from 'bun:test';
import { buildBreadcrumbs, filterNodes, formatBytes, getSpaceLevel, largestItems } from './index';

const nodes = [
  { name: 'var', path: '/scan/root/var', sizeBytes: 4000, humanSize: '4 KB', type: 'directory', percentOfParent: 50, hasChildren: true },
  { name: 'home', path: '/scan/root/home', sizeBytes: 8000, humanSize: '8 KB', type: 'directory', percentOfParent: 50, hasChildren: true }
] as const;

describe('ui model', () => {
  test('formats bytes', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
  });

  test('builds breadcrumbs', () => {
    expect(buildBreadcrumbs('/scan/root/var')).toEqual([
      { label: '/', path: '/' },
      { label: 'scan', path: '/scan' },
      { label: 'root', path: '/scan/root' },
      { label: 'var', path: '/scan/root/var' }
    ]);
  });

  test('filters nodes', () => {
    expect(filterNodes(nodes as never, 'ho')).toHaveLength(1);
    expect(largestItems(nodes as never, 1)[0]?.name).toBe('home');
  });
});

describe('getSpaceLevel', () => {
  test('flags low free space', () => {
    expect(getSpaceLevel(50, 100)).toBe('ok');
    expect(getSpaceLevel(10, 100)).toBe('warning');
    expect(getSpaceLevel(4, 100)).toBe('critical');
    expect(getSpaceLevel(0, 0)).toBe('ok');
  });
});
