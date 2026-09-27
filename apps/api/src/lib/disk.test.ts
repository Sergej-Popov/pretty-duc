import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { getVolumes, parseMountInfo, toFilesystemPath, toStorageId, topmostPerStorage } from './disk';

const fixtureRoot = path.resolve(import.meta.dir, '../../../../tests/fixtures/mock-scan-root');

describe('disk usage', () => {
  test('maps duc paths onto the mock fixture root', () => {
    expect(toFilesystemPath({ root: '/scan/root', mockScanRoot: null }, '/scan/root/var')).toBe('/scan/root/var');
    expect(toFilesystemPath({ root: '/scan/root', mockScanRoot: fixtureRoot }, '/scan/root/team-space')).toBe(path.join(fixtureRoot, 'team-space'));
  });

  test('parses mountinfo and groups zfs datasets by pool', () => {
    const entries = parseMountInfo([
      '1043 1024 8:2 / /scan/root ro,relatime master:1 - ext4 /dev/sda2 rw',
      '1050 1043 0:52 / /scan/root/tank ro master:30 - zfs tank rw,xattr',
      '1051 1050 0:53 / /scan/root/tank/media ro master:31 - zfs tank/media rw,xattr',
      '1060 1043 259:1 / /scan/root/mnt/my\\040disk ro master:40 - ext4 /dev/nvme0n1p1 rw'
    ].join('\n'));

    expect(entries.map((entry) => entry.mountPoint)).toEqual(['/scan/root', '/scan/root/tank', '/scan/root/tank/media', '/scan/root/mnt/my disk']);
    expect(toStorageId(entries[1]!)).toBe('zfs:tank');
    expect(toStorageId(entries[2]!)).toBe('zfs:tank');
    expect(toStorageId(entries[3]!)).toBe('dev:259:1');
  });

  test('keeps only the top volume of each storage', () => {
    const volume = (path: string, storageId: string) => ({ path, storageId, totalBytes: 1, freeBytes: 1, usedBytes: 0 });
    const kept = topmostPerStorage([
      volume('/scan/root/tank/media', 'zfs:tank'),
      volume('/scan/root', 'dev:8:33'),
      volume('/scan/root/var/lib/docker/x/database', 'dev:8:33'),
      volume('/scan/root/tank', 'zfs:tank'),
      volume('/scan/root/mnt/nvme0n1', 'dev:259:0')
    ]);

    expect(kept.map((entry) => entry.path)).toEqual(['/scan/root', '/scan/root/tank', '/scan/root/mnt/nvme0n1']);
  });

  test('reports the scan root as a volume in mock mode', async () => {
    const volumes = await getVolumes({ root: '/scan/root', mockScanRoot: fixtureRoot });

    expect(volumes).toHaveLength(1);
    expect(volumes[0]!.path).toBe('/scan/root');
    expect(volumes[0]!.totalBytes).toBeGreaterThan(0);
    expect(volumes[0]!.freeBytes).toBeLessThanOrEqual(volumes[0]!.totalBytes);
  });
});
