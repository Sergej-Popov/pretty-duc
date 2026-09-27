import path from 'node:path';

// MOCK_SCAN_ROOT and MOCK_DATA_DIR switch the mock stack to another dataset,
// such as the generated demo data (see generate-demo-data.ts).
export function createMockEnv(cwd = process.cwd()) {
  const fixtureRoot = path.resolve(cwd, process.env.MOCK_SCAN_ROOT ?? 'tests/fixtures/mock-scan-root');
  const dataDir = process.env.MOCK_DATA_DIR ? path.resolve(cwd, process.env.MOCK_DATA_DIR) : undefined;

  return {
    DUC_DATABASE: path.resolve(cwd, 'tests/fixtures/mock/duc.db'),
    DUC_MOCK_ROOT: fixtureRoot,
    DUC_ROOT: '/scan/root',
    ENABLE_TREE_API: 'true',
    PORT: '3001',
    ...(dataDir ? { DATA_DIR: dataDir, CONFIG_FILE: path.join(dataDir, 'pretty-duc-config.json') } : {})
  };
}
