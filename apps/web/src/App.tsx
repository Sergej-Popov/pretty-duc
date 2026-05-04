import { useEffect, useMemo, useRef, useState } from 'react';
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
  Kbd,
  Loader,
  Menu,
  Modal,
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
import type { ChildrenResponse, ExplorerNode, SortMode, TreeResponse } from '@pretty-duc/contracts';
import { buildBreadcrumbs, filterNodes, formatBytes, toChartTree } from '@pretty-duc/ui-model';
import { fetchChildren, fetchHealth, fetchInfo, fetchTree, triggerIndex } from './api';
import { ExplorerChart, type ChartColorTheme, type ChartViewMode, type SunburstHighlightMode } from './ExplorerChart';
import { SettingsModal } from './SettingsModal';

type ViewMode = ChartViewMode;
type TableSortMode = 'sizeDesc' | 'sizeAsc' | 'nameAsc' | 'nameDesc' | 'typeAsc' | 'typeDesc';

interface Bookmark {
  path: string;
  label: string;
}

export function App() {
  const [mobileOpened, { toggle }] = useDisclosure();
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);
  const [helpOpened, { open: openHelp, close: closeHelp }] = useDisclosure(false);
  const [useApparentSize, setUseApparentSize] = useState(true);
  const [useExactSizes, setUseExactSizes] = useState(false);
  const [useFileCount, setUseFileCount] = useState(false);
  const [path, setPath] = useState(getInitialPath);
  const [sort, setSort] = useState<TableSortMode>(getInitialSort);
  const [view, setView] = useState<ViewMode>(getInitialView);
  const [chartColorTheme, setChartColorTheme] = useState<ChartColorTheme>(getInitialChartColorTheme);
  const [depth, setDepth] = useState(getInitialDepth);
  const [query, setQuery] = useState(getInitialQuery);
  const [data, setData] = useState<ChildrenResponse | TreeResponse | null>(null);
  const [treeMode, setTreeMode] = useState(false);
  const [health, setHealth] = useState<string>('Checking service');
  const [info, setInfo] = useState<string>('Loading Duc metadata');
  const [rootPath, setRootPath] = useState('/scan/root');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hiddenPaths, setHiddenPaths] = useState<string[]>(getInitialHiddenPaths);
  const [showHiddenItems, setShowHiddenItems] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('showHiddenItems') === 'true' : false);
  const [sunburstRootPath, setSunburstRootPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const [useDecal, setUseDecal] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('useDecal') === 'true' : false);
  const [showLabels, setShowLabels] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('showLabels') !== 'false' : true);
  const [sunburstHighlightMode, setSunburstHighlightMode] = useState<SunburstHighlightMode>(() => {
    if (typeof window === 'undefined') return 'ancestor';
    return (localStorage.getItem('sunburstHighlightMode') as SunburstHighlightMode) || 'ancestor';
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(getInitialBookmarks);
  const [editingBookmark, setEditingBookmark] = useState<string | null>(null);

  const suggestionsRef = useRef<string[]>([]);
  const queryRef = useRef('');
  queryRef.current = query;

  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  const dataRef = useRef(data?.children);
  dataRef.current = data?.children;

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const selectByPathRef = useRef(selectByPath);
  selectByPathRef.current = selectByPath;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    function onNativeKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestionsRef.current.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) =>
          e.key === 'ArrowDown'
            ? Math.min(i + 1, suggestionsRef.current.length - 1)
            : Math.max(i - 1, 0)
        );
      }
      if (e.key === 'Enter' && suggestionsRef.current.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const idx = selectedIndexRef.current;
        const selected = suggestionsRef.current[Math.min(idx, suggestionsRef.current.length - 1)]!;
        const cleanName = selected.endsWith('/') ? selected.slice(0, -1) : selected;
        const found = findNodeByNameInLevel(dataRef.current ?? [], queryRef.current, cleanName);
        if (found) {
          if (found.type === 'directory') {
            setQuery('');
            setSelectedIndex(0);
            navigateRef.current(found.path);
          } else {
            setQuery('');
            setSelectedIndex(0);
            setDropdownOpen(false);
            selectByPathRef.current(found.path);
          }
          return;
        }
        setQuery(selected);
        setSelectedIndex(0);
        setDropdownOpen(true);
      }
      if (e.key === 'Escape') {
        setSelectedIndex(0);
        setDropdownOpen(false);
        inputRef.current?.blur();
      }
    }

    el.addEventListener('keydown', onNativeKeyDown, { capture: true });
    return () => el.removeEventListener('keydown', onNativeKeyDown, { capture: true });
  }, []);

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
    localStorage.setItem('showLabels', String(showLabels));
  }, [showLabels]);

  useEffect(() => {
    localStorage.setItem('hiddenPaths', JSON.stringify(hiddenPaths));
  }, [hiddenPaths]);

  useEffect(() => {
    localStorage.setItem('sunburstHighlightMode', sunburstHighlightMode);
  }, [sunburstHighlightMode]);

  useEffect(() => {
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

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
        const children = await fetchChildren(path, depth, toApiSort(sort), undefined, useApparentSize);

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
  }, [depth, path, sort, useApparentSize]);

  const visibleNodes = useMemo(() => {
    const effectiveQuery = query.includes('/') ? '' : query;
    const filtered = filterNodes(data?.children ?? [], effectiveQuery);
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

    let nodes = toChartTree(chartSourceNodes).map((node) => markHiddenChartNodes(node, hiddenPaths));

    if (view === 'tree' || view === 'tree-radial') {
      const parentName = breadcrumbs[breadcrumbs.length - 1]?.label ?? path;
      nodes = [{
        name: parentName,
        value: data?.totalSizeBytes ?? 0,
        path: path,
        children: nodes
      }];
    }

    return nodes;
  }, [chartSourceNodes, hiddenPaths, sunburstRootNode, view, breadcrumbs, data?.totalSizeBytes, path]);

  const suggestions = useMemo(() => getAutocompleteSuggestions(data?.children ?? [], query), [data?.children, query]);
  suggestionsRef.current = suggestions;

  const contextNode = useMemo(
    () => contextMenu ? findNodeByPath(data?.children ?? [], contextMenu.path) : null,
    [contextMenu, data?.children]
  );

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

  function addBookmark(bookmarkPath: string, bookmarkLabel?: string) {
    setBookmarks(current => {
      if (current.some(b => b.path === bookmarkPath)) return current;
      const crumbs = buildBreadcrumbs(bookmarkPath);
      const label = bookmarkLabel ?? crumbs[crumbs.length - 1]?.label ?? bookmarkPath;
      return [...current, { path: bookmarkPath, label }];
    });
  }

  function removeBookmark(bookmarkPath: string) {
    setBookmarks(current => current.filter(b => b.path !== bookmarkPath));
  }

  function updateBookmarkLabel(bookmarkPath: string, newLabel: string) {
    if (!newLabel.trim()) return;
    setBookmarks(current => current.map(b => b.path === bookmarkPath ? { ...b, label: newLabel.trim() } : b));
    setEditingBookmark(null);
  }

  function navigate(nextPath: string) {
    if (nextPath !== rootPath && !nextPath.startsWith(rootPath + '/')) {
      notifications.show({ message: 'Cannot navigate above root directory', color: 'yellow' });
      return;
    }
    setTreeMode(false);
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

  async function loadTree() {
    setLoading(true);
    setError(null);
    setTreeMode(true);

    try {
      const tree = await fetchTree(path);
      setData(tree);
    } catch (loadError) {
      setTreeMode(false);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load tree');
    } finally {
      setLoading(false);
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

  const isCurrentPathBookmarked = bookmarks.some(b => b.path === path);

  const navStateRef = useRef({ visibleNodes, highlighted, navigate, navigateUp, activeIndex, settingsOpened, helpOpened, contextMenu, useApparentSize, useExactSizes, useFileCount, sort, showHiddenItems, useDecal, showLabels });
  navStateRef.current = { visibleNodes, highlighted, navigate, navigateUp, activeIndex, settingsOpened, helpOpened, contextMenu, useApparentSize, useExactSizes, useFileCount, sort, showHiddenItems, useDecal, showLabels };

  useEffect(() => {
    function onGlobalKeyDown(e: globalThis.KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
        return;
      }

      const state = navStateRef.current;
      if (state.settingsOpened || state.helpOpened || state.contextMenu) {
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        openHelp();
        return;
      }

      if (!state.visibleNodes.length) return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, state.visibleNodes.length - 1));
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (e.key === 'PageDown') {
        e.preventDefault();
        setActiveIndex((current) => Math.min(current + 10, state.visibleNodes.length - 1));
        return;
      }

      if (e.key === 'PageUp') {
        e.preventDefault();
        setActiveIndex((current) => Math.max(current - 10, 0));
        return;
      }

      if (e.key === 'Home' || e.key === '0') {
        e.preventDefault();
        setActiveIndex(0);
        return;
      }

      if (e.key === 'End' || e.key === '$') {
        e.preventDefault();
        setActiveIndex(state.visibleNodes.length - 1);
        return;
      }

      if ((e.key === 'ArrowRight' || e.key === 'Enter') && state.highlighted?.type === 'directory') {
        e.preventDefault();
        state.navigate(state.highlighted.path);
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        state.navigateUp();
        return;
      }

      if (e.key === 'a') {
        e.preventDefault();
        setUseApparentSize((current) => !current);
        notifications.show({ message: state.useApparentSize ? 'Switched to actual disk usage' : 'Switched to apparent size', color: 'dark' });
        return;
      }

      if (e.key === 'b') {
        e.preventDefault();
        setUseExactSizes((current) => !current);
        notifications.show({ message: state.useExactSizes ? 'Switched to abbreviated sizes' : 'Switched to exact sizes', color: 'dark' });
        return;
      }

      if (e.key === 'c') {
        e.preventDefault();
        setUseFileCount((current) => !current);
        notifications.show({ message: state.useFileCount ? 'Switched to file size' : 'Switched to file count', color: 'dark' });
        return;
      }

      if (e.key === 'h') {
        e.preventDefault();
        openHelp();
        return;
      }

      if (e.key === 'n') {
        e.preventDefault();
        setSort((current) => current === 'sizeDesc' ? 'nameAsc' : 'sizeDesc');
        notifications.show({ message: state.sort === 'sizeDesc' ? 'Sorted by name' : 'Sorted by size', color: 'dark' });
        return;
      }

      if (e.key === 'i') {
        e.preventDefault();
        setShowHiddenItems((current) => !current);
        notifications.show({ message: state.showHiddenItems ? 'Hidden items hidden' : 'Showing hidden items', color: 'dark' });
        return;
      }

      if (e.key === 'd') {
        e.preventDefault();
        setUseDecal((current) => !current);
        notifications.show({ message: state.useDecal ? 'Decal pattern disabled' : 'Decal pattern enabled', color: 'dark' });
        return;
      }

      if (e.key === 'l') {
        e.preventDefault();
        setShowLabels((current) => !current);
        notifications.show({ message: state.showLabels ? 'Labels hidden' : 'Labels shown', color: 'dark' });
        return;
      }

      if (e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

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
            <Tooltip label="Settings">
              <ActionIcon
                className="settings-button"
                variant="default"
                radius="sm"
                size="lg"
                onClick={openSettings}
              >
                &#x2699;
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Keyboard shortcuts">
              <ActionIcon
                className="help-button"
                variant="default"
                radius="sm"
                size="lg"
                onClick={openHelp}
              >
                ?
              </ActionIcon>
            </Tooltip>
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
                <Tooltip label="Experimental: loads full recursive tree via duc json. May be slow on large directories." multiline w={220}>
                  <Button
                    className="load-tree-button"
                    variant="subtle"
                    radius="sm"
                    color="yellow"
                    onClick={loadTree}
                    loading={loading && treeMode}
                  >
                    Load whole tree
                  </Button>
                </Tooltip>
                {treeMode ? (
                  <Text size="xs" c="yellow">Tree mode active. Click Refresh listing to return to normal browsing.</Text>
                ) : null}
                <Divider />
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">Re-index</Text>
                <Group gap="xs">
                  <Tooltip label="Runs duc index on the current directory only">
                    <Button
                      variant="subtle"
                      radius="sm"
                      size="compact-sm"
                      onClick={async () => {
                        try {
                          await triggerIndex(path);
                          notifications.show({ message: `Indexing started for current directory`, color: 'green' });
                        } catch {
                          notifications.show({ message: 'Failed to start indexing', color: 'red' });
                        }
                      }}
                    >
                      Current
                    </Button>
                  </Tooltip>
                  <Tooltip label="Runs duc index on the entire scan root. This may take a long time." multiline w={220}>
                    <Button
                      variant="subtle"
                      radius="sm"
                      size="compact-sm"
                      color="orange"
                      onClick={async () => {
                        try {
                          await triggerIndex();
                          notifications.show({ message: `Indexing started for ${rootPath}`, color: 'green' });
                        } catch {
                          notifications.show({ message: 'Failed to start indexing', color: 'red' });
                        }
                      }}
                    >
                      All
                    </Button>
                  </Tooltip>
                </Group>
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
                    { label: 'Circle packing', value: 'circle-packing' },
                    { label: 'Tree', value: 'tree' },
                    { label: 'Radial tree', value: 'tree-radial' }
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
                    onFocus={() => {
                      setDropdownOpen(true);
                    }}
                    onChange={(event) => {
                      setQuery(event.currentTarget.value);
                      setSelectedIndex(0);
                      setDropdownOpen(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setDropdownOpen(false), 150);
                    }}
                  />
                  {dropdownOpen && suggestions.length > 0 && (
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
                          onMouseDown={(e) => {
                            e.preventDefault();
                          }}
                          onClick={() => {
                            const cleanName = suggestion.endsWith('/') ? suggestion.slice(0, -1) : suggestion;
                            const found = findNodeByNameInLevel(data?.children ?? [], query, cleanName);
                            setQuery('');
                            setSelectedIndex(0);
                            setDropdownOpen(false);
                            if (found?.type === 'directory') {
                              navigate(found.path);
                            } else if (found) {
                              selectByPath(found.path);
                            } else {
                              setQuery(suggestion);
                              setDropdownOpen(true);
                            }
                          }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--mantine-color-default-border)',
                            backgroundColor: index === selectedIndex ? 'var(--mantine-color-dark-light)' : 'transparent'
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
                <Switch
                  className="hide-labels-switch"
                  checked={showLabels}
                  onChange={(event) => setShowLabels(event.currentTarget.checked)}
                  label="Show labels"
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
            {bookmarks.length > 0 && (
              <Paper className="bookmarks-panel" withBorder p="md" radius="sm">
                <Stack className="bookmarks-stack" gap="xs">
                  <Text className="bookmarks-panel-title" size="xs" tt="uppercase" fw={700} c="dimmed">Bookmarks</Text>
                  {bookmarks.map(bookmark => (
                    <Group key={bookmark.path} className="bookmark-item" gap="xs" wrap="nowrap">
                      {editingBookmark === bookmark.path ? (
                        <TextInput
                          className="bookmark-edit-input"
                          size="xs"
                          defaultValue={bookmark.label}
                          autoFocus
                          onBlur={(e) => updateBookmarkLabel(bookmark.path, e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') updateBookmarkLabel(bookmark.path, e.currentTarget.value);
                            if (e.key === 'Escape') setEditingBookmark(null);
                          }}
                          style={{ flex: 1 }}
                        />
                      ) : (
                        <Box
                          className="bookmark-info"
                          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                          onClick={() => navigate(bookmark.path)}
                        >
                          <Text className="bookmark-label" size="sm" fw={500} truncate>{bookmark.label}</Text>
                          <Text className="bookmark-path" size="xs" c="dimmed" truncate>{bookmark.path}</Text>
                        </Box>
                      )}
                      <Tooltip label="Edit label">
                        <ActionIcon
                          className="bookmark-edit-button"
                          variant="subtle"
                          size="sm"
                          onClick={() => setEditingBookmark(editingBookmark === bookmark.path ? null : bookmark.path)}
                        >
                          ✎
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Remove bookmark">
                        <ActionIcon
                          className="bookmark-remove-button"
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={() => removeBookmark(bookmark.path)}
                        >
                          ✕
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            )}
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
                <Tooltip label={isCurrentPathBookmarked ? 'Remove bookmark' : 'Bookmark this path'}>
                  <ActionIcon
                    className="bookmark-toggle-button"
                    variant={isCurrentPathBookmarked ? 'filled' : 'default'}
                    color="yellow"
                    size="md"
                    onClick={() => {
                      if (isCurrentPathBookmarked) {
                        removeBookmark(path);
                      } else {
                        addBookmark(path);
                      }
                    }}
                  >
                    {isCurrentPathBookmarked ? '★' : '☆'}
                  </ActionIcon>
                </Tooltip>
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
                <Paper className="chart-panel" withBorder p="xs" radius="sm" h="100%">
                  <Box className="chart-stage">
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
                        hideLabels={!showLabels}
                      />
                  </Box>
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
                <Paper className="directory-listing-panel" withBorder p="md" radius="sm">
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
                                {useFileCount ? 'Count' : useExactSizes ? 'Size (bytes)' : 'Size'}
                                {sort === 'sizeAsc' ? ' ^' : sort === 'sizeDesc' ? ' v' : ''}
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
                              <Table.Td className="directory-table-cell directory-table-cell-size">
                                {useFileCount
                                  ? (node.type === 'file' ? '1' : String(node.children?.length ?? '?'))
                                  : (useExactSizes ? String(node.sizeBytes) : node.humanSize)
                                }
                              </Table.Td>
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
          {contextNode?.type === 'directory' && !bookmarks.some(b => b.path === contextNode.path) ? (
            <Menu.Item className="bookmark-context-item" onClick={() => { addBookmark(contextMenu!.path); setContextMenu(null); }}>
              Bookmark this directory
            </Menu.Item>
          ) : null}
          {contextNode?.type === 'directory' && bookmarks.some(b => b.path === contextNode.path) ? (
            <Menu.Item className="remove-bookmark-context-item" onClick={() => { removeBookmark(contextMenu!.path); setContextMenu(null); }}>
              Remove bookmark
            </Menu.Item>
          ) : null}
          <Menu.Item className="cancel-context-menu-item" onClick={() => setContextMenu(null)}>Cancel</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <SettingsModal opened={settingsOpened} onClose={closeSettings} />
      <Modal opened={helpOpened} onClose={closeHelp} title="Keyboard shortcuts" size="md">
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Key</Table.Th>
              <Table.Th>Action</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr><Table.Td><Kbd>j</Kbd> / <Kbd>↓</Kbd></Table.Td><Table.Td>Move cursor down</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>k</Kbd> / <Kbd>↑</Kbd></Table.Td><Table.Td>Move cursor up</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>PgDn</Kbd></Table.Td><Table.Td>Move cursor down 10 rows</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>PgUp</Kbd></Table.Td><Table.Td>Move cursor up 10 rows</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>Home</Kbd> / <Kbd>0</Kbd></Table.Td><Table.Td>Move cursor to top</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>End</Kbd> / <Kbd>$</Kbd></Table.Td><Table.Td>Move cursor to bottom</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>←</Kbd> / <Kbd>Backspace</Kbd></Table.Td><Table.Td>Go up to parent directory</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>→</Kbd> / <Kbd>Enter</Kbd></Table.Td><Table.Td>Descend into selected directory</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>a</Kbd></Table.Td><Table.Td>Toggle apparent vs actual disk usage</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>b</Kbd></Table.Td><Table.Td>Toggle abbreviated vs exact sizes</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>c</Kbd></Table.Td><Table.Td>Toggle file size vs file count</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>n</Kbd></Table.Td><Table.Td>Toggle sort order (size / name)</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>i</Kbd></Table.Td><Table.Td>Show / hide hidden items</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>d</Kbd></Table.Td><Table.Td>Toggle decal pattern</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>l</Kbd></Table.Td><Table.Td>Toggle chart labels</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>f</Kbd></Table.Td><Table.Td>Focus filter input</Table.Td></Table.Tr>
            <Table.Tr><Table.Td><Kbd>h</Kbd> / <Kbd>?</Kbd></Table.Td><Table.Td>Show this help</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>Type to filter</Table.Td><Table.Td>Filter directory listing by name</Table.Td></Table.Tr>
          </Table.Tbody>
        </Table>
      </Modal>
    </AppShell>
  );
}

function findNodeByNameInLevel(nodes: ExplorerNode[], query: string, name: string): ExplorerNode | null {
  const lastSlash = query.lastIndexOf('/');

  if (lastSlash >= 0) {
    const prefix = query.slice(0, lastSlash + 1);
    const dirName = prefix.slice(0, -1);
    const allNodes = buildFlatNodeList(nodes);
    const parentNode = allNodes.find((n) => n.name === dirName && n.type === 'directory');
    if (!parentNode?.children) return null;
    return parentNode.children.find((n) => n.name === name) ?? null;
  }

  return nodes.find((n) => n.name === name) ?? null;
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

function getInitialHiddenPaths(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem('hiddenPaths');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getInitialChartColorTheme(): ChartColorTheme {
  if (typeof window === 'undefined') {
    return 'ocean';
  }
  return toChartColorTheme(localStorage.getItem('chartColorTheme'));
}

function toViewMode(value: string | null): ViewMode {
  if (value === 'sunburst' || value === 'flame-graph' || value === 'circle-packing' || value === 'tree' || value === 'tree-radial') {
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

function getInitialSort(): TableSortMode {
  if (typeof window === 'undefined') return 'sizeDesc';
  return isTableSortMode(localStorage.getItem('sort')) ? localStorage.getItem('sort') as TableSortMode : 'sizeDesc';
}

function getInitialDepth() {
  if (typeof window === 'undefined') return 2;
  return toDepth(localStorage.getItem('depth'));
}

function toDepth(value: string | null) {
  if (!value) return 2;
  const parsed = Number.parseInt(value, 10);
  return parsed >= 1 && parsed <= 6 ? parsed : 2;
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
  const unique = new Map<string, string>();

  if (!q) {
    for (const node of nodes) {
      unique.set(node.name, node.name + (node.type === 'directory' ? '/' : ''));
    }
    return Array.from(unique.values()).sort().slice(0, 20);
  }

  const lastSlash = q.lastIndexOf('/');
  const searchTerm = lastSlash >= 0 ? q.slice(lastSlash + 1).toLowerCase() : q.toLowerCase();
  const prefix = lastSlash >= 0 ? q.slice(0, lastSlash + 1) : '';

  if (prefix) {
    const dirName = prefix.slice(0, -1);
    const allNodes = buildFlatNodeList(nodes);
    const parentNode = allNodes.find((n) => n.name === dirName && n.type === 'directory');
    if (!parentNode || !parentNode.children) {
      if (!searchTerm) return [];
      for (const node of nodes) {
        if (node.name.toLowerCase().includes(q.toLowerCase())) {
          unique.set(node.name, node.name + (node.type === 'directory' ? '/' : ''));
        }
      }
      return Array.from(unique.values()).sort().slice(0, 20);
    }
    for (const child of parentNode.children) {
      if (!searchTerm || child.name.toLowerCase().includes(searchTerm)) {
        unique.set(child.name, prefix + child.name + (child.type === 'directory' ? '/' : ''));
      }
    }
    return Array.from(unique.values()).sort().slice(0, 20);
  }

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

function getInitialBookmarks(): Bookmark[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('bookmarks');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((b): b is Bookmark => typeof b?.path === 'string' && typeof b?.label === 'string');
  } catch {
    return [];
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
