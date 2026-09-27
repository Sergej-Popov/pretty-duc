import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Box, Button, Group, Indicator, Loader, Paper, Popover, Progress, SegmentedControl, Stack, Text, UnstyledButton, useMantineTheme } from '@mantine/core';
import type { ChangeEntry, ChangesResponse, LargeFilesResponse, SnapshotInfo, VolumeHistory } from '@pretty-duc/contracts';
import { formatBytes, getSpaceLevel, type SpaceLevel } from '@pretty-duc/ui-model';
import { fetchChanges, fetchLargeFiles } from './api';

const LEVEL_COLORS: Record<SpaceLevel, string> = { ok: 'teal', warning: 'orange', critical: 'red' };

export function displayPath(rootPath: string, fullPath: string) {
  if (fullPath === rootPath) return '/';
  return fullPath.startsWith(`${rootPath}/`) ? fullPath.slice(rootPath.length) : fullPath;
}

function parentPath(fullPath: string) {
  return fullPath.slice(0, fullPath.lastIndexOf('/')) || '/';
}

function percentFree(volume: { freeBytes: number; totalBytes: number }) {
  return volume.totalBytes > 0 ? (volume.freeBytes / volume.totalBytes) * 100 : 0;
}

function formatDate(value: string | null) {
  if (!value) return 'unknown';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatSnapshot(snapshot: SnapshotInfo) {
  return formatDate(snapshot.scanAt ?? snapshot.takenAt);
}

function formatSigned(bytes: number) {
  return `${bytes >= 0 ? '+' : '−'}${formatBytes(Math.abs(bytes))}`;
}

function describeForecast(volume: VolumeHistory): { text: string; color?: string } {
  const { forecast } = volume;
  if (!forecast) {
    return { text: volume.samples.length < 2 ? 'Collecting history…' : 'Trend needs at least 12 h of history' };
  }

  if (forecast.daysUntilFull !== null) {
    const days = forecast.daysUntilFull;
    const when = days > 365 ? 'over a year' : days < 1 ? 'less than a day' : `~${Math.round(days)} days`;
    return {
      text: `Full in ${when} (${formatBytes(-forecast.freeBytesPerDay)}/day)`,
      color: days < 14 ? 'red' : days < 60 ? 'orange' : undefined
    };
  }

  return { text: forecast.freeBytesPerDay > 0 ? `Freeing ${formatBytes(forecast.freeBytesPerDay)}/day` : 'Free space stable' };
}

const DISMISSED_WARNINGS_KEY = 'dismissedSpaceWarnings';
const ALERT_COLORS: Record<SpaceLevel, string> = { ok: 'teal', warning: 'yellow', critical: 'red' };

function readDismissedWarnings(): Record<string, SpaceLevel> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_WARNINGS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export type SpaceWarning = { volume: VolumeHistory; level: Exclude<SpaceLevel, 'ok'>; dismissed: boolean };

// Low-space warnings with per-volume dismissal. A dismissed warning comes back
// when its volume gets worse, or when it recovers and later runs low again.
export function useSpaceWarnings(volumes: VolumeHistory[]) {
  const [dismissed, setDismissed] = useState<Record<string, SpaceLevel>>(readDismissedWarnings);

  useEffect(() => {
    const recovered = volumes.filter((volume) => dismissed[volume.path] && getSpaceLevel(volume.freeBytes, volume.totalBytes) === 'ok');
    if (!recovered.length) return;
    setDismissed((current) => {
      const next = { ...current };
      recovered.forEach((volume) => delete next[volume.path]);
      return next;
    });
  }, [volumes]);

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_WARNINGS_KEY, JSON.stringify(dismissed));
    } catch {
      // Dismissal is a convenience; without storage it lasts until reload.
    }
  }, [dismissed]);

  const warnings: SpaceWarning[] = volumes.flatMap((volume) => {
    const level = getSpaceLevel(volume.freeBytes, volume.totalBytes);
    if (level === 'ok') return [];
    const hidden = dismissed[volume.path] === level || (level === 'warning' && dismissed[volume.path] === 'critical');
    return [{ volume, level, dismissed: hidden }];
  });

  return {
    warnings,
    dismiss: (warning: SpaceWarning) => setDismissed((current) => ({ ...current, [warning.volume.path]: warning.level })),
    restore: (warning: SpaceWarning) => setDismissed((current) => {
      const next = { ...current };
      delete next[warning.volume.path];
      return next;
    })
  };
}

function warningText(rootPath: string, warning: SpaceWarning) {
  return `${displayPath(rootPath, warning.volume.path)}: ${formatBytes(warning.volume.freeBytes)} free of ${formatBytes(warning.volume.totalBytes)} (${percentFree(warning.volume).toFixed(1)}%)`;
}

export function LowSpaceAlerts({ warnings, rootPath, onNavigate, onDismiss }: {
  warnings: SpaceWarning[];
  rootPath: string;
  onNavigate: (path: string) => void;
  onDismiss: (warning: SpaceWarning) => void;
}) {
  const visible = warnings.filter((warning) => !warning.dismissed);
  if (!visible.length) return null;

  return (
    <Stack className="low-space-alerts" gap="xs">
      {visible.map((warning) => (
        <Alert
          key={warning.volume.path}
          className="low-space-alert"
          color={ALERT_COLORS[warning.level]}
          variant="light"
          radius="sm"
          title={warning.level === 'critical' ? 'Disk almost full' : 'Low disk space'}
          withCloseButton
          closeButtonLabel="Dismiss warning"
          onClose={() => onDismiss(warning)}
        >
          <UnstyledButton onClick={() => onNavigate(warning.volume.path)}>
            <Text size="sm">{warningText(rootPath, warning)}</Text>
          </UnstyledButton>
        </Alert>
      ))}
    </Stack>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// Header bell: count of all current warnings, and a panel listing every one,
// including dismissed ones, which can be shown again from here.
export function WarningsMenu({ warnings, rootPath, onNavigate, onDismiss, onRestore }: {
  warnings: SpaceWarning[];
  rootPath: string;
  onNavigate: (path: string) => void;
  onDismiss: (warning: SpaceWarning) => void;
  onRestore: (warning: SpaceWarning) => void;
}) {
  const critical = warnings.some((warning) => warning.level === 'critical');

  return (
    <Popover width={380} position="bottom-end" shadow="md" withArrow>
      <Popover.Target>
        <Indicator label={warnings.length} size={16} color={critical ? 'red' : 'yellow'} disabled={!warnings.length} offset={4}>
          <ActionIcon className="warnings-button" variant="default" radius="sm" size="lg" aria-label={`Disk warnings (${warnings.length})`}>
            <BellIcon />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">Disk warnings</Text>
          {!warnings.length ? <Text size="sm" c="dimmed">All disks have enough free space.</Text> : null}
          {warnings.map((warning) => (
            <Alert
              key={warning.volume.path}
              color={ALERT_COLORS[warning.level]}
              variant="light"
              radius="sm"
              p="xs"
              style={{ opacity: warning.dismissed ? 0.6 : 1 }}
            >
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <UnstyledButton style={{ minWidth: 0 }} onClick={() => onNavigate(warning.volume.path)}>
                  <Text size="sm">{warningText(rootPath, warning)}</Text>
                </UnstyledButton>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => (warning.dismissed ? onRestore(warning) : onDismiss(warning))}
                >
                  {warning.dismissed ? 'Show' : 'Dismiss'}
                </Button>
              </Group>
            </Alert>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const width = 120;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => `${((index / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((value - min) / range) * (height - 4)).toFixed(1)}`)
    .join(' ');

  return (
    <svg className="volume-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Free space over time">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export function VolumesPanel({ volumes, rootPath, onNavigate }: { volumes: VolumeHistory[]; rootPath: string; onNavigate: (path: string) => void }) {
  const theme = useMantineTheme();
  if (!volumes.length) return null;

  return (
    <Paper className="volumes-panel" withBorder p="md" radius="sm">
      <Stack gap="md">
        <Text size="xs" tt="uppercase" fw={700} c="dimmed">Disks &amp; pools</Text>
        {volumes.map((volume) => {
          const level = getSpaceLevel(volume.freeBytes, volume.totalBytes);
          const color = LEVEL_COLORS[level];
          const forecast = describeForecast(volume);
          const usedPercent = 100 - percentFree(volume);

          return (
            <Stack key={volume.path} className="volume-row" gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <UnstyledButton onClick={() => onNavigate(volume.path)}>
                  <Text size="sm" fw={700}>{displayPath(rootPath, volume.path)}</Text>
                </UnstyledButton>
                <Text size="sm" c={level === 'ok' ? undefined : color} fw={level === 'ok' ? 400 : 700}>
                  {formatBytes(volume.freeBytes)} free of {formatBytes(volume.totalBytes)}
                </Text>
              </Group>
              <Progress value={usedPercent} color={color} radius="xs" size="sm" aria-label={`${usedPercent.toFixed(0)}% used`} />
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="xs" c={forecast.color ?? 'dimmed'}>{forecast.text}</Text>
                <Sparkline values={volume.samples.map((sample) => sample.freeBytes)} color={theme.colors[color]?.[6] ?? color} />
              </Group>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}

function ChangeList({ title, entries, rootPath, onNavigate, color }: { title: string; entries: ChangeEntry[]; rootPath: string; onNavigate: (path: string) => void; color: string }) {
  if (!entries.length) return null;

  return (
    <Stack gap={6}>
      <Text size="xs" fw={700} c="dimmed">{title}</Text>
      {entries.map((entry) => (
        <Group key={entry.path} justify="space-between" wrap="nowrap" gap="sm">
          <UnstyledButton style={{ minWidth: 0 }} onClick={() => onNavigate(entry.type === 'file' ? parentPath(entry.path) : entry.path)}>
            <Text size="sm" truncate="end" title={entry.path}>
              {displayPath(rootPath, entry.path)}{entry.type === 'directory' ? '/' : ''}
            </Text>
          </UnstyledButton>
          <Group gap={6} wrap="nowrap">
            {entry.beforeBytes === null ? <Badge size="xs" variant="light" color={color}>new</Badge> : null}
            {entry.afterBytes === null ? <Badge size="xs" variant="light" color={color}>gone</Badge> : null}
            <Text size="sm" fw={700} c={color} style={{ whiteSpace: 'nowrap' }}>{formatSigned(entry.deltaBytes)}</Text>
          </Group>
        </Group>
      ))}
    </Stack>
  );
}

export function ChangesPanel({ path, rootPath, onNavigate }: { path: string; rootPath: string; onNavigate: (path: string) => void }) {
  const [changes, setChanges] = useState<ChangesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setError(null);
    fetchChanges(path)
      .then((result) => { if (!ignore) setChanges(result); })
      .catch((loadError) => { if (!ignore) setError(loadError instanceof Error ? loadError.message : 'Failed to load changes'); });
    return () => { ignore = true; };
  }, [path]);

  let body;
  if (error) {
    body = <Text size="sm" c="red">{error}</Text>;
  } else if (!changes) {
    body = <Loader size="sm" color="dark" />;
  } else if (!changes.to) {
    body = <Text size="sm" c="dimmed">{changes.snapshotRunning ? 'Taking the first snapshot…' : 'No snapshot yet. One is taken shortly after start-up and after every duc scan.'}</Text>;
  } else if (!changes.from) {
    body = <Text size="sm" c="dimmed">First snapshot taken {formatSnapshot(changes.to)}. Changes appear after the next duc scan.</Text>;
  } else if (!changes.grown.length && !changes.shrunk.length) {
    body = <Text size="sm" c="dimmed">No changes of {formatBytes(changes.minSizeBytes)} or more here.</Text>;
  } else {
    body = (
      <Stack gap="md">
        <ChangeList title="Grew" entries={changes.grown} rootPath={rootPath} onNavigate={onNavigate} color="orange" />
        <ChangeList title="Shrank" entries={changes.shrunk} rootPath={rootPath} onNavigate={onNavigate} color="teal" />
      </Stack>
    );
  }

  return (
    <Paper className="changes-panel" withBorder p="md" radius="sm" h="100%">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">Changes since last scan</Text>
          {changes?.from && changes.to ? <Text size="xs" c="dimmed">{formatSnapshot(changes.from)} → {formatSnapshot(changes.to)}</Text> : null}
        </Group>
        {body}
      </Stack>
    </Paper>
  );
}

const AGE_OPTIONS = [
  { label: 'Any age', value: '0' },
  { label: '> 3 months', value: '90' },
  { label: '> 6 months', value: '180' },
  { label: '> 1 year', value: '365' }
];

export function LargeFilesPanel({ path, rootPath, onNavigate }: { path: string; rootPath: string; onNavigate: (path: string) => void }) {
  const [olderThanDays, setOlderThanDays] = useState(() => {
    try {
      return localStorage.getItem('largeFilesOlderThanDays') ?? '0';
    } catch {
      return '0';
    }
  });
  const [result, setResult] = useState<LargeFilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('largeFilesOlderThanDays', olderThanDays);
    } catch {
      // Preference is optional.
    }
  }, [olderThanDays]);

  useEffect(() => {
    let ignore = false;
    setError(null);
    fetchLargeFiles(path, Number(olderThanDays))
      .then((response) => { if (!ignore) setResult(response); })
      .catch((loadError) => { if (!ignore) setError(loadError instanceof Error ? loadError.message : 'Failed to load large files'); });
    return () => { ignore = true; };
  }, [path, olderThanDays]);

  let body;
  if (error) {
    body = <Text size="sm" c="red">{error}</Text>;
  } else if (!result) {
    body = <Loader size="sm" color="dark" />;
  } else if (!result.snapshot) {
    body = <Text size="sm" c="dimmed">{result.snapshotRunning ? 'Taking the first snapshot…' : 'No snapshot yet.'}</Text>;
  } else if (!result.files.length) {
    body = <Text size="sm" c="dimmed">No files of {formatBytes(result.minSizeBytes)} or more{olderThanDays !== '0' ? ' that old' : ''} here.</Text>;
  } else {
    const total = result.files.reduce((sum, file) => sum + file.sizeBytes, 0);
    body = (
      <Stack gap={6}>
        <Text size="xs" c="dimmed">{result.files.length} files, {formatBytes(total)} in total</Text>
        <Box className="large-files-list" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <Stack gap={6}>
            {result.files.map((file) => (
              <Group key={file.path} justify="space-between" wrap="nowrap" gap="sm">
                <UnstyledButton style={{ minWidth: 0 }} onClick={() => onNavigate(parentPath(file.path))}>
                  <Text size="sm" truncate="end" title={file.path}>{file.path.slice(file.path.lastIndexOf('/') + 1)}</Text>
                  <Text size="xs" c="dimmed" truncate="end">{displayPath(rootPath, parentPath(file.path))}</Text>
                </UnstyledButton>
                <Stack gap={0} align="flex-end">
                  <Text size="sm" fw={700} style={{ whiteSpace: 'nowrap' }}>{formatBytes(file.sizeBytes)}</Text>
                  {file.modifiedAt
                    ? <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{formatDate(file.modifiedAt)}</Text>
                    : <Badge size="xs" variant="light" color="gray" title="In the Duc index but missing on disk; it will drop off after the next scan">not on disk</Badge>}
                </Stack>
              </Group>
            ))}
          </Stack>
        </Box>
      </Stack>
    );
  }

  return (
    <Paper className="large-files-panel" withBorder p="md" radius="sm" h="100%">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">Largest files</Text>
          <SegmentedControl size="xs" data={AGE_OPTIONS} value={olderThanDays} onChange={setOlderThanDays} />
        </Group>
        {body}
      </Stack>
    </Paper>
  );
}
