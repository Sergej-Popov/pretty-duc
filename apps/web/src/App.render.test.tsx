import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { App } from './App';

mock.module('./api', () => ({
  fetchHealth: () => Promise.resolve({ ok: true, ducAvailable: true, databaseReadable: true, database: '/database/duc.db', root: '/scan/root' }),
  fetchInfo: () => Promise.resolve({ database: '/database/duc.db', raw: 'Date       Time       Files    Dirs    Size Path\n2026-05-04 09:30:00      100      50  1.2G /scan/root', parsed: { entries: 100, dirs: 50, sizeBytes: 1288490188, lastScanAt: '2026-05-04 09:30:00' }, paths: [{ path: '/scan/root', files: 100, dirs: 50, sizeBytes: 1288490188, lastScanAt: '2026-05-04 09:30:00' }] }),
  fetchChildren: () => Promise.resolve({ path: '/scan/root', levels: 2, sort: 'sizeDesc', appliedMinSize: null, truncated: false, totalSizeBytes: 4096, children: [] }),
  fetchTree: () => Promise.resolve({ path: '/scan/root', source: 'duc-json', nodeCount: 0, truncated: false, totalSizeBytes: 4096, children: [] })
}));

describe('App render', () => {
  test('renders app shell on server', () => {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <Notifications />
        <App />
      </MantineProvider>
    );

    expect(html).toContain('Pretty Duc');
    expect(html).toContain('Chart type');
  });
});
