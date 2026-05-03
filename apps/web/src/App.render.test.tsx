import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { App } from './App';

mock.module('./api', () => ({
  fetchHealth: () => Promise.resolve({ ok: true, ducAvailable: true, databaseReadable: true, database: '/database/duc.db', root: '/scan/root' }),
  fetchInfo: () => Promise.resolve({ database: '/database/duc.db', raw: 'indexed ok', parsed: { entries: null, sizeBytes: null, lastScanAt: null } }),
  fetchChildren: () => Promise.resolve({ path: '/scan/root', levels: 2, sort: 'sizeDesc', appliedMinSize: null, truncated: false, totalSizeBytes: 4096, children: [] }),
  fetchTree: () => Promise.resolve({ path: '/scan/root', source: 'duc-ls-recursive', levels: 2, nodeCount: 0, truncated: false, totalSizeBytes: 4096, children: [] })
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
    expect(html).toContain('Largest items');
  });
});
