import path from 'node:path';

export function createMockEnv(cwd = process.cwd()) {
  const fixtureRoot = path.resolve(cwd, 'tests/fixtures/mock-scan-root');

  return {
    DUC_DATABASE: path.resolve(cwd, 'tests/fixtures/mock/duc.db'),
    DUC_MOCK_ROOT: fixtureRoot,
    DUC_ROOT: '/scan/root',
    ENABLE_TREE_API: 'true',
    PORT: '3001'
  };
}
