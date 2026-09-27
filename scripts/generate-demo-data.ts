import fs from 'node:fs/promises';
import path from 'node:path';
import type { Volume } from '@pretty-duc/contracts';
import type { MockManifest } from '../apps/api/src/lib/mock-duc';
import type { Snapshot } from '../apps/api/src/lib/snapshots';

// Generates a fictional home server for demos and README screenshots: a scan
// root on a 2 TB SSD with a ZFS pool mounted at /tank. Everything is made up
// and deterministic, so screenshots never show a real machine.
//
//   .demo/scan-root/                 empty placeholder files (sizes come from the manifest)
//   .demo/scan-root.manifest.json    file sizes, scan time and volumes for the mock Duc
//   .demo/data/snapshots.json        the previous scan, so "Changes since last scan" has data
//   .demo/data/volume-history.json   30 days of free space, for sparklines and forecasts

const VIRTUAL_ROOT = '/scan/root';
const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;
const TB = 1024 * GB;
const DAY_MS = 24 * 60 * 60 * 1000;

const outDir = path.resolve(process.argv[2] ?? '.demo');
const scanRoot = path.join(outDir, 'scan-root');
const dataDir = path.join(outDir, 'data');
const now = new Date();

let seed = 20260927;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number) => Math.round(min + random() * (max - min));
const pad = (value: number, width = 2) => String(value).padStart(width, '0');

type DemoFile = { path: string; size: number; ageDays: number };
const files: DemoFile[] = [];
const add = (filePath: string, size: number, ageDays = between(1, 400)) => files.push({ path: filePath, size: Math.round(size), ageDays });

// Home directories
const home = 'home/alex';
for (const year of [2023, 2024, 2025]) {
  for (let index = 1; index <= 6; index += 1) add(`${home}/Documents/taxes/${year}/statement-${pad(index)}.pdf`, between(200 * KB, 3 * MB), 365 * (2026 - year));
}
for (const name of ['dishwasher', 'router', 'bike-trainer', 'espresso-machine', 'soundbar', 'lawn-mower']) add(`${home}/Documents/manuals/${name}.pdf`, between(2 * MB, 40 * MB), 700);
for (let index = 1; index <= 40; index += 1) add(`${home}/Documents/notes/note-${pad(index, 3)}.md`, between(2 * KB, 60 * KB));
add(`${home}/Downloads/ubuntu-24.04.1-desktop-amd64.iso`, 6.1 * GB, 320);
add(`${home}/Downloads/debian-12.7.0-amd64-netinst.iso`, 661 * MB, 290);
add(`${home}/Downloads/windows-11-installer.iso`, 5.8 * GB, 540);
add(`${home}/Downloads/blender-4.2-linux-x64.tar.xz`, 342 * MB, 180);
add(`${home}/Downloads/dataset-sample.zip`, 2.4 * GB, 2);
for (let index = 1; index <= 25; index += 1) add(`${home}/Downloads/invoice-${pad(index, 3)}.pdf`, between(80 * KB, 900 * KB));
for (let index = 1; index <= 120; index += 1) add(`${home}/Pictures/Screenshots/screenshot-${pad(index, 3)}.png`, between(300 * KB, 4 * MB));
for (let index = 1; index <= 8; index += 1) add(`${home}/Videos/recordings/talk-rehearsal-${index}.mkv`, between(800 * MB, 4 * GB), between(30, 500));
add(`${home}/Videos/family-visit-2024.mp4`, 9.3 * GB, 620);

for (const [crate, size] of [['debug', 18 * GB], ['release', 6 * GB]] as const) {
  for (let index = 1; index <= 30; index += 1) add(`${home}/projects/rust-raytracer/target/${crate}/deps/lib-${pad(index, 3)}.rlib`, size / 30);
}
for (let index = 1; index <= 60; index += 1) add(`${home}/projects/rust-raytracer/src/module-${pad(index)}.rs`, between(4 * KB, 40 * KB));
for (let epoch = 1; epoch <= 12; epoch += 1) add(`${home}/projects/ml-experiments/checkpoints/epoch-${pad(epoch)}.pt`, 2.1 * GB, epoch <= 8 ? 40 : 0);
add(`${home}/projects/ml-experiments/data/train.parquet`, 14 * GB, 60);
add(`${home}/projects/ml-experiments/data/validation.parquet`, 3.5 * GB, 60);
for (let index = 1; index <= 30; index += 1) add(`${home}/projects/website/node_modules/package-${pad(index)}/index.js`, between(2 * MB, 30 * MB));
for (let index = 1; index <= 20; index += 1) add(`${home}/projects/website/public/images/photo-${pad(index)}.webp`, between(100 * KB, 1.5 * MB));
for (let index = 1; index <= 12; index += 1) add(`${home}/projects/game-jam/assets/audio/track-${pad(index)}.ogg`, between(4 * MB, 12 * MB));
add(`${home}/projects/game-jam/builds/game-jam-linux.zip`, 480 * MB, 200);
for (const [cache, count, max] of [['pip', 40, 120 * MB], ['npm', 60, 40 * MB], ['huggingface', 6, 5 * GB]] as const) {
  for (let index = 1; index <= count; index += 1) add(`${home}/.cache/${cache}/blob-${pad(index, 3)}`, between(1 * MB, max));
}
for (let index = 1; index <= 30; index += 1) add(`home/sam/Documents/school/essay-${pad(index)}.docx`, between(40 * KB, 2 * MB));
for (let index = 1; index <= 80; index += 1) add(`home/sam/Music/playlist/song-${pad(index)}.mp3`, between(3 * MB, 9 * MB));

// Containers, logs and system files
for (const [volume, count, min, max] of [
  ['postgres-data', 40, 200 * MB, 1.2 * GB],
  ['object-storage', 60, 500 * MB, 4 * GB],
  ['metrics-db', 30, 300 * MB, 1.6 * GB],
  ['dashboards', 10, 1 * MB, 20 * MB],
  ['photo-library-db', 12, 50 * MB, 400 * MB]
] as const) {
  for (let index = 1; index <= count; index += 1) add(`var/lib/docker/volumes/${volume}/_data/segment-${pad(index, 3)}`, between(min, max), between(0, 90));
}
for (let layer = 1; layer <= 45; layer += 1) {
  const id = Math.floor(random() * 0xffffffff).toString(16).padStart(8, '0');
  add(`var/lib/docker/overlay2/${id}${pad(layer)}/diff/layer.tar`, between(20 * MB, 1.8 * GB), between(1, 200));
}
for (let index = 1; index <= 30; index += 1) add(`var/log/journal/system@${pad(index, 4)}.journal`, 128 * MB, index);
for (let index = 1; index <= 10; index += 1) add(`var/log/syslog.${index}.gz`, between(5 * MB, 40 * MB), index);
for (let index = 1; index <= 40; index += 1) add(`var/cache/apt/archives/package-${pad(index)}.deb`, between(1 * MB, 90 * MB));
for (const game of ['Starfall Odyssey', 'Circuit Rally 3', 'Hollow Keep', 'Tiny Farm Tales']) {
  for (let index = 1; index <= 8; index += 1) add(`opt/games/steamapps/common/${game}/data-${index}.pak`, between(400 * MB, 9 * GB), between(20, 500));
}
for (let index = 1; index <= 150; index += 1) add(`usr/lib/x86_64-linux-gnu/lib-${pad(index, 3)}.so`, between(200 * KB, 90 * MB), 300);
for (let index = 1; index <= 80; index += 1) add(`usr/share/fonts/font-${pad(index)}.ttf`, between(100 * KB, 20 * MB), 300);

// ZFS pool
const movies = ['The Quiet Orbit (2019)', 'Paper Lanterns (2021)', 'North of Nowhere (2016)', 'Glass Harbor (2022)', 'The Last Signal (2018)', 'Midnight Circuit (2023)', 'Salt and Stone (2015)', 'A Winter Relay (2020)', 'Echoes of Tomorrow (2024)', 'Copper Fields (2017)', 'The Lighthouse Keeper (2014)', 'Neon Rain (2025)'];
movies.forEach((movie, index) => add(`tank/media/movies/${movie}/${movie}.mkv`, between(8 * GB, 62 * GB), index === movies.length - 1 ? 0 : between(60, 1400)));
for (const [show, seasons] of [['Harbor Lights', 3], ['Deep Field', 2], ['The Cartographers', 4], ['Kitchen Wars', 5]] as const) {
  for (let season = 1; season <= seasons; season += 1) {
    for (let episode = 1; episode <= 10; episode += 1) add(`tank/media/tv/${show}/Season ${pad(season)}/S${pad(season)}E${pad(episode)}.mkv`, between(1.2 * GB, 4.5 * GB), between(90, 1200));
  }
}
for (const [artist, albums] of [['The Paper Kites Club', 3], ['Lumen Drive', 2], ['Orchid Static', 4], ['Marble Coast', 2]] as const) {
  for (let album = 1; album <= albums; album += 1) {
    for (let track = 1; track <= 12; track += 1) add(`tank/media/music/${artist}/Album ${album}/${pad(track)} - Track.flac`, between(25 * MB, 60 * MB), 900);
  }
}
for (let year = 2019; year <= 2026; year += 1) {
  for (let month = 1; month <= 12; month += 1) {
    if (year === 2026 && month > 9) break;
    for (let batch = 1; batch <= 3; batch += 1) add(`tank/photos/${year}/${pad(month)}/IMG_${year}${pad(month)}_batch${batch}.zip`, between(300 * MB, 2.5 * GB), (2026 - year) * 365 + (12 - month) * 30);
  }
}
for (let week = 1; week <= 12; week += 1) add(`tank/backups/laptop/laptop-week-${pad(week)}.tar.zst`, between(90 * GB, 130 * GB), (12 - week) * 7);
for (let month = 1; month <= 9; month += 1) add(`tank/backups/phone/phone-2026-${pad(month)}.tar`, between(40 * GB, 70 * GB), (9 - month) * 30);
for (let day = 1; day <= 14; day += 1) add(`tank/backups/database/postgres-${pad(day)}.dump.gz`, between(6 * GB, 9 * GB), 14 - day);
for (const [project, size] of [['thesis-2014', 3 * GB], ['band-recordings', 180 * GB], ['old-website', 900 * MB], ['vm-images', 420 * GB]] as const) {
  add(`tank/archive/${project}.zip`, size, 1500);
}
add('tank/vm/windows-dev.qcow2', 160 * GB, 3);
add('tank/vm/homelab-router.qcow2', 24 * GB, 120);

// The previous scan: what changed since then drives the changes panel.
const previousSizes = new Map(files.map((file) => [file.path, file.size]));
const changed: Array<[string, number | null]> = [
  [`tank/media/movies/${movies[movies.length - 1]}/${movies[movies.length - 1]}.mkv`, null],
  ['tank/backups/database/postgres-14.dump.gz', null],
  ['tank/vm/windows-dev.qcow2', 118 * GB],
  [`${home}/projects/ml-experiments/checkpoints/epoch-09.pt`, null],
  [`${home}/projects/ml-experiments/checkpoints/epoch-10.pt`, null],
  [`${home}/projects/ml-experiments/checkpoints/epoch-11.pt`, null],
  [`${home}/projects/ml-experiments/checkpoints/epoch-12.pt`, null],
  [`${home}/Downloads/dataset-sample.zip`, null],
  ['var/lib/docker/volumes/postgres-data/_data/segment-001', 180 * MB]
];
for (const [filePath, size] of changed) {
  if (size === null) previousSizes.delete(filePath);
  else previousSizes.set(filePath, size);
}
const removed: Array<[string, number]> = [
  [`${home}/Downloads/fedora-workstation-40.iso`, 2.3 * GB],
  [`${home}/.cache/huggingface/blob-legacy-model`, 13.4 * GB],
  ['tank/backups/laptop/laptop-week-00.tar.zst', 104 * GB],
  ['var/lib/docker/overlay2/0badc0de99/diff/layer.tar', 1.6 * GB]
];
for (const [filePath, size] of removed) previousSizes.set(filePath, size);

// Volumes: the root SSD holds everything outside /tank.
const tankUsed = files.filter((file) => file.path.startsWith('tank/')).reduce((sum, file) => sum + file.size, 0);
const rootUsed = files.filter((file) => !file.path.startsWith('tank/')).reduce((sum, file) => sum + file.size, 0) + 38 * GB;
const volumes: Volume[] = [
  { path: VIRTUAL_ROOT, storageId: 'dev:259:2', totalBytes: 2 * TB, freeBytes: 2 * TB - rootUsed, usedBytes: rootUsed },
  { path: `${VIRTUAL_ROOT}/tank`, storageId: 'zfs:tank', totalBytes: 8 * TB, freeBytes: 8 * TB - tankUsed - 60 * GB, usedBytes: tankUsed + 60 * GB }
];

function toSnapshot(sizes: Map<string, number>, takenAt: Date, scanAt: string, withDates: boolean): Snapshot {
  const dirs: Record<string, number> = {};
  const snapshotFiles: Snapshot['files'] = [];
  const ages = new Map(files.map((file) => [file.path, file.ageDays]));

  for (const [filePath, size] of sizes) {
    const parts = filePath.split('/');
    for (let depth = 1; depth < parts.length; depth += 1) {
      const dir = `${VIRTUAL_ROOT}/${parts.slice(0, depth).join('/')}`;
      dirs[dir] = (dirs[dir] ?? 0) + size;
    }
    if (size >= 100 * MB) {
      const age = ages.get(filePath) ?? 30;
      snapshotFiles.push({ path: `${VIRTUAL_ROOT}/${filePath}`, sizeBytes: size, modifiedAt: withDates ? new Date(takenAt.getTime() - age * DAY_MS).toISOString() : null });
    }
  }

  return {
    scanAt,
    takenAt: takenAt.toISOString(),
    dirs: Object.fromEntries(Object.entries(dirs).filter(([, size]) => size >= 100 * MB)),
    files: snapshotFiles
  };
}

function formatScanAt(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 30 days of free space, one sample every six hours. The pool fills steadily
// with backups; the SSD wobbles as caches come and go.
function volumeHistory() {
  const samples = [];
  for (let hoursAgo = 30 * 24; hoursAgo >= 0; hoursAgo -= 6) {
    const days = hoursAgo / 24;
    samples.push({
      at: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString(),
      volumes: volumes.map((volume) => {
        const trend = volume.storageId === 'zfs:tank' ? days * 22 * GB : days * 1.5 * GB;
        const noise = Math.sin(hoursAgo / 17) * (volume.storageId === 'zfs:tank' ? 6 * GB : 9 * GB);
        return { path: volume.path, totalBytes: volume.totalBytes, freeBytes: Math.round(Math.min(volume.totalBytes, volume.freeBytes + trend + noise)) };
      })
    });
  }
  return { samples };
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(dataDir, { recursive: true });

for (const file of files) {
  const filePath = path.join(scanRoot, ...file.path.split('/'));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, '');
  const modifiedAt = new Date(now.getTime() - file.ageDays * DAY_MS);
  await fs.utimes(filePath, modifiedAt, modifiedAt);
}

const lastScan = new Date(now.getTime() - 3 * 60 * 60 * 1000);
const manifest: MockManifest = {
  version: 'duc demo 1.4.5',
  lastScanAt: formatScanAt(lastScan),
  fileSizes: Object.fromEntries(files.map((file) => [file.path, file.size])),
  volumes
};
await fs.writeFile(`${scanRoot}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

// Only the previous scan is written; the API snapshots the current one on startup.
const previousScan = new Date(lastScan.getTime() - DAY_MS);
await fs.writeFile(path.join(dataDir, 'snapshots.json'), JSON.stringify({ snapshots: [toSnapshot(previousSizes, previousScan, formatScanAt(previousScan), false)] }));
await fs.writeFile(path.join(dataDir, 'volume-history.json'), JSON.stringify(volumeHistory()));

const total = files.reduce((sum, file) => sum + file.size, 0);
console.log(`Demo data: ${files.length} files, ${(total / TB).toFixed(2)} TB, written to ${outDir}`);
