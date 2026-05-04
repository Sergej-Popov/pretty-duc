import { useMemo } from 'react';
import { ActionIcon, Box, useMantineColorScheme, useMantineTheme } from '@mantine/core';
import ReactECharts from 'echarts-for-react';

export type SunburstHighlightMode = 'ancestor' | 'descendant';

export function ExplorerChart({
  nodes,
  view,
  sunburstHighlightMode,
  onSelect,
  onContextMenu,
  onChartUp,
  canChartGoUp,
  useDecal
}: {
  nodes: Array<Record<string, unknown>>;
  view: 'treemap' | 'sunburst';
  sunburstHighlightMode: SunburstHighlightMode;
  onSelect: (path: string) => void;
  onContextMenu: (path: string, position: { x: number; y: number }) => void;
  onChartUp: () => void;
  canChartGoUp: boolean;
  useDecal: boolean;
}) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const textColor = colorScheme === 'dark' ? theme.white : theme.black;
  const borderColor = colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3];
  const palette = [
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
  const hiddenColor = colorScheme === 'dark' ? theme.colors.gray[7] : theme.colors.gray[5];
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

  const series =
    view === 'treemap'
      ? {
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
          label: { show: true, formatter: '{b}', color: textColor, fontSize: 12 },
          upperLabel: { show: true, height: 28, color: textColor, fontSize: 12 },
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
        }
      : {
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
          label: { rotate: 'radial', color: textColor },
          ...(decal ? { itemStyle: { decal } } : null),
          data: styledNodes
        };

  return (
    <Box pos="relative">
      <ReactECharts
        style={{ height: 420, width: '100%' }}
        option={{
          backgroundColor: 'transparent',
          textStyle: { color: textColor },
          tooltip: {
            trigger: 'item',
            backgroundColor: colorScheme === 'dark' ? theme.colors.dark[6] : theme.white,
            borderColor,
            textStyle: { color: textColor },
            extraCssText: 'box-shadow:none;'
          },
          series: [series]
        }}
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
  view: 'treemap' | 'sunburst',
  depth = 0,
  branchColor?: string
): Array<Record<string, unknown>> {
  return nodes.map((node, index) => {
    const hidden = Boolean(node.hidden);
    const nodeBranchColor = view === 'treemap' && depth === 0
      ? options.palette[index % options.palette.length]
      : branchColor;
    const children = Array.isArray(node.children)
      ? applyChartNodeStyles(node.children as Array<Record<string, unknown>>, options, view, depth + 1, nodeBranchColor)
      : undefined;
    const color = view === 'treemap' && nodeBranchColor
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
