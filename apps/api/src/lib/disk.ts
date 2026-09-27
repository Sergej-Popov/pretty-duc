import path from 'node:path';
import fs from 'node:fs/promises';
import type { AppConfig } from '@pretty-duc/config';
import type { Volume } from '@pretty-duc/contracts';
import { readManifest } from './mock-duc';

type DiskConfig = Pick<AppConfig, 'root' | 'mockScanRoot'>;

// Filesystems that hold user data; pseudo filesystems (proc, overlay, tmpfs,
// snap squashfs, ...) mounted under the scan root are ignored.
const STORAGE_FS_TYPES = new Set([
  'ext2', 'ext3', 'ext4', 'xfs', 'btrfs', 'zfs', 'vfat', 'exfat', 'ntfs', 'ntfs3', 'fuseblk', 'f2fs', 'nfs', 'nfs4', 'cifs', 'smb3'
]);

type MountEntry = { mountPoint: string; device: string; fsType: string; source: string };

// Maps a Duc path to the path visible inside this container. In mock mode the
// virtual root is backed by the fixture directory.
export function toFilesystemPath(config: DiskConfig, ducPath: string): string {
  if (!config.mockScanRoot) {
    return ducPath;
  }

  const relative = path.posix.relative(config.root, ducPath);
  return path.resolve(config.mockScanRoot, relative);
}

export function parseMountInfo(content: string): MountEntry[] {
  const entries: MountEntry[] = [];

  for (const line of content.split('\n')) {
    const separator = line.indexOf(' - ');
    if (separator < 0) continue;

    const fields = line.slice(0, separator).split(' ');
    const [fsType, source] = line.slice(separator + 3).split(' ');
    const device = fields[2];
    const mountPoint = fields[4];
    if (!device || !mountPoint || !fsType) continue;

    entries.push({ mountPoint: unescapeMountPath(mountPoint), device, fsType, source: source ?? '' });
  }

  return entries;
}

// Datasets of one ZFS pool share its free space, so they count as one storage.
export function toStorageId(entry: MountEntry): string {
  return entry.fsType === 'zfs' ? `zfs:${entry.source.split('/')[0]}` : `dev:${entry.device}`;
}

function unescapeMountPath(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
}

async function statVolume(config: DiskConfig, ducPath: string, storageId: string): Promise<Volume | null> {
  try {
    const stats = await fs.statfs(toFilesystemPath(config, ducPath));
    const totalBytes = stats.blocks * stats.bsize;

    return {
      path: ducPath,
      storageId,
      totalBytes,
      freeBytes: stats.bavail * stats.bsize,
      usedBytes: Math.max(0, totalBytes - stats.bfree * stats.bsize)
    };
  } catch {
    return null;
  }
}

// Lists the scan root plus every data filesystem mounted below it, with size
// and free space. Empty when the scan root is not mounted into this container.
export async function getVolumes(config: DiskConfig): Promise<Volume[]> {
  if (config.mockScanRoot) {
    const manifest = await readManifest(path.resolve(config.mockScanRoot));
    if (manifest.volumes) return manifest.volumes;
    const root = await statVolume(config, config.root, 'mock');
    return root ? [root] : [];
  }

  let entries: MountEntry[] = [];
  try {
    entries = parseMountInfo(await fs.readFile('/proc/self/mountinfo', 'utf8'));
  } catch {
    entries = [];
  }

  // Later entries shadow earlier ones mounted at the same place.
  const byMountPoint = new Map<string, MountEntry>();
  for (const entry of entries) {
    if (entry.mountPoint === config.root || entry.mountPoint.startsWith(`${config.root}/`)) {
      byMountPoint.set(entry.mountPoint, entry);
    }
  }

  const rootEntry = byMountPoint.get(config.root);
  const candidates = [...byMountPoint.values()].filter((entry) => entry.mountPoint !== config.root && STORAGE_FS_TYPES.has(entry.fsType));
  const volumes = await Promise.all([
    statVolume(config, config.root, rootEntry ? toStorageId(rootEntry) : 'root'),
    ...candidates.map((entry) => statVolume(config, entry.mountPoint, toStorageId(entry)))
  ]);

  return topmostPerStorage(volumes.filter((volume): volume is Volume => volume !== null));
}

// Drops mounts that sit inside a volume on the same storage (ZFS child
// datasets, bind mounts), so each disk or pool is represented by its top.
export function topmostPerStorage(volumes: Volume[]): Volume[] {
  const sorted = [...volumes].sort((left, right) => left.path.length - right.path.length);
  const kept: Volume[] = [];

  for (const volume of sorted) {
    const insideSameStorage = kept.some((top) => top.storageId === volume.storageId && volume.path.startsWith(`${top.path}/`));
    if (!insideSameStorage) {
      kept.push(volume);
    }
  }

  return kept;
}
