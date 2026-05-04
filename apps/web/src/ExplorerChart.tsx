import { useMemo } from 'react';
import { ActionIcon, Box, useMantineColorScheme, useMantineTheme } from '@mantine/core';
import ReactECharts from 'echarts-for-react';

export type SunburstHighlightMode = 'ancestor' | 'descendant';
export type ChartViewMode = 'treemap' | 'sunburst' | 'flame-graph' | 'circle-packing' | 'tree' | 'tree-radial';
export type ChartColorTheme = 'ocean' | 'blue-mono' | 'amber-mono' | 'forest' | 'sunset' | 'aurora' | 'candy' | 'terminal' | 'jewel' | 'volcanic' | 'pastel';

export function ExplorerChart({
  nodes,
  view,
  colorTheme,
  sunburstHighlightMode,
  onSelect,
  onContextMenu,
  onChartUp,
  canChartGoUp,
  useDecal,
  hideLabels
}: {
  nodes: Array<Record<string, unknown>>;
  view: ChartViewMode;
  colorTheme: ChartColorTheme;
  sunburstHighlightMode: SunburstHighlightMode;
  onSelect: (path: string) => void;
  onContextMenu: (path: string, position: { x: number; y: number }) => void;
  onChartUp: () => void;
  canChartGoUp: boolean;
  useDecal: boolean;
  hideLabels: boolean;
}) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const textColor = colorScheme === 'dark' ? theme.white : theme.black;
  const borderColor = colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3];
  const palette = getChartPalette(colorTheme, theme);
  const hiddenColor = colorScheme === 'dark' ? theme.colors.gray[7] : theme.colors.gray[5];
  const circlePackingRootColor = getCirclePackingRootColor(colorTheme, colorScheme, theme);
  const tintColor = theme.white;
  const decal = useDecal
    ? {
        symbol: 'rect',
        dashArrayX: [1, 0],
        dashArrayY: [2, 5],
        rotation: -0.35,
        color: 'rgba(255,255,255,0.2)'
      }
    : undefined;
  const styledNodes = useMemo(
    () => applyChartNodeStyles(nodes, { hiddenColor, decal, palette, tintColor }, view),
    [decal, hiddenColor, nodes, palette, tintColor, view]
  );
  const flameData = useMemo(() => toFlameGraphData(styledNodes, palette, decal), [decal, palette, styledNodes]);
  const circleData = useMemo(
    () => toCirclePackingData(styledNodes, palette, circlePackingRootColor, decal),
    [circlePackingRootColor, decal, palette, styledNodes]
  );
  const chartTotal = useMemo(
    () => nodes.reduce((sum, node) => sum + (typeof node.value === 'number' ? node.value : 0), 0),
    [nodes]
  );

  const series = (() => {
    if (view === 'treemap') {
      return {
          type: 'treemap',
          id: 'storage-map',
          roam: false,
          nodeClick: false,
          animationDuration: 250,
          animationDurationUpdate: 350,
          animationEasingUpdate: 'cubicOut',
          universalTransition: true,
          emphasis: { disabled: false },
          breadcrumb: { show: false },
          visibleMin: 300,
          label: { show: !hideLabels, formatter: '{b}', color: textColor, fontSize: 12 },
          upperLabel: { show: !hideLabels, height: 28, color: textColor, fontSize: 12 },
          levels: [
            {
              itemStyle: {
                borderWidth: 3,
                gapWidth: 3
              }
            },
            {
              itemStyle: {
                borderWidth: 2,
                gapWidth: 2
              }
            },
            {
              itemStyle: {
                gapWidth: 1
              }
            }
          ],
          data: styledNodes
        };
    }

    if (view === 'sunburst') {
      return {
          type: 'sunburst',
          id: 'storage-map',
          radius: ['18%', '95%'],
          nodeClick: false,
          animationDuration: 250,
          animationDurationUpdate: 350,
          animationEasingUpdate: 'cubicOut',
          universalTransition: true,
          sort: undefined,
          color: palette,
          emphasis: { focus: sunburstHighlightMode },
          label: { show: !hideLabels, rotate: 'radial', color: textColor },
          ...(decal ? { itemStyle: { decal } } : null),
          data: styledNodes
        };
    }

    if (view === 'tree') {
      return {
        type: 'tree',
        id: 'storage-map',
        layout: 'orthogonal',
        symbol: 'circle',
        symbolSize: 7,
        roam: true,
        expandAndCollapse: true,
        animationDuration: 550,
        animationDurationUpdate: 750,
        universalTransition: true,
        initialTreeDepth: -1,
        emphasis: { focus: 'descendant' },
        top: '1%',
        left: '7%',
        bottom: '1%',
        right: '20%',
        label: {
          position: 'left',
          verticalAlign: 'middle',
          align: 'right',
          color: textColor,
          fontSize: 9,
          show: !hideLabels
        },
        leaves: {
          label: {
            position: 'right',
            verticalAlign: 'middle',
            align: 'left',
            color: textColor,
            fontSize: 9,
            show: !hideLabels
          }
        },
        ...(decal ? { itemStyle: { decal } } : null),
        data: collapseLargeTree(styledNodes)
      };
    }

    if (view === 'tree-radial') {
      return {
        type: 'tree',
        id: 'storage-map',
        layout: 'radial',
        symbol: 'emptyCircle',
        symbolSize: 7,
        roam: true,
        expandAndCollapse: true,
        animationDuration: 550,
        animationDurationUpdate: 750,
        universalTransition: true,
        initialTreeDepth: 3,
        emphasis: { focus: 'descendant' },
        top: '12%',
        bottom: '12%',
        left: '12%',
        right: '12%',
        label: {
          color: textColor,
          fontSize: 9,
          show: !hideLabels
        },
        leaves: {
          label: {
            color: textColor,
            fontSize: 9,
            show: !hideLabels
          }
        },
        ...(decal ? { itemStyle: { decal } } : null),
        data: collapseLargeTree(styledNodes)
      };
    }

    if (view === 'flame-graph') {
      return {
        type: 'custom',
        id: 'storage-map',
        renderItem: (params: unknown, api: any) => renderFlameGraphItem(params, api, decal, hideLabels),
        encode: { x: [1, 2], y: 0 },
        data: flameData.items
      };
    }

    return {
      type: 'custom',
      id: 'storage-map',
      coordinateSystem: 'none',
      renderItem: (params: unknown, api: any) => renderCirclePackingItem(params, api, decal, hideLabels),
      progressive: 0,
      data: circleData
    };
  })();

  const option = {
    backgroundColor: 'transparent',
    textStyle: { color: textColor },
    tooltip: {
      trigger: 'item',
      backgroundColor: colorScheme === 'dark' ? theme.colors.dark[6] : theme.white,
      borderColor,
      textStyle: { color: textColor },
      extraCssText: 'box-shadow:none;',
      formatter: (params: { marker?: string; name?: string; value?: unknown; percent?: unknown; data?: { valueBytes?: unknown; total?: unknown } }) => {
        let name: string;
        let bytes: number;
        let percent: number | undefined;

        if (view === 'flame-graph' && Array.isArray(params.value)) {
          name = String(params.value[3]);
          bytes = Number(params.value[2]) - Number(params.value[1]);
          percent = Number(params.value[4]);
        } else if (view === 'circle-packing') {
          name = params.name ?? '';
          bytes = Number(params.data?.valueBytes ?? 0);
          const total = Number(params.data?.total ?? 0);
          if (total > 0) {
            percent = (bytes / total) * 100;
          }
        } else {
          name = params.name ?? '';
          bytes = typeof params.value === 'number' ? params.value : 0;
          if (chartTotal > 0) {
            percent = (bytes / chartTotal) * 100;
          }
        }

        const marker = params.marker ?? '';
        const sizeStr = formatChartBytes(bytes);
        const percentStr = percent !== undefined ? ` (${percent.toFixed(2)}%)` : '';

        return `${marker} ${name}: ${sizeStr}${percentStr}`;
      }
    },
    ...(view === 'flame-graph'
      ? {
          grid: { left: 0, right: 0, top: 8, bottom: 8, containLabel: false },
          xAxis: { show: false, min: 0, max: flameData.total },
          yAxis: { show: false, min: -0.5, max: flameData.maxLevel + 0.5 }
        }
      : null),
    series: [series]
  };

  return (
    <Box className={`explorer-chart explorer-chart-${view}`} pos="relative">
      <ReactECharts
        className="explorer-chart-echarts"
        style={{ height: 500, width: '100%' }}
        option={option}
        notMerge
        onEvents={{
          click: (event: { data?: { path?: unknown } }) => {
            const nextPath = typeof event?.data?.path === 'string' ? event.data.path : null;
            if (nextPath) onSelect(nextPath);
          },
          contextmenu: (event: { event?: { event?: MouseEvent }; data?: { path?: unknown } }) => {
            const nativeEvent = event?.event?.event;
            nativeEvent?.preventDefault();
            const nextPath = typeof event?.data?.path === 'string' ? event.data.path : null;
            if (nextPath && nativeEvent) {
              onContextMenu(nextPath, { x: nativeEvent.clientX, y: nativeEvent.clientY });
            }
          }
        }}
      />

      {view === 'sunburst' ? (
        <ActionIcon
          className="sunburst-up-button"
          variant="default"
          radius="xl"
          size={46}
          pos="absolute"
          top="50%"
          left="50%"
          style={{ transform: 'translate(-50%, -50%)' }}
          onClick={(event) => {
            event.stopPropagation();
            onChartUp();
          }}
          disabled={!canChartGoUp}
          aria-label="Move one level up"
        >
          /
        </ActionIcon>
      ) : null}
    </Box>
  );
}

function applyChartNodeStyles(
  nodes: Array<Record<string, unknown>>,
  options: { hiddenColor: string; decal?: Record<string, unknown>; palette: string[]; tintColor: string },
  view: ChartViewMode,
  depth = 0,
  branchColor?: string
): Array<Record<string, unknown>> {
  return nodes.map((node, index) => {
    const hidden = Boolean(node.hidden);
    const nodeBranchColor = (view === 'treemap' || view === 'tree' || view === 'tree-radial') && depth === 0
      ? options.palette[index % options.palette.length]
      : branchColor;
    const children = Array.isArray(node.children)
      ? applyChartNodeStyles(node.children as Array<Record<string, unknown>>, options, view, depth + 1, nodeBranchColor)
      : undefined;
    const color = (view === 'treemap' || view === 'tree' || view === 'tree-radial') && nodeBranchColor
      ? getTreemapNodeColor(nodeBranchColor, options.tintColor, depth, index)
      : undefined;
    const itemStyle = hidden || options.decal || color
      ? {
          ...(color ? { color, borderColor: color } : null),
          ...(hidden ? { color: options.hiddenColor, borderColor: options.hiddenColor, opacity: 0.65 } : null),
          ...(options.decal ? { decal: options.decal } : null)
        }
      : undefined;
    const upperLabel = view === 'treemap' && color
      ? { backgroundColor: color }
      : undefined;

    return {
      ...node,
      ...(itemStyle ? { itemStyle } : null),
      ...(upperLabel ? { upperLabel } : null),
      ...(view === 'sunburst' && !hidden ? { emphasis: { itemStyle: { opacity: 1 } } } : null),
      children
    };
  });
}

function toFlameGraphData(nodes: Array<Record<string, unknown>>, palette: string[], decal?: Record<string, unknown>) {
  const total = nodes.reduce((sum, node) => sum + getNodeValue(node), 0);
  const items: Array<Record<string, unknown>> = [];
  let maxLevel = 0;
  let start = 0;

  nodes.forEach((node, index) => {
    const color = palette[index % palette.length] ?? palette[0] ?? '#228be6';
    appendFlameNode(node, 0, start, total, color, items, (level) => {
      maxLevel = Math.max(maxLevel, level);
    }, decal);
    start += getNodeValue(node);
  });

  return { items, maxLevel, total: Math.max(total, 1) };
}

function appendFlameNode(
  node: Record<string, unknown>,
  level: number,
  start: number,
  total: number,
  color: string,
  items: Array<Record<string, unknown>>,
  trackLevel: (level: number) => void,
  decal?: Record<string, unknown>,
  displayValue?: number
) {
  const value = displayValue ?? getNodeValue(node);
  const name = getNodeName(node);
  const children = getNodeChildren(node);
  const nodeColor = getNodeStyleColor(node) ?? color;

  trackLevel(level);
  items.push({
    name,
    path: getNodePath(node),
    value: [level, start, start + value, name, total > 0 ? (value / total) * 100 : 0],
    itemStyle: { color: nodeColor, ...(decal ? { decal } : null) }
  });

  let childStart = 0;
  const childTotal = children.reduce((sum, child) => sum + getNodeValue(child), 0);
  const childScale = childTotal > 0 ? (value * 0.9) / childTotal : 0;
  const childOffset = value * 0.05;
  children.forEach((child, index) => {
    const childWidth = getNodeValue(child) * childScale;
    appendFlameNode(child, level + 1, start + childOffset + childStart, total, getTreemapNodeColor(nodeColor, '#ffffff', level + 1, index), items, trackLevel, decal, childWidth);
    childStart += childWidth;
  });
}

function renderFlameGraphItem(_params: unknown, api: any, decal?: Record<string, unknown>, hideLabels?: boolean) {
  const level = api.value(0);
  const start = api.coord([api.value(1), level]);
  const end = api.coord([api.value(2), level]);
  const height = (api.size?.([0, 1]) ?? [0, 22])[1];
  const width = Math.max(0, end[0] - start[0]);
  const style = api.style();
  style.fill = api.visual('color');
  if (decal) {
    style.decal = decal;
  }

  return {
    type: 'rect',
    shape: {
      x: start[0],
      y: start[1] - height / 2,
      width,
      height: Math.max(1, height - 2),
      r: 2
    },
    style,
    emphasis: { style: { stroke: '#000', lineWidth: 1 } },
    textConfig: { position: 'insideLeft' },
    ...(!hideLabels ? {
      textContent: {
        style: {
          text: api.value(3),
          fill: '#111',
          width: Math.max(0, width - 6),
          overflow: 'truncate',
          ellipsis: '..',
          fontSize: 11
        }
      }
    } : null)
  };
}

function toCirclePackingData(nodes: Array<Record<string, unknown>>, palette: string[], rootColor: string, decal?: Record<string, unknown>) {
  const items: Array<Record<string, unknown>> = [];
  const total = nodes.reduce((sum, node) => sum + getNodeValue(node), 0);
  items.push({
    name: '',
    path: '',
    value: [50, 50, 49, 0, ''],
    valueBytes: total,
    total,
    itemStyle: {
      color: rootColor,
      borderColor: palette[0] ?? '#228be6',
      borderWidth: 2,
      ...(decal ? { decal } : null)
    },
    silent: true
  });

  const roots = placeChildCircles(nodes, 50, 50, 47);

  roots.forEach((placed, index) => {
    const color = palette[index % palette.length] ?? palette[0] ?? '#228be6';
    appendCircleNode(placed.node, placed.x, placed.y, placed.radius, 1, color, items, total, decal);
  });

  return items;
}

function appendCircleNode(
  node: Record<string, unknown>,
  x: number,
  y: number,
  radius: number,
  depth: number,
  color: string,
  items: Array<Record<string, unknown>>,
  total: number,
  decal?: Record<string, unknown>
) {
  const children = getNodeChildren(node);
  const nodeColor = getNodeStyleColor(node) ?? color;

  items.push({
    name: getNodeName(node),
    path: getNodePath(node),
    value: [x, y, radius, depth, getNodeName(node)],
    valueBytes: getNodeValue(node),
    total,
    itemStyle: { color: nodeColor, ...(decal ? { decal } : null) }
  });

  if (!children.length || radius < 8) {
    return;
  }

  const placedChildren = placeChildCircles(children, x, y, radius - 2);

  placedChildren.forEach((child, index) => {
    appendCircleNode(
      child.node,
      child.x,
      child.y,
      child.radius,
      depth + 1,
      getTreemapNodeColor(nodeColor, '#ffffff', depth + 1, index),
      items,
      total,
      decal
    );
  });
}

function placeChildCircles(nodes: Array<Record<string, unknown>>, centerX: number, centerY: number, parentRadius: number) {
  if (!nodes.length || parentRadius <= 0) {
    return [];
  }

  const total = nodes.reduce((sum, node) => sum + getNodeValue(node), 0);
  const sorted = [...nodes].sort((left, right) => getNodeValue(right) - getNodeValue(left));
  const maxChildRadius = parentRadius * (sorted.length === 1 ? 0.92 : 0.45);
  const minChildRadius = Math.max(1.6, parentRadius * 0.08);

  return sorted.map((node, index) => {
    const share = total > 0 ? getNodeValue(node) / total : 1 / sorted.length;
    const radius = Math.min(maxChildRadius, Math.max(minChildRadius, parentRadius * 0.9 * Math.sqrt(share)));

    if (sorted.length === 1) {
      return { node, x: centerX, y: centerY, radius };
    }

    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / sorted.length;
    const ringRadius = Math.max(0, parentRadius - radius - 1.5);

    return {
      node,
      x: centerX + Math.cos(angle) * ringRadius,
      y: centerY + Math.sin(angle) * ringRadius,
      radius
    };
  });
}

function renderCirclePackingItem(_params: unknown, api: any, decal?: Record<string, unknown>, hideLabels?: boolean) {
  const width = api.getWidth();
  const height = api.getHeight();
  const size = Math.min(width, height);
  const left = (width - size) / 2;
  const top = (height - size) / 2;
  const x = left + (api.value(0) / 100) * size;
  const y = top + (api.value(1) / 100) * size;
  const radius = (api.value(2) / 100) * size;
  const depth = Number(api.value(3));
  const label = String(api.value(4) ?? '');
  const style = api.style();
  style.fill = api.visual('color');
  style.opacity = depth === 0 ? 1 : depth === 1 ? 0.82 : 0.9;
  if (decal) {
    style.decal = decal;
  }

  return {
    type: 'circle',
    shape: { cx: x, cy: y, r: radius },
    z2: depth * 2,
    style,
    emphasis: { style: { shadowBlur: 16, shadowColor: 'rgba(0,0,0,0.25)', lineWidth: 2, stroke: '#111' } },
    textConfig: { position: 'inside' },
    ...(!hideLabels ? {
      textContent: {
        style: {
          text: radius > 14 ? label : '',
          width: radius * 1.4,
          overflow: 'truncate',
          fontSize: Math.max(9, Math.min(14, radius / 3)),
          fill: '#111'
        }
      }
    } : null)
  };
}

function getNodeChildren(node: Record<string, unknown>) {
  return Array.isArray(node.children) ? node.children as Array<Record<string, unknown>> : [];
}

function getNodeName(node: Record<string, unknown>) {
  return typeof node.name === 'string' ? node.name : '';
}

function getNodePath(node: Record<string, unknown>) {
  return typeof node.path === 'string' ? node.path : '';
}

function getNodeValue(node: Record<string, unknown>) {
  const value = typeof node.value === 'number' ? node.value : 0;
  return Math.max(0, value);
}

function getNodeStyleColor(node: Record<string, unknown>) {
  const itemStyle = node.itemStyle;
  if (!itemStyle || typeof itemStyle !== 'object' || Array.isArray(itemStyle)) {
    return null;
  }

  const color = (itemStyle as Record<string, unknown>).color;
  return typeof color === 'string' ? color : null;
}

function formatChartBytes(size: number) {
  if (size < 1024) return `${Math.round(size)} B`;

  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = size;
  let unitIndex = -1;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex] ?? 'B'}`;
}

function getTreemapNodeColor(baseColor: string, tintColor: string, depth: number, siblingIndex: number) {
  if (depth === 0) {
    return baseColor;
  }

  const tintAmount = Math.min(0.5, 0.1 + depth * 0.1 + (siblingIndex % 4) * 0.05);
  return mixHexColors(baseColor, tintColor, tintAmount);
}

function mixHexColors(from: string, to: string, amount: number) {
  const left = parseHexColor(from);
  const right = parseHexColor(to);

  if (!left || !right) {
    return from;
  }

  const mixChannel = (channel: 'r' | 'g' | 'b') => Math.round(left[channel] + (right[channel] - left[channel]) * amount);
  return `#${toHex(mixChannel('r'))}${toHex(mixChannel('g'))}${toHex(mixChannel('b'))}`;
}

function parseHexColor(color: string) {
  const normalized = color.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized;

  if (!/^[\da-f]{6}$/i.test(expanded)) {
    return null;
  }

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16)
  };
}

function toHex(value: number) {
  return value.toString(16).padStart(2, '0');
}

function collapseLargeTree(nodes: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  if (nodes.length <= 6) return nodes;
  return nodes.map((node, index) => ({
    ...node,
    ...(index % 2 === 0 ? { collapsed: true } : {})
  }));
}

function getChartPalette(colorTheme: ChartColorTheme, theme: ReturnType<typeof useMantineTheme>) {
  switch (colorTheme) {
    case 'blue-mono':
      return [theme.colors.blue[8], theme.colors.blue[7], theme.colors.blue[6], theme.colors.blue[5], theme.colors.blue[4], theme.colors.cyan[5]];
    case 'amber-mono':
      return [theme.colors.orange[8], theme.colors.orange[7], theme.colors.yellow[7], theme.colors.yellow[6], theme.colors.orange[5], theme.colors.red[5]];
    case 'forest':
      return ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#B7E4C7'];
    case 'sunset':
      return ['#2B1055', '#571089', '#9A208C', '#E11299', '#FF6D28', '#FCE700', '#FFB84C'];
    case 'aurora':
      return ['#172A3A', '#004346', '#09BC8A', '#75DDDD', '#B8F2E6', '#DDFBD2', '#F2F3AE'];
    case 'candy':
      return ['#FF70A6', '#FF9770', '#FFD670', '#E9FF70', '#70D6FF', '#B388EB', '#F7A8B8'];
    case 'terminal':
      return ['#0B3D20', '#116530', '#21A179', '#00D084', '#7CFF6B', '#C6FF00', '#E8FFB7'];
    case 'jewel':
      return ['#0B132B', '#3A0CA3', '#4361EE', '#4CC9F0', '#2EC4B6', '#FF9F1C', '#E71D36'];
    case 'volcanic':
      return ['#140F0F', '#4A0F0F', '#8A1C0F', '#C73E1D', '#FF6B35', '#FFB627', '#FFE66D'];
    case 'pastel':
      return ['#A0C4FF', '#BDB2FF', '#FFC6FF', '#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF'];
    case 'ocean':
      return [
        theme.colors.blue[6],
        theme.colors.blue[4],
        theme.colors.cyan[6],
        theme.colors.cyan[4],
        theme.colors.indigo[6],
        theme.colors.indigo[4],
        theme.colors.grape[6],
        theme.colors.grape[4],
        theme.colors.violet[6],
        theme.colors.violet[4],
        theme.colors.teal[6],
        theme.colors.teal[4],
        theme.colors.lime[5],
        theme.colors.orange[5]
      ];
  }
}

function getCirclePackingRootColor(colorTheme: ChartColorTheme, colorScheme: 'light' | 'dark' | 'auto', theme: ReturnType<typeof useMantineTheme>) {
  if (colorScheme === 'dark') {
    switch (colorTheme) {
      case 'amber-mono':
      case 'sunset':
        return '#4A2505';
      case 'forest':
      case 'terminal':
        return '#0B2A1A';
      case 'candy':
        return '#3A1538';
      case 'jewel':
        return '#151A3A';
      case 'volcanic':
        return '#2A1008';
      case 'pastel':
        return '#2D2438';
      case 'aurora':
        return '#062D2F';
      case 'blue-mono':
      case 'ocean':
        return theme.colors.blue[9];
    }
  }

  switch (colorTheme) {
    case 'amber-mono':
    case 'sunset':
      return '#FFF3BF';
    case 'forest':
    case 'terminal':
      return '#D8F3DC';
    case 'candy':
      return '#FFE3EC';
    case 'jewel':
      return '#E7F5FF';
    case 'volcanic':
      return '#FFE8CC';
    case 'pastel':
      return '#F8F0FC';
    case 'aurora':
      return '#D7FAF4';
    case 'blue-mono':
    case 'ocean':
      return theme.colors.blue[0];
  }
}
