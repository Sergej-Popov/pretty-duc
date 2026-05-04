import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
import { ExplorerChart, type ChartColorTheme, type ChartViewMode, type SunburstHighlightMode } from './ExplorerChart';

type ViewMode = ChartViewMode;
type TableSortMode = 'sizeDesc' | 'sizeAsc' | 'nameAsc' | 'nameDesc' | 'typeAsc' | 'typeDesc';

export function App() {
  const [mobileOpened, { toggle }] = useDisclosure();
  const [path, setPath] = useState(getInitialPath);
  const [sort, setSort] = useState<TableSortMode>(getInitialSort);
  const [view, setView] = useState<ViewMode>(getInitialView);
  const [chartColorTheme, setChartColorTheme] = useState<ChartColorTheme>(getInitialChartColorTheme);
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
  const [showHiddenItems, setShowHiddenItems] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('showHiddenItems') === 'true' : false);
  const [sunburstRootPath, setSunburstRootPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const [useDecal, setUseDecal] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('useDecal') === 'true' : false);
  const [sunburstHighlightMode, setSunburstHighlightMode] = useState<SunburstHighlightMode>(() => {
    if (typeof window === 'undefined') return 'ancestor';
    return (localStorage.getItem('sunburstHighlightMode') as SunburstHighlightMode) || 'ancestor';
});
const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('path', path);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [path]);

  useEffect(() => {
    setActiveIndex(0);
  }, [depth, query, sort, path]);

  useEffect(() => {
    setSunburstRootPath(null);
  }, [path]);

  useEffect(() => {
    localStorage.setItem('view', view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem('chartColorTheme', chartColorTheme);
  }, [chartColorTheme]);

  useEffect(() => {
    localStorage.setItem('sort', sort);
  }, [sort]);

  useEffect(() => {
    localStorage.setItem('depth', String(depth));
  }, [depth]);

  useEffect(() => {
    localStorage.setItem('showHiddenItems', String(showHiddenItems));
  }, [showHiddenItems]);

  useEffect(() => {
    localStorage.setItem('useDecal', String(useDecal));
  }, [useDecal]);

  useEffect(() => {
    localStorage.setItem('sunburstHighlightMode', sunburstHighlightMode);
  }, [sunburstHighlightMode]);

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

  const suggestions = useMemo(() => getAutocompleteSuggestions(data?.children ?? [], query), [data?.children, query]);

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
    if (nextPath !== rootPath && !nextPath.startsWith(rootPath + '/')) {
      notifications.show({ message: 'Cannot navigate above root directory', color: 'yellow' });
      return;
    }
    setPath(nextPath);
    setActiveIndex(0);
  }

  function navigateUp() {
    const crumbs = buildBreadcrumbs(path);
    if (crumbs.length > 1) {
      const parentPath = crumbs[crumbs.length - 2]!.path;
      if (parentPath !== rootPath && !parentPath.startsWith(rootPath + '/')) {
        notifications.show({ message: 'Cannot navigate above root directory', color: 'yellow' });
      } else {
        navigate(parentPath);
      }
    } else {
      notifications.show({ message: 'Already at root directory', color: 'yellow' });
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
      className="pretty-duc-shell"
      padding="lg"
      header={{ height: 72 }}
      navbar={{ width: 340, breakpoint: 'md', collapsed: { mobile: !mobileOpened, desktop: false } }}
    >
      <AppShell.Header className="app-header">
        <Group className="app-header-inner" justify="space-between" h="100%" px="lg">
          <Group className="app-brand" gap="md">
            <Burger className="mobile-nav-toggle" opened={mobileOpened} onClick={toggle} hiddenFrom="md" />
            <ThemeIcon className="app-logo" size={38} radius="sm" variant="light" color="dark">
              PD
            </ThemeIcon>
            <Box className="app-title-block">
              <Group className="app-title-row" gap="sm" align="center">
                <Title className="app-title" order={2}>Pretty Duc</Title>
                <Badge className="service-health-badge" variant="light" color={health === 'Connected' ? 'green' : 'orange'}>
                  {health}
                </Badge>
              </Group>
            </Box>
          </Group>

          <Group className="app-header-actions" gap="xs">
            <Badge className="duc-info-badge" variant="dot" color="gray" visibleFrom="sm">{info}</Badge>
            <Tooltip label="Toggle color scheme">
              <ActionIcon
                className="color-scheme-toggle"
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

      <AppShell.Navbar className="sidebar-nav" p="md">
        <AppShell.Section className="sidebar-main-section">
          <Stack className="sidebar-stack" gap="md">
            <Paper className="active-scope-panel" withBorder p="md" radius="sm">
              <Stack className="active-scope-content" gap="sm">
                <Group className="active-scope-header" justify="space-between" align="flex-start">
                  <Box className="active-scope-title-block">
                    <Text size="xs" tt="uppercase" fw={700} c="dimmed">Active scope</Text>
                    <Text fw={700} mt={4}>Current path</Text>
                  </Box>
                </Group>
                <Code className="current-path-code" block>{path}</Code>
                <Group className="scope-navigation-actions" grow>
                  <Button className="navigate-up-button" variant="filled" radius="sm" onClick={navigateUp}>Up</Button>
                  <Button className="navigate-root-button" variant="default" radius="sm" onClick={() => navigate(rootPath)}>Root</Button>
                </Group>
                <Button className="refresh-listing-button" variant="subtle" radius="sm" onClick={() => navigate(path)}>Refresh listing</Button>
              </Stack>
            </Paper>

            <Paper className="controls-panel" withBorder p="md" radius="sm">
              <Stack className="controls-stack" gap="sm">
                <Text className="controls-panel-title" size="xs" tt="uppercase" fw={700} c="dimmed">Controls</Text>
                <Select
                  className="chart-type-select"
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
                <Select
                  className="chart-colour-theme-select"
                  radius="sm"
                  label="Colour theme"
                  value={chartColorTheme}
                  onChange={(value) => setChartColorTheme(toChartColorTheme(value))}
                  allowDeselect={false}
                  data={[
                    { label: 'Ocean multi', value: 'ocean' },
                    { label: 'Blue mono', value: 'blue-mono' },
                    { label: 'Amber mono', value: 'amber-mono' },
                    { label: 'Forest', value: 'forest' },
                    { label: 'Sunset neon', value: 'sunset' },
                    { label: 'Aurora', value: 'aurora' },
                    { label: 'Candy', value: 'candy' },
                    { label: 'Terminal glow', value: 'terminal' },
                    { label: 'Jewel box', value: 'jewel' },
                    { label: 'Volcanic', value: 'volcanic' },
                    { label: 'Pastel prism', value: 'pastel' }
                  ]}
                />
                <Box className="directory-filter-wrapper" style={{ position: 'relative' }}>
                  <TextInput
                    ref={inputRef}
                    className="directory-filter-input"
                    radius="sm"
                    placeholder="Filter"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.currentTarget.value);
                      setSelectedIndex(0);
                      if (suggestions.length > 0 && !inputRef.current?.getAttribute('data-dropdown-open')) {
                        inputRef.current?.focus();
                      }
                    }}
                    onFocus={() => {
                      if (suggestions.length > 0) {
                        inputRef.current?.focus();
                      }
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      event.nativeEvent.stopImmediatePropagation();
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        if (suggestions.length > 0) {
                          setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
                        }
                      }
                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        setSelectedIndex((i) => Math.max(i - 1, 0));
                      }
                      if (event.key === 'Enter' && suggestions.length > 0) {
                        event.preventDefault();
                        const idx = selectedIndex;
                        const selected = suggestions[idx] ?? suggestions[0];
                        setQuery(selected);
                      }
                      if (event.key === 'Escape') {
                        setSelectedIndex(0);
                      }
                    }}
                  />
                  {suggestions.length > 0 && (
                    <Box
                      className="directory-filter-dropdown"
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        backgroundColor: 'var(--mantine-color-body)',
                        border: '1px solid var(--mantine-color-dimmed-border)',
                        borderRadius: 'var(--mantine-radius-sm)',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        boxShadow: 'var(--mantine-shadow-md)'
                      }}
                    >
                      {suggestions.map((suggestion, index) => (
                        <Box
                          key={suggestion}
                          className="directory-filter-suggestion"
                          onClick={() => {
                            setQuery(suggestion);
                            setDropdownOpen(false);
                          }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--mantine-color-dimmed-border)',
                            backgroundColor: index === selectedIndex ? 'var(--mantine-color-dimmed-bg)' : 'transparent'
                          }}
                          onMouseEnter={(e) => {
                            setSelectedIndex(index);
                          }}
                        >
                          {suggestion}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
                <Box className="graph-depth-control" mb="md">
                  <Group className="graph-depth-header" justify="space-between" mb={6}>
                    <Text className="graph-depth-label" size="sm" fw={500}>Graph depth</Text>
                    <Badge className="graph-depth-value" variant="light" color="gray">{depth}</Badge>
                  </Group>
                  <Slider
                    className="graph-depth-slider"
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
                      className="copy-path-button"
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
                  className="show-hidden-switch"
                  checked={showHiddenItems}
                  onChange={(event) => setShowHiddenItems(event.currentTarget.checked)}
                  label={hiddenPaths.length > 0 ? `Show hidden items (${hiddenPaths.length})` : 'Show hidden items'}
                />
                <Switch
                  className="decal-pattern-switch"
                  checked={useDecal}
                  onChange={(event) => setUseDecal(event.currentTarget.checked)}
                  label="Enable decal pattern"
                />
                {view === 'sunburst' ? (
                  <Switch
                    className="sunburst-highlight-mode-switch"
                    checked={sunburstHighlightMode === 'descendant'}
                    onChange={(event) => setSunburstHighlightMode(event.currentTarget.checked ? 'descendant' : 'ancestor')}
                    label="Highlight children on hover"
                  />
                ) : null}
                <Button
                  className="reset-hidden-list-button"
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

      <AppShell.Main className="main-content">
        <Stack className="main-content-stack" gap="lg">
          <Paper className="breadcrumbs-panel" withBorder p="lg" radius="sm">
            <Stack className="breadcrumbs-panel-content" gap="lg">
              <Group className="total-size-row" justify="flex-end" align="flex-start">
                <Badge className="total-size-badge" variant="filled" color="dark" size="lg">{formatBytes(data?.totalSizeBytes ?? 0)} total</Badge>
              </Group>

              <Breadcrumbs className="path-breadcrumbs" separator="/">
                {breadcrumbs.filter((crumb) => crumb.path !== '/').map((crumb) => (
                  <Button
                    className="breadcrumb-button"
                    key={crumb.path}
                    variant="subtle"
                    size="compact-sm"
                    disabled={crumb.path !== rootPath && !crumb.path.startsWith(rootPath + '/')}
                    onClick={() => {
                      if (crumb.path !== rootPath && !crumb.path.startsWith(rootPath + '/')) {
                        notifications.show({ message: 'Cannot navigate above root directory', color: 'yellow' });
                      } else {
                        navigate(crumb.path);
                      }
                    }}
                  >
                    {crumb.label}
                  </Button>
                ))}
              </Breadcrumbs>

            </Stack>
          </Paper>

          {loading ? (
            <Paper className="loading-panel" withBorder p="xl" radius="sm">
              <Flex className="loading-panel-content" align="center" justify="center" mih={420}><Loader className="loading-spinner" size="lg" color="dark" /></Flex>
            </Paper>
          ) : error ? (
            <Paper className="error-panel" withBorder p="xl" radius="sm">
              <Stack className="error-panel-content" gap="xs">
                <Text className="error-message" fw={700} c="red">{error}</Text>
                <Text className="error-help-text" c="dimmed">Check the Duc database mount, indexed path, or service health.</Text>
              </Stack>
            </Paper>
          ) : (
            <Grid className="explorer-grid" gutter="lg" align="stretch">
              <Grid.Col className="chart-column" span={{ base: 12, xl: 8 }}>
                <Paper className="chart-panel" withBorder p="md" radius="sm" h="100%">
                  <Stack className="chart-panel-content" gap="md" h="100%">
                    <Group className="chart-panel-header" justify="space-between">
                      <Box className="chart-title-block">
                        <Text className="chart-title" fw={700}>{getViewLabel(view)}</Text>
                      </Box>
                    </Group>
                    <Box className="chart-stage" style={{ minHeight: 460 }}>
                      <ExplorerChart
                        nodes={chartNodes}
                        view={view}
                        colorTheme={chartColorTheme}
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

              <Grid.Col className="summary-column" span={{ base: 12, xl: 4 }}>
                <Stack className="summary-stack" gap="lg" h="100%">
                  <Paper className="current-directory-panel" withBorder p="md" radius="sm">
                    <Stack className="current-directory-content" gap="sm">
                      <Text className="current-directory-eyebrow" size="xs" tt="uppercase" fw={700} c="dimmed">Current directory</Text>
                      <Group className="current-directory-header" justify="space-between" align="flex-start">
                        <Box className="current-directory-title-block">
                          <Text className="current-directory-name" fw={700}>{breadcrumbs[breadcrumbs.length - 1]?.label ?? '/'}</Text>
                          <Text className="current-directory-path" size="sm" c="dimmed">{path}</Text>
                        </Box>
                        <Badge className="current-directory-type-badge" color="dark">directory</Badge>
                      </Group>
                      <Divider className="current-directory-divider" />
                      <MetricRow label="Total size" value={formatBytes(data?.totalSizeBytes ?? 0)} />
                      <MetricRow label="Visible children" value={String(visibleNodes.length)} />
                      <MetricRow label="Directories" value={String(directoryCount)} />
                      <MetricRow label="Files" value={String(fileCount)} />
                      <MetricRow label="Largest child" value={largestNode?.name ?? 'None'} />
                      <Progress className="current-directory-share-progress" value={currentDirectoryShare} color="dark" radius="xs" />
                      <Text className="current-directory-share-note" size="xs" c="dimmed">Visible rows account for {currentDirectoryShare.toFixed(2)}% of the current directory total.</Text>
                    </Stack>
                  </Paper>
                </Stack>
              </Grid.Col>

              <Grid.Col className="listing-column" span={12}>
                <Paper className="directory-listing-panel" withBorder p="md" radius="sm" onKeyDown={handleKeyNav} tabIndex={0}>
                  <Stack className="directory-listing-content" gap="md">
                    <Group className="directory-listing-header" justify="space-between">
                      <Box className="directory-listing-title-block">
                        <Text className="directory-listing-title" size="xs" tt="uppercase" fw={700} c="dimmed">Directory listing</Text>
                      </Box>
                      <Badge className="directory-listing-row-count" variant="light" color="gray">{visibleNodes.length} rows</Badge>
                    </Group>

                    <ScrollArea className="directory-table-scroll-area">
                      <Table className="directory-table" highlightOnHover stickyHeader verticalSpacing="sm" horizontalSpacing="md">
                        <Table.Thead className="directory-table-head">
                          <Table.Tr className="directory-table-header-row">
                            <Table.Th className="directory-table-heading directory-table-heading-name">
                              <Button className="sort-name-button" variant="subtle" size="compact-sm" px={0} onClick={() => toggleSort('name')}>
                                Name{sort === 'nameAsc' ? ' ^' : sort === 'nameDesc' ? ' v' : ''}
                              </Button>
                            </Table.Th>
                            <Table.Th className="directory-table-heading directory-table-heading-type">
                              <Button className="sort-type-button" variant="subtle" size="compact-sm" px={0} onClick={() => toggleSort('type')}>
                                Type{sort === 'typeAsc' ? ' ^' : sort === 'typeDesc' ? ' v' : ''}
                              </Button>
                            </Table.Th>
                            <Table.Th className="directory-table-heading directory-table-heading-size">
                              <Button className="sort-size-button" variant="subtle" size="compact-sm" px={0} onClick={() => toggleSort('size')}>
                                Size{sort === 'sizeAsc' ? ' ^' : sort === 'sizeDesc' ? ' v' : ''}
                              </Button>
                            </Table.Th>
                            <Table.Th className="directory-table-heading directory-table-heading-share">Share</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody className="directory-table-body">
                          {visibleNodes.map((node, index) => (
                            <Table.Tr
                              className="directory-table-row"
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
                              <Table.Td className="directory-table-cell directory-table-cell-name">
                                <Group className="directory-entry-name-group" gap="xs" wrap="nowrap">
                                  <ThemeIcon className="directory-entry-type-icon" size="sm" radius="sm" variant="light" color={node.type === 'directory' ? 'blue' : 'gray'}>
                                    {node.type === 'directory' ? 'D' : 'F'}
                                  </ThemeIcon>
                                  <Button
                                    className="directory-entry-name-button"
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
                              <Table.Td className="directory-table-cell directory-table-cell-type">
                                <Group className="directory-entry-badges" gap="xs">
                                  <Badge className="directory-entry-type-badge" variant="outline" color={node.type === 'directory' ? 'blue' : 'gray'}>
                                    {node.type}
                                  </Badge>
                                  {hiddenPaths.includes(node.path) ? <Badge className="directory-entry-hidden-badge" color="orange">hidden</Badge> : null}
                                </Group>
                              </Table.Td>
                              <Table.Td className="directory-table-cell directory-table-cell-size">{node.humanSize}</Table.Td>
                              <Table.Td className="directory-table-cell directory-table-cell-share">{node.percentOfParent.toFixed(2)}%</Table.Td>
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
            className="context-menu-anchor"
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
        <Menu.Dropdown className="item-context-menu">
          <Menu.Label className="item-context-menu-label">Item actions</Menu.Label>
          <Menu.Item className="toggle-hidden-menu-item" onClick={() => contextMenu && toggleHiddenPath(contextMenu.path)}>
            {contextMenu && hiddenPaths.includes(contextMenu.path) ? 'Unhide item' : 'Hide item from view'}
          </Menu.Item>
          <Menu.Item className="cancel-context-menu-item" onClick={() => setContextMenu(null)}>Cancel</Menu.Item>
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
  return toViewMode(localStorage.getItem('view'));
}

function getInitialChartColorTheme(): ChartColorTheme {
  if (typeof window === 'undefined') {
    return 'ocean';
  }
  return toChartColorTheme(localStorage.getItem('chartColorTheme'));
}

function toViewMode(value: string | null): ViewMode {
  if (value === 'sunburst' || value === 'flame-graph' || value === 'circle-packing') {
    return value;
  }

  return 'treemap';
}

function toChartColorTheme(value: string | null): ChartColorTheme {
  if (value === 'blue-mono'
    || value === 'amber-mono'
    || value === 'forest'
    || value === 'sunset'
    || value === 'aurora'
    || value === 'candy'
    || value === 'terminal'
    || value === 'jewel'
    || value === 'volcanic'
    || value === 'pastel') {
    return value;
  }

  return 'ocean';
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
  return isTableSortMode(localStorage.getItem('sort')) ? localStorage.getItem('sort') as TableSortMode : 'sizeDesc';
}

function getInitialDepth() {
  if (typeof window === 'undefined') return 4;
  return toDepth(localStorage.getItem('depth'));
}

function toDepth(value: string | null) {
  if (!value) return 4;
  const parsed = Number.parseInt(value, 10);
  return parsed >= 1 && parsed <= 6 ? parsed : 4;
}

function getInitialQuery(): string {
  return '';
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

function buildFlatNodeList(nodes: ExplorerNode[], acc: ExplorerNode[] = []): ExplorerNode[] {
  for (const node of nodes) {
    acc.push(node);
    if (node.children) {
      buildFlatNodeList(node.children, acc);
    }
  }
  return acc;
}

function getAutocompleteSuggestions(nodes: ExplorerNode[], q: string): string[] {
  if (!q) return [];
  const lastSlash = q.lastIndexOf('/');
  const searchTerm = lastSlash >= 0 ? q.slice(lastSlash + 1).toLowerCase() : q.toLowerCase();
  const prefix = lastSlash >= 0 ? q.slice(0, lastSlash + 1) : '';

  if (prefix) {
    const dirName = prefix.slice(0, -1);
    const parentNode = nodes.find((n) => n.name === dirName && n.type === 'directory');
    if (!parentNode || !parentNode.children) return [];
    const unique = new Map<string, string>();
    for (const child of parentNode.children) {
      if (child.name.toLowerCase().includes(searchTerm)) {
        unique.set(child.name, prefix + child.name);
      }
    }
    return Array.from(unique.values()).sort().slice(0, 20);
  }

  const unique = new Map<string, string>();
  for (const node of nodes) {
    if (node.name.toLowerCase().includes(searchTerm)) {
      unique.set(node.name, node.name + (node.type === 'directory' ? '/' : ''));
    }
  }
  return Array.from(unique.values()).sort().slice(0, 20);
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
