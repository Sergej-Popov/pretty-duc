import { describe, expect, test } from 'bun:test';
import { computeChanges, findLargeFiles, flattenTree, type Snapshot } from './snapshots';

const GB = 1024 ** 3;
const snapshot = (dirs: Record<string, number>, files: Snapshot['files'] = []): Snapshot => ({ scanAt: null, takenAt: '2026-09-01T00:00:00Z', dirs, files });

describe('snapshots', () => {
  test('flattens a tree into directory sizes and files', () => {
    const flat = flattenTree([{
      name: 'a', path: '/r/a', sizeBytes: 3, humanSize: '', type: 'directory', percentOfParent: 0, hasChildren: true,
      children: [{ name: 'f', path: '/r/a/f', sizeBytes: 3, humanSize: '', type: 'file', percentOfParent: 0, hasChildren: false }]
    }]);

    expect(flat.dirs).toEqual({ '/r/a': 3 });
    expect(flat.files).toEqual([{ path: '/r/a/f', sizeBytes: 3 }]);
  });

  test('reports where the change happened, not every ancestor', () => {
    const before = snapshot({ '/r/media': 100 * GB, '/r/media/films': 80 * GB, '/r/media/shows': 20 * GB, '/r/var': 10 * GB });
    const after = snapshot(
      { '/r/media': 130 * GB, '/r/media/films': 110 * GB, '/r/media/shows': 20 * GB, '/r/var': 4 * GB },
      [{ path: '/r/media/films/new.mkv', sizeBytes: 30 * GB, modifiedAt: null }]
    );

    const changes = computeChanges(before, after, '/r');
    expect(changes.grown.map((entry) => entry.path)).toEqual(['/r/media/films/new.mkv']);
    expect(changes.grown[0]!.beforeBytes).toBeNull();
    expect(changes.shrunk.map((entry) => [entry.path, entry.deltaBytes])).toEqual([['/r/var', -6 * GB]]);
  });

  test('keeps a directory whose change is spread across children', () => {
    const before = snapshot({ '/r/a': 10 * GB, '/r/a/x': 5 * GB, '/r/a/y': 5 * GB });
    const after = snapshot({ '/r/a': 20 * GB, '/r/a/x': 10 * GB, '/r/a/y': 10 * GB });

    expect(computeChanges(before, after, '/r').grown.map((entry) => entry.path)).toContain('/r/a');
  });

  test('filters large files by path and age', () => {
    const files = [
      { path: '/r/a/old.iso', sizeBytes: 5 * GB, modifiedAt: '2025-01-01T00:00:00Z' },
      { path: '/r/a/new.mkv', sizeBytes: 9 * GB, modifiedAt: '2026-08-30T00:00:00Z' },
      { path: '/r/b/other.bin', sizeBytes: 7 * GB, modifiedAt: '2024-01-01T00:00:00Z' }
    ];
    const snap = snapshot({}, files);
    const now = new Date('2026-09-01T00:00:00Z');

    expect(findLargeFiles(snap, '/r', { olderThanDays: 0, limit: 10, now }).map((file) => file.path)).toEqual(['/r/a/new.mkv', '/r/b/other.bin', '/r/a/old.iso']);
    expect(findLargeFiles(snap, '/r/a', { olderThanDays: 180, limit: 10, now }).map((file) => file.path)).toEqual(['/r/a/old.iso']);
  });
});
