import { useMantineColorScheme, useMantineTheme } from '@mantine/core';
import ReactECharts from 'echarts-for-react';

export function ExplorerChart({
  nodes,
  view,
  onNavigate
}: {
  nodes: Array<Record<string, unknown>>;
  view: 'treemap' | 'sunburst';
  onNavigate: (path: string) => void;
}) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const textColor = colorScheme === 'dark' ? theme.white : theme.black;
  const mutedText = colorScheme === 'dark' ? theme.colors.gray[4] : theme.colors.gray[7];
  const borderColor = colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3];
  const palette = [
    theme.colors.blue[6],
    theme.colors.cyan[6],
    theme.colors.indigo[6],
    theme.colors.grape[6],
    theme.colors.violet[6],
    theme.colors.gray[6]
  ];

  const series =
    view === 'treemap'
      ? {
          type: 'treemap',
          roam: false,
          breadcrumb: { show: false },
          visibleMin: 300,
          label: { show: true, formatter: '{b}', color: textColor, fontSize: 12 },
          upperLabel: { show: true, height: 28, color: textColor, fontSize: 12 },
          color: palette,
          levels: [
            {
              itemStyle: {
                borderColor,
                borderWidth: 3,
                gapWidth: 3
              }
            },
            {
              itemStyle: {
                borderColor,
                gapWidth: 2
              }
            }
          ],
          data: nodes
        }
      : {
          type: 'sunburst',
          radius: ['18%', '95%'],
          sort: undefined,
          emphasis: { focus: 'ancestor' },
          label: { rotate: 'radial', color: textColor },
          color: palette,
          data: nodes
        };

  return (
    <ReactECharts
      style={{ height: 420 }}
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
        click: (event: { data?: { path?: unknown; type?: unknown } }) => {
          const nextPath = typeof event?.data?.path === 'string' ? event.data.path : null;
          const isDir = event?.data?.type === 'directory';
          if (nextPath && isDir) onNavigate(nextPath);
        }
      }}
    />
  );
}
