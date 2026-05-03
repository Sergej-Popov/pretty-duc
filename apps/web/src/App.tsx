import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Breadcrumbs,
  Burger,
  Button,
  Card,
  Code,
  CopyButton,
  Divider,
  Flex,
  Grid,
  Group,
  Loader,
  NavLink,
  Paper,
  Progress,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
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
import type { ChildrenResponse, SortMode } from '@pretty-duc/contracts';
import { buildBreadcrumbs, filterNodes, formatBytes, largestItems, toChartTree } from '@pretty-duc/ui-model';
import { fetchChildren, fetchHealth, fetchInfo } from './api';
import { ExplorerChart } from './ExplorerChart';

type ViewMode = 'treemap' | 'sunburst';

export function App() {
  const [mobileOpened, { toggle }] = useDisclosure();
  const [path, setPath] = useState(getInitialPath);
  const [sort, setSort] = useState<SortMode>(getInitialSort);
  const [view, setView] = useState<ViewMode>(getInitialView);
  const [query, setQuery] = useState(getInitialQuery);
  const [data, setData] = useState<ChildrenResponse | null>(null);
  const [health, setHealth] = useState<string>('Checking service');
  const [info, setInfo] = useState<string>('Loading Duc metadata');
  const [rootPath, setRootPath] = useState('/scan/root');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('path', path);
    params.set('view', view);
    params.set('sort', sort);
    if (query) {
      params.set('query', query);
    } else {
      params.delete('query');
    }
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [path, view, sort, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

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
        const children = await fetchChildren(path, 2, sort);

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
  }, [path, sort]);

  const filteredNodes = useMemo(() => filterNodes(data?.children ?? [], query), [data?.children, query]);
  const highlighted = filteredNodes[activeIndex] ?? null;
  const summaryItems = useMemo(() => largestItems(filteredNodes, 6), [filteredNodes]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(path), [path]);
  const chartNodes = useMemo(() => toChartTree(data?.children ?? []), [data?.children]);
  const directoryCount = filteredNodes.filter((node) => node.type === 'directory').length;
  const fileCount = filteredNodes.length - directoryCount;
  const largestNode = filteredNodes[0] ?? null;

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
    if (!filteredNodes.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, filteredNodes.length - 1));
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
              <Text size="sm" c="dimmed">Disk usage intelligence over the Duc index</Text>
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
                  <Badge variant="outline" color="gray">{view}</Badge>
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
                <SegmentedControl
                  radius="sm"
                  value={view}
                  onChange={(value) => setView(value as ViewMode)}
                  data={[
                    { label: 'Treemap', value: 'treemap' },
                    { label: 'Sunburst', value: 'sunburst' }
                  ]}
                />
                <SegmentedControl
                  radius="sm"
                  value={sort}
                  onChange={(value) => setSort(value as SortMode)}
                  data={[
                    { label: 'By size', value: 'sizeDesc' },
                    { label: 'By name', value: 'nameAsc' }
                  ]}
                />
                <TextInput
                  radius="sm"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Filter current directory"
                />
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
              </Stack>
            </Paper>
          </Stack>
        </AppShell.Section>

        <Divider my="md" />

        <AppShell.Section grow component={ScrollArea}>
          <Stack gap="xs">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">Largest items</Text>
            {summaryItems.map((item) => (
              <NavLink
                key={item.path}
                label={item.name}
                description={item.path}
                variant="subtle"
                active={highlighted?.path === item.path}
                onClick={() => item.type === 'directory' && navigate(item.path)}
                rightSection={<Badge color={item.type === 'directory' ? 'blue' : 'gray'}>{item.humanSize}</Badge>}
              />
            ))}
          </Stack>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Stack gap="lg">
          <Paper withBorder p="lg" radius="sm">
            <Stack gap="lg">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Text size="xs" tt="uppercase" fw={700} c="dimmed">Explorer</Text>
                  <Title order={3} mt={4}>Visual breakdown of the active directory</Title>
                  <Text size="sm" c="dimmed" mt={6}>Browse by chart, inspect by table, and move through the index with keyboard navigation.</Text>
                </Box>
                <Badge variant="filled" color="dark" size="lg">{formatBytes(data?.totalSizeBytes ?? 0)} total</Badge>
              </Group>

              <Breadcrumbs separator="/">
                {breadcrumbs.map((crumb) => (
                  <Button key={crumb.path} variant="subtle" size="compact-sm" onClick={() => navigate(crumb.path)}>
                    {crumb.label}
                  </Button>
                ))}
              </Breadcrumbs>

              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                <StatCard label="Visible items" value={String(filteredNodes.length)} hint="After current filter" />
                <StatCard label="Directories" value={String(directoryCount)} hint="Expandable branches" />
                <StatCard label="Files" value={String(fileCount)} hint="Leaf nodes" />
                <StatCard label="Largest entry" value={largestNode?.name ?? 'None'} hint={largestNode?.humanSize ?? '0 B'} mono={false} />
              </SimpleGrid>
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
                        <Text size="xs" tt="uppercase" fw={700} c="dimmed">Chart stage</Text>
                        <Text fw={700}>Interactive {view}</Text>
                      </Box>
                      <Badge variant="outline" color="gray">Click a directory to drill in</Badge>
                    </Group>
                    <Box style={{ minHeight: 460 }}>
                      <ExplorerChart nodes={chartNodes} view={view} onNavigate={(chartPath) => navigate(chartPath)} />
                    </Box>
                  </Stack>
                </Paper>
              </Grid.Col>

              <Grid.Col span={{ base: 12, xl: 4 }}>
                <Stack gap="lg" h="100%">
                  <Paper withBorder p="md" radius="sm">
                    <Stack gap="sm">
                      <Text size="xs" tt="uppercase" fw={700} c="dimmed">Selection</Text>
                      <Group justify="space-between" align="flex-start">
                        <Box>
                          <Text fw={700}>{highlighted?.name ?? 'Nothing selected'}</Text>
                          <Text size="sm" c="dimmed">{highlighted?.path ?? 'Use keyboard arrows or click a row'}</Text>
                        </Box>
                        {highlighted ? (
                          <Badge color={highlighted.type === 'directory' ? 'blue' : 'gray'}>{highlighted.type}</Badge>
                        ) : null}
                      </Group>
                      <Divider />
                      <MetricRow label="Size" value={highlighted?.humanSize ?? '0 B'} />
                      <MetricRow label="Share" value={highlighted ? `${highlighted.percentOfParent.toFixed(2)}%` : '0.00%'} />
                      <MetricRow label="Children" value={highlighted?.hasChildren ? 'Yes' : 'No'} />
                      <Progress value={highlighted?.percentOfParent ?? 0} color="dark" radius="xs" />
                      {highlighted?.type === 'directory' ? (
                        <Button radius="sm" onClick={() => navigate(highlighted.path)}>Open directory</Button>
                      ) : null}
                    </Stack>
                  </Paper>

                  <Card withBorder radius="sm" padding="md">
                    <Stack gap="xs">
                      <Text size="xs" tt="uppercase" fw={700} c="dimmed">Operator notes</Text>
                      <Text size="sm">Arrow keys move selection. Press <Code>Enter</Code> to open a directory and <Code>Backspace</Code> to move up.</Text>
                      <Text size="sm" c="dimmed">The table below remains the authoritative listing for the current path.</Text>
                    </Stack>
                  </Card>
                </Stack>
              </Grid.Col>

              <Grid.Col span={12}>
                <Paper withBorder p="md" radius="sm" onKeyDown={handleKeyNav} tabIndex={0}>
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Box>
                        <Text size="xs" tt="uppercase" fw={700} c="dimmed">Directory listing</Text>
                        <Text fw={700}>Largest items</Text>
                      </Box>
                      <Badge variant="light" color="gray">{filteredNodes.length} rows</Badge>
                    </Group>

                    <ScrollArea>
                      <Table highlightOnHover stickyHeader verticalSpacing="sm" horizontalSpacing="md">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Type</Table.Th>
                            <Table.Th>Size</Table.Th>
                            <Table.Th>Share</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {filteredNodes.map((node, index) => (
                            <Table.Tr
                              key={node.path}
                              bg={index === activeIndex ? 'var(--mantine-color-dark-light)' : undefined}
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
                                    onClick={() => node.type === 'directory' && navigate(node.path)}
                                  >
                                    {node.name}
                                  </Button>
                                </Group>
                              </Table.Td>
                              <Table.Td>
                                <Badge variant="outline" color={node.type === 'directory' ? 'blue' : 'gray'}>
                                  {node.type}
                                </Badge>
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
    </AppShell>
  );
}

function StatCard({ label, value, hint, mono = true }: { label: string; value: string; hint: string; mono?: boolean }) {
  return (
    <Paper withBorder p="md" radius="sm">
      <Stack gap={6}>
        <Text size="xs" tt="uppercase" fw={700} c="dimmed">{label}</Text>
        <Text fw={800} fz="xl" ff={mono ? 'monospace' : undefined}>{value}</Text>
        <Text size="sm" c="dimmed">{hint}</Text>
      </Stack>
    </Paper>
  );
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
  return value === 'sunburst' ? 'sunburst' : 'treemap';
}

function getInitialSort(): SortMode {
  if (typeof window === 'undefined') return 'sizeDesc';
  return (new URLSearchParams(window.location.search).get('sort') as SortMode) ?? 'sizeDesc';
}

function getInitialQuery(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('query') ?? '';
}
