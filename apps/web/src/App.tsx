import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Breadcrumbs,
  Burger,
  Button,
  Code,
  CopyButton,
  Divider,
  Flex,
  Grid,
  Group,
  Loader,
  Menu,
  Paper,
  Progress,
  ScrollArea,
  Select,
  Slider,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  useMantineColorScheme
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { ChildrenResponse, ExplorerNode, SortMode } from '@pretty-duc/contracts';
import { buildBreadcrumbs, filterNodes, formatBytes, toChartTree } from '@pretty-duc/ui-model';
import { fetchChildren, fetchHealth, fetchInfo } from './api';
import { ExplorerChart, type ChartViewMode, type SunburstHighlightMode } from './ExplorerChart';

type ViewMode = ChartViewMode;
type TableSortMode = 'sizeDesc' | 'sizeAsc' | 'nameAsc' | 'nameDesc' | 'typeAsc' | 'typeDesc';

export function App() {
  const [mobileOpened, { toggle }] = useDisclosure();
  const [path, setPath] = useState(getInitialPath);
  const [sort, setSort] = useState<TableSortMode>(getInitialSort);
  const [view, setView] = useState<ViewMode>(getInitialView);
  const [depth, setDepth] = useState(getInitialDepth);
  const [query, setQuery] = useState(getInitialQuery);
  const [data, setData] = useState<ChildrenResponse | null>(null);
  const [health, setHealth] = useState<string>('Checking service');
  const [info, setInfo] = useState<string>('Loading Duc metadata');
  const [rootPath, setRootPath] = useState('/scan/root');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hiddenPaths, setHiddenPaths] = useState<string[]>([]);
  const [showHiddenItems, setShowHiddenItems] = useState(false);
  const [sunburstRootPath, setSunburstRootPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const [useDecal, setUseDecal] = useState(false);
  const [sunburstHighlightMode, setSunburstHighlightMode] = useState<SunburstHighlightMode>('ancestor');
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('path', path);
    params.set('view', view);
    params.set('sort', sort);
    params.set('depth', String(depth));
    if (query) {
      params.set('query', query);
    } else {
      params.delete('query');
    }
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [depth, path, view, sort, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [depth, query, sort, path]);

  useEffect(() => {
    setSunburstRootPath(null);
  }, [path]);

  useEffect(() => {
    fetchHealth()
      .then((result) => {
        setHealth(result.ok ? 'Connected' : 'Degraded');
        setRootPath(result.root);
      })
      .catch(() => setHealth('Health check failed'));

    fetchInfo()
      .then((result) => setInfo(result.raw.split('\n')[0] ?? 'Duc metadata loaded'))
      .catch(() => setInfo('Duc info unavailable'));
  }, []);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const children = await fetchChildren(path, depth, toApiSort(sort));

        if (ignore) return;
        setData(children);
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load directory');
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [depth, path, sort]);

  const visibleNodes = useMemo(() => {
    const filtered = filterNodes(data?.children ?? [], query);
    const withVisibility = showHiddenItems ? filtered : filtered.filter((node) => !hiddenPaths.includes(node.path));
    return sortVisibleNodes(withVisibility, sort);
  }, [data?.children, query, sort, hiddenPaths, showHiddenItems]);
  const highlighted = visibleNodes[activeIndex] ?? null;
  const breadcrumbs = useMemo(() => buildBreadcrumbs(path), [path]);
  const directoryCount = visibleNodes.filter((node) => node.type === 'directory').length;
  const fileCount = visibleNodes.length - directoryCount;
  const largestNode = sortVisibleNodes(visibleNodes, 'sizeDesc')[0] ?? null;
  const currentDirectoryShare = data?.totalSizeBytes
    ? Number(((visibleNodes.reduce((sum, node) => sum + node.sizeBytes, 0) / data.totalSizeBytes) * 100).toFixed(2))
    : 0;
  const chartSourceNodes = useMemo(
    () => showHiddenItems ? visibleNodes : filterHiddenTree(visibleNodes, hiddenPaths),
    [hiddenPaths, showHiddenItems, visibleNodes]
  );
  const sunburstRootNode = useMemo(() => findNodeByPath(chartSourceNodes, sunburstRootPath), [chartSourceNodes, sunburstRootPath]);
  const chartNodes = useMemo(() => {
    if (view === 'sunburst' && sunburstRootNode) {
      return toChartTree([sunburstRootNode]).map((node) => markHiddenChartNodes(node, hiddenPaths));
    }

    return toChartTree(chartSourceNodes).map((node) => markHiddenChartNodes(node, hiddenPaths));
  }, [chartSourceNodes, hiddenPaths, sunburstRootNode, view]);

  useEffect(() => {
    if (sunburstRootPath && !findNodeByPath(chartSourceNodes, sunburstRootPath)) {
      setSunburstRootPath(null);
    }
  }, [chartSourceNodes, sunburstRootPath]);

  useEffect(() => {
    if (!visibleNodes.length) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((current) => Math.min(current, visibleNodes.length - 1));
  }, [visibleNodes]);

  function navigate(nextPath: string) {
    setPath(nextPath);
    setActiveIndex(0);
  }

  function navigateUp() {
    const crumbs = buildBreadcrumbs(path);
    if (crumbs.length > 1) {
      navigate(crumbs[crumbs.length - 2]!.path);
    }
  }

  function handleKeyNav(event: KeyboardEvent<HTMLDivElement>) {
    if (!visibleNodes.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, visibleNodes.length - 1));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }

    if (event.key === 'Enter' && highlighted?.type === 'directory') {
      navigate(highlighted.path);
    }

    if (event.key === 'Backspace') {
      navigateUp();
    }
  }

  function selectByPath(selectedPath: string) {
    const nextIndex = visibleNodes.findIndex((node) => node.path === selectedPath);
    if (nextIndex >= 0) {
      setActiveIndex(nextIndex);
    }

    const selectedNode = findNodeByPath(visibleNodes, selectedPath);

    if (selectedNode?.type === 'directory') {
      navigate(selectedPath);
      return;
    }

    if (view === 'sunburst' && selectedNode?.children?.length) {
      setSunburstRootPath(selectedPath);
    }
  }

  function toggleHiddenPath(targetPath: string) {
    setHiddenPaths((current) => current.includes(targetPath) ? current.filter((pathItem) => pathItem !== targetPath) : [...current, targetPath]);
    setContextMenu(null);
  }

  function openContextMenu(targetPath: string, position: { x: number; y: number }) {
    setContextMenu({ path: targetPath, x: position.x, y: position.y });
  }

  function moveSunburstUp() {
    setSunburstRootPath((current) => {
      if (!current) {
        return current;
      }

      return getSunburstParentPath(path, current);
    });
  }

  function toggleSort(column: 'name' | 'size' | 'type') {
    setSort((current) => nextTableSort(current, column));
  }

  return (
    <AppShell
      padding="lg"
      header={{ height: 72 }}
      navbar={{ width: 340, breakpoint: 'md', collapsed: { mobile: !mobileOpened, desktop: false } }}
    >
      <AppShell.Header>
        <Group justify="space-between" h="100%" px="lg">
          <Group gap="md">
            <Burger opened={mobileOpened} onClick={toggle} hiddenFrom="md" />
            <ThemeIcon size={38} radius="sm" variant="light" color="dark">
              PD
            </ThemeIcon>
            <Box>
              <Group gap="sm" align="center">
                <Title order={2}>Pretty Duc</Title>
                <Badge variant="light" color={health === 'Connected' ? 'green' : 'orange'}>
                  {health}
                </Badge>
              </Group>
            </Box>
          </Group>

          <Group gap="xs">
            <Badge variant="dot" color="gray" visibleFrom="sm">{info}</Badge>
            <Tooltip label="Toggle color scheme">
              <ActionIcon
                variant="default"
                radius="sm"
                size="lg"
                onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
              >
                {colorScheme === 'dark' ? 'L' : 'D'}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Stack gap="md">
            <Paper withBorder p="md" radius="sm">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <Box>
                    <Text size="xs" tt="uppercase" fw={700} c="dimmed">Active scope</Text>
                    <Text fw={700} mt={4}>Current path</Text>
                  </Box>
                </Group>
                <Code block>{path}</Code>
                <Group grow>
                  <Button variant="filled" radius="sm" onClick={navigateUp}>Up</Button>
                  <Button variant="default" radius="sm" onClick={() => navigate(rootPath)}>Root</Button>
                </Group>
                <Button variant="subtle" radius="sm" onClick={() => navigate(path)}>Refresh listing</Button>
              </Stack>
            </Paper>

            <Paper withBorder p="md" radius="sm">
              <Stack gap="sm">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">Controls</Text>
                <Select
                  radius="sm"
                  label="Chart type"
                  value={view}
                  onChange={(value) => setView(toViewMode(value))}
                  allowDeselect={false}
                  data={[
                    { label: 'Treemap', value: 'treemap' },
                    { label: 'Sunburst', value: 'sunburst' },
                    { label: 'Flame graph', value: 'flame-graph' },
                    { label: 'Circle packing', value: 'circle-packing' }
                  ]}
                />
                <TextInput
                  radius="sm"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Filter current directory"
                />
                <Box mb="md">
                  <Group justify="space-between" mb={6}>
                    <Text size="sm" fw={500}>Graph depth</Text>
                    <Badge variant="light" color="gray">{depth}</Badge>
                  </Group>
                  <Slider
                    min={1}
                    max={6}
                    step={1}
                    value={depth}
                    onChange={setDepth}
                    marks={[
                      { value: 1, label: '1' },
                      { value: 2, label: '2' },
                      { value: 3, label: '3' },
                      { value: 4, label: '4' },
                      { value: 5, label: '5' },
                      { value: 6, label: '6' }
                    ]}
                  />
                </Box>
                <CopyButton value={path} timeout={1500}>
                  {({ copied, copy }) => (
                    <Button
                      variant="default"
                      radius="sm"
                      onClick={() => {
                        copy();
                        notifications.show({
                          message: copied ? 'Path copied' : 'Copied current path',
                          color: 'dark'
                        });
                      }}
                    >
                      Copy path
                    </Button>
                  )}
                </CopyButton>
                <Switch
                  checked={showHiddenItems}
                  onChange={(event) => setShowHiddenItems(event.currentTarget.checked)}
                  label={hiddenPaths.length > 0 ? `Show hidden items (${hiddenPaths.length})` : 'Show hidden items'}
                />
                <Switch
                  checked={useDecal}
                  onChange={(event) => setUseDecal(event.currentTarget.checked)}
                  label="Enable decal pattern"
                />
                {view === 'sunburst' ? (
                  <Switch
                    checked={sunburstHighlightMode === 'descendant'}
                    onChange={(event) => setSunburstHighlightMode(event.currentTarget.checked ? 'descendant' : 'ancestor')}
                    label="Highlight children on hover"
                  />
                ) : null}
                <Button
                  variant="subtle"
                  radius="sm"
                  onClick={() => setHiddenPaths([])}
                  disabled={hiddenPaths.length === 0}
                >
                  Reset hidden list
                </Button>
              </Stack>
            </Paper>
          </Stack>
        </AppShell.Section>

        <Divider my="md" />

      </AppShell.Navbar>

      <AppShell.Main>
        <Stack gap="lg">
          <Paper withBorder p="lg" radius="sm">
            <Stack gap="lg">
              <Group justify="flex-end" align="flex-start">
                <Badge variant="filled" color="dark" size="lg">{formatBytes(data?.totalSizeBytes ?? 0)} total</Badge>
              </Group>

              <Breadcrumbs separator="/">
                {breadcrumbs.map((crumb) => (
                  <Button key={crumb.path} variant="subtle" size="compact-sm" onClick={() => navigate(crumb.path)}>
                    {crumb.label}
                  </Button>
                ))}
              </Breadcrumbs>

            </Stack>
          </Paper>

          {loading ? (
            <Paper withBorder p="xl" radius="sm">
              <Flex align="center" justify="center" mih={420}><Loader size="lg" color="dark" /></Flex>
            </Paper>
          ) : error ? (
            <Paper withBorder p="xl" radius="sm">
              <Stack gap="xs">
                <Text fw={700} c="red">{error}</Text>
                <Text c="dimmed">Check the Duc database mount, indexed path, or service health.</Text>
              </Stack>
            </Paper>
          ) : (
            <Grid gutter="lg" align="stretch">
              <Grid.Col span={{ base: 12, xl: 8 }}>
                <Paper withBorder p="md" radius="sm" h="100%">
                  <Stack gap="md" h="100%">
                    <Group justify="space-between">
                      <Box>
                        <Text fw={700}>{getViewLabel(view)}</Text>
                      </Box>
                    </Group>
                    <Box style={{ minHeight: 460 }}>
                      <ExplorerChart
                        nodes={chartNodes}
                        view={view}
                        sunburstHighlightMode={sunburstHighlightMode}
                        onSelect={selectByPath}
                        onContextMenu={openContextMenu}
                        onChartUp={moveSunburstUp}
                        canChartGoUp={view === 'sunburst' && sunburstRootPath !== null}
                        useDecal={useDecal}
                      />
                    </Box>
                  </Stack>
                </Paper>
              </Grid.Col>

              <Grid.Col span={{ base: 12, xl: 4 }}>
                <Stack gap="lg" h="100%">
                  <Paper withBorder p="md" radius="sm">
                    <Stack gap="sm">
                      <Text size="xs" tt="uppercase" fw={700} c="dimmed">Current directory</Text>
                      <Group justify="space-between" align="flex-start">
                        <Box>
                          <Text fw={700}>{breadcrumbs[breadcrumbs.length - 1]?.label ?? '/'}</Text>
                          <Text size="sm" c="dimmed">{path}</Text>
                        </Box>
                        <Badge color="dark">directory</Badge>
                      </Group>
                      <Divider />
                      <MetricRow label="Total size" value={formatBytes(data?.totalSizeBytes ?? 0)} />
                      <MetricRow label="Visible children" value={String(visibleNodes.length)} />
                      <MetricRow label="Directories" value={String(directoryCount)} />
                      <MetricRow label="Files" value={String(fileCount)} />
                      <MetricRow label="Largest child" value={largestNode?.name ?? 'None'} />
                      <Progress value={currentDirectoryShare} color="dark" radius="xs" />
                      <Text size="xs" c="dimmed">Visible rows account for {currentDirectoryShare.toFixed(2)}% of the current directory total.</Text>
                    </Stack>
                  </Paper>
                </Stack>
              </Grid.Col>

              <Grid.Col span={12}>
                <Paper withBorder p="md" radius="sm" onKeyDown={handleKeyNav} tabIndex={0}>
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Box>
                        <Text size="xs" tt="uppercase" fw={700} c="dimmed">Directory listing</Text>
                      </Box>
                      <Badge variant="light" color="gray">{visibleNodes.length} rows</Badge>
                    </Group>

                    <ScrollArea>
                      <Table highlightOnHover stickyHeader verticalSpacing="sm" horizontalSpacing="md">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>
                              <Button variant="subtle" size="compact-sm" px={0} onClick={() => toggleSort('name')}>
                                Name{sort === 'nameAsc' ? ' ^' : sort === 'nameDesc' ? ' v' : ''}
                              </Button>
                            </Table.Th>
                            <Table.Th>
                              <Button variant="subtle" size="compact-sm" px={0} onClick={() => toggleSort('type')}>
                                Type{sort === 'typeAsc' ? ' ^' : sort === 'typeDesc' ? ' v' : ''}
                              </Button>
                            </Table.Th>
                            <Table.Th>
                              <Button variant="subtle" size="compact-sm" px={0} onClick={() => toggleSort('size')}>
                                Size{sort === 'sizeAsc' ? ' ^' : sort === 'sizeDesc' ? ' v' : ''}
                              </Button>
                            </Table.Th>
                            <Table.Th>Share</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {visibleNodes.map((node, index) => (
                            <Table.Tr
                              key={node.path}
                              bg={index === activeIndex ? 'var(--mantine-color-dark-light)' : undefined}
                              onClick={() => {
                                setActiveIndex(index);
                                if (node.type === 'directory') {
                                  navigate(node.path);
                                }
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                openContextMenu(node.path, { x: event.clientX, y: event.clientY });
                              }}
                            >
                              <Table.Td>
                                <Group gap="xs" wrap="nowrap">
                                  <ThemeIcon size="sm" radius="sm" variant="light" color={node.type === 'directory' ? 'blue' : 'gray'}>
                                    {node.type === 'directory' ? 'D' : 'F'}
                                  </ThemeIcon>
                                  <Button
                                    variant="subtle"
                                    px={0}
                                    c="inherit"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (node.type === 'directory') {
                                        navigate(node.path);
                                      }
                                    }}
                                  >
                                    {node.name}
                                  </Button>
                                </Group>
                              </Table.Td>
                              <Table.Td>
                                <Group gap="xs">
                                  <Badge variant="outline" color={node.type === 'directory' ? 'blue' : 'gray'}>
                                    {node.type}
                                  </Badge>
                                  {hiddenPaths.includes(node.path) ? <Badge color="orange">hidden</Badge> : null}
                                </Group>
                              </Table.Td>
                              <Table.Td>{node.humanSize}</Table.Td>
                              <Table.Td>{node.percentOfParent.toFixed(2)}%</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>
          )}
        </Stack>
      </AppShell.Main>

      <Menu opened={contextMenu !== null} onClose={() => setContextMenu(null)} withinPortal>
        <Menu.Target>
          <Box
            style={{
              position: 'fixed',
              left: contextMenu?.x ?? -9999,
              top: contextMenu?.y ?? -9999,
              width: 1,
              height: 1,
              pointerEvents: 'none'
            }}
          />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Item actions</Menu.Label>
          <Menu.Item onClick={() => contextMenu && toggleHiddenPath(contextMenu.path)}>
            {contextMenu && hiddenPaths.includes(contextMenu.path) ? 'Unhide item' : 'Hide item from view'}
          </Menu.Item>
          <Menu.Item onClick={() => setContextMenu(null)}>Cancel</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </AppShell>
  );
}

function findNodeByPath(nodes: ExplorerNode[], targetPath: string | null): ExplorerNode | null {
  if (!targetPath) {
    return null;
  }

  for (const node of nodes) {
    if (node.path === targetPath) {
      return node;
    }

    const childMatch = findNodeByPath(node.children ?? [], targetPath);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

function getSunburstParentPath(basePath: string, currentPath: string) {
  const crumbs = buildBreadcrumbs(currentPath);
  const parent = crumbs[crumbs.length - 2]?.path;

  if (!parent || parent === basePath) {
    return null;
  }

  return parent;
}

function filterHiddenTree(nodes: ExplorerNode[], hiddenPaths: string[]): ExplorerNode[] {
  return nodes
    .filter((node) => !hiddenPaths.includes(node.path))
    .map((node) => ({
      ...node,
      children: node.children ? filterHiddenTree(node.children, hiddenPaths) : undefined
    }));
}

function markHiddenChartNodes(node: Record<string, unknown>, hiddenPaths: string[]): Record<string, unknown> {
  const path = typeof node.path === 'string' ? node.path : '';
  const children = Array.isArray(node.children)
    ? node.children.map((child) => markHiddenChartNodes(child as Record<string, unknown>, hiddenPaths))
    : undefined;

  return {
    ...node,
    hidden: hiddenPaths.includes(path),
    children
  };
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <Group justify="space-between" gap="md">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm" fw={700}>{value}</Text>
    </Group>
  );
}

function getInitialPath() {
  if (typeof window === 'undefined') {
    return '/scan/root';
  }

  return new URLSearchParams(window.location.search).get('path') ?? '/scan/root';
}

function getInitialView(): ViewMode {
  if (typeof window === 'undefined') {
    return 'treemap';
  }

  const value = new URLSearchParams(window.location.search).get('view');
  return toViewMode(value);
}

function toViewMode(value: string | null): ViewMode {
  if (value === 'sunburst' || value === 'flame-graph' || value === 'circle-packing') {
    return value;
  }

  return 'treemap';
}

function getViewLabel(view: ViewMode) {
  switch (view) {
    case 'sunburst':
      return 'Sunburst';
    case 'flame-graph':
      return 'Flame graph';
    case 'circle-packing':
      return 'Circle packing';
    case 'treemap':
      return 'Treemap';
  }
}

function getInitialSort(): TableSortMode {
  if (typeof window === 'undefined') return 'sizeDesc';

  const value = new URLSearchParams(window.location.search).get('sort');
  return isTableSortMode(value) ? value : 'sizeDesc';
}

function getInitialDepth() {
  if (typeof window === 'undefined') return 4;

  return toDepth(new URLSearchParams(window.location.search).get('depth'));
}

function toDepth(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : 4;
  return parsed >= 1 && parsed <= 6 ? parsed : 4;
}

function getInitialQuery(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('query') ?? '';
}

function isTableSortMode(value: string | null): value is TableSortMode {
  return value === 'sizeDesc'
    || value === 'sizeAsc'
    || value === 'nameAsc'
    || value === 'nameDesc'
    || value === 'typeAsc'
    || value === 'typeDesc';
}

function toApiSort(sort: TableSortMode): SortMode {
  if (sort === 'nameAsc' || sort === 'nameDesc') {
    return 'nameAsc';
  }

  return 'sizeDesc';
}

function sortVisibleNodes(nodes: ExplorerNode[], sort: TableSortMode) {
  const copy = [...nodes];

  switch (sort) {
    case 'nameAsc':
      return copy.sort((left, right) => left.name.localeCompare(right.name));
    case 'nameDesc':
      return copy.sort((left, right) => right.name.localeCompare(left.name));
    case 'sizeAsc':
      return copy.sort((left, right) => left.sizeBytes - right.sizeBytes || left.name.localeCompare(right.name));
    case 'sizeDesc':
      return copy.sort((left, right) => right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name));
    case 'typeAsc':
      return copy.sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name));
    case 'typeDesc':
      return copy.sort((left, right) => right.type.localeCompare(left.type) || left.name.localeCompare(right.name));
  }
}

function nextTableSort(current: TableSortMode, column: 'name' | 'size' | 'type'): TableSortMode {
  if (column === 'name') {
    return current === 'nameAsc' ? 'nameDesc' : 'nameAsc';
  }

  if (column === 'type') {
    return current === 'typeAsc' ? 'typeDesc' : 'typeAsc';
  }

  return current === 'sizeDesc' ? 'sizeAsc' : 'sizeDesc';
}
