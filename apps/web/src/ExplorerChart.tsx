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
  const series =
    view === 'treemap'
      ? {
          type: 'treemap',
          roam: false,
          breadcrumb: { show: false },
          visibleMin: 300,
          label: { show: true, formatter: '{b}' },
          upperLabel: { show: true, height: 28 },
          levels: [
            {
              itemStyle: {
                borderColor: '#163240',
                borderWidth: 5,
                gapWidth: 5
              }
            },
            {
              itemStyle: {
                borderColor: '#1f5965',
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
          label: { rotate: 'radial' },
          data: nodes
        };

  return (
    <ReactECharts
      style={{ height: 420 }}
      option={{
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        series: [series]
      }}
      onEvents={{
        click: (event: { data?: { path?: unknown } }) => {
          const nextPath = typeof event?.data?.path === 'string' ? event.data.path : null;
          if (nextPath) onNavigate(nextPath);
        }
      }}
    />
  );
}
