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
  CopyButton,
  Divider,
  Flex,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
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
import type { ChildrenResponse, ExplorerNode, SortMode } from '@pretty-duc/contracts';
import { buildBreadcrumbs, filterNodes, formatBytes, largestItems, toChartTree } from '@pretty-duc/ui-model';
import { fetchChildren, fetchHealth, fetchInfo, fetchTree } from './api';
import { ExplorerChart } from './ExplorerChart';

type ViewMode = 'treemap' | 'sunburst';

export function App() {
  const [mobileOpened, { toggle }] = useDisclosure();
  const [path, setPath] = useState(getInitialPath);
  const [sort, setSort] = useState<SortMode>('sizeDesc');
  const [view, setView] = useState<ViewMode>(getInitialView);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<ChildrenResponse | null>(null);
  const [treeData, setTreeData] = useState<ChildrenResponse | null>(null);
  const [health, setHealth] = useState<string>('Checking service');
  const [info, setInfo] = useState<string>('Loading Duc metadata');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('path', path);
    params.set('view', view);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [path, view]);

  useEffect(() => {
    fetchHealth()
      .then((result) => setHealth(result.ok ? `Healthy - ${result.database}` : 'Degraded'))
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
        const [children, tree] = await Promise.all([
          fetchChildren(path, 2, sort),
          fetchTree(path, 2).catch(() => null)
        ]);

        if (ignore) return;
        setData(children);
        setTreeData(
          tree
            ? {
                ...children,
                children: tree.children
              }
            : children
        );
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
  const summaryItems = useMemo(() => largestItems(filteredNodes, 5), [filteredNodes]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(path), [path]);

  const chartNodes = useMemo(() => toChartTree(treeData?.children ?? filteredNodes), [treeData?.children, filteredNodes]);

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
      padding="md"
      header={{ height: 72 }}
      navbar={{ width: 320, breakpoint: 'md', collapsed: { mobile: !mobileOpened, desktop: false } }}
      withBorder={false}
    >
      <AppShell.Header px="md">
        <Group justify="space-between" h="100%">
          <Group>
            <Burger opened={mobileOpened} onClick={toggle} hiddenFrom="md" />
            <Box>
              <Title order={2} c="white">Pretty Duc</Title>
              <Text c="rgba(255,255,255,0.72)" size="sm">Modern Duc browser for remote disk analysis</Text>
            </Box>
          </Group>
          <Group>
            <Badge variant="light" color="teal">{health}</Badge>
            <Badge variant="outline" color="gray">{info}</Badge>
            <Tooltip label="Toggle dark mode">
              <ActionIcon variant="light" color="teal" onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}>
                {colorScheme === 'dark' ? 'L' : 'D'}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" className="glass-panel">
        <AppShell.Section>
          <Stack gap="md">
            <Paper p="md" radius="lg" className="glass-panel">
              <Text fw={700} c="teal.2">Current path</Text>
              <Text mt="xs" className="path-chip">{path}</Text>
              <Group mt="md">
                <Button variant="light" color="teal" onClick={navigateUp}>Up</Button>
                <Button variant="default" onClick={() => setPath('/scan/root')}>Root</Button>
                <Button variant="subtle" onClick={() => setPath(path)}>Refresh</Button>
              </Group>
            </Paper>

            <Paper p="md" radius="lg" className="glass-panel">
              <Text fw={700}>Controls</Text>
              <Stack mt="sm">
                <SegmentedControl
                  value={view}
                  onChange={(value) => setView(value as ViewMode)}
                  data={[
                    { label: 'Treemap', value: 'treemap' },
                    { label: 'Sunburst', value: 'sunburst' }
                  ]}
                />
                <SegmentedControl
                  value={sort}
                  onChange={(value) => setSort(value as SortMode)}
                  data={[
                    { label: 'Size', value: 'sizeDesc' },
                    { label: 'Name', value: 'nameAsc' }
                  ]}
                />
                <TextInput value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Filter current directory" />
                <CopyButton value={path} timeout={1500}>
                  {({ copied, copy }) => (
                    <Button
                      variant="light"
                      onClick={() => {
                        copy();
                        notifications.show({ message: copied ? 'Path copied' : 'Copied path to clipboard', color: 'teal' });
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
          <Stack gap="sm">
            <Text fw={700}>Largest items</Text>
            {summaryItems.map((item) => (
              <Card key={item.path} radius="lg" padding="sm" className="glass-panel">
                <Group justify="space-between" wrap="nowrap">
                  <Box>
                    <Text fw={600}>{item.name}</Text>
                    <Text size="xs" c="dimmed">{item.path}</Text>
                  </Box>
                  <Badge color={item.type === 'directory' ? 'teal' : 'gray'}>{item.humanSize}</Badge>
                </Group>
              </Card>
            ))}
          </Stack>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Stack gap="md">
          <Paper p="md" radius="xl" className="glass-panel">
            <Group justify="space-between" align="flex-start">
              <Box>
                <Breadcrumbs>
                  {breadcrumbs.map((crumb) => (
                    <Text component="button" type="button" key={crumb.path} onClick={() => navigate(crumb.path)}>
                      {crumb.label}
                    </Text>
                  ))}
                </Breadcrumbs>
                <Text mt="sm" c="dimmed">Browse children, compare percentages, and jump by chart or table.</Text>
              </Box>
              <Badge color="teal" variant="filled">{formatBytes(data?.totalSizeBytes ?? 0)} total</Badge>
            </Group>
          </Paper>

          {loading ? (
            <Flex align="center" justify="center" mih={420}><Loader size="lg" color="teal" /></Flex>
          ) : error ? (
            <Paper p="xl" radius="xl" className="glass-panel">
              <Text fw={700} c="red">{error}</Text>
              <Text c="dimmed" mt="xs">Check the Duc database mount, indexed path, or service health.</Text>
            </Paper>
          ) : (
            <>
              <Paper p="md" radius="xl" className="glass-panel chart-surface">
                <ExplorerChart
                  nodes={chartNodes}
                  view={view}
                  onNavigate={(chartPath) => navigate(chartPath)}
                />
              </Paper>

              <Paper p="md" radius="xl" className="glass-panel" onKeyDown={handleKeyNav} tabIndex={0}>
                <Table highlightOnHover verticalSpacing="sm">
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
                      <Table.Tr key={node.path} className={index === activeIndex ? 'table-row-active' : undefined}>
                        <Table.Td>
                          <Button variant="subtle" px={0} onClick={() => node.type === 'directory' && navigate(node.path)}>
                            {node.name}
                          </Button>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <ThemeIcon size="sm" color={node.type === 'directory' ? 'teal' : 'gray'} variant="light">
                              {node.type === 'directory' ? 'D' : 'F'}
                            </ThemeIcon>
                            <Text>{node.type}</Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>{node.humanSize}</Table.Td>
                        <Table.Td>{node.percentOfParent.toFixed(2)}%</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            </>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
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
