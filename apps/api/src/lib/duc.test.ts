import { describe, expect, test } from 'bun:test';
import { getTreeJson, type DucExecutor } from './duc';

describe('getTreeJson', () => {
  function makeConfig(overrides: Record<string, unknown> = {}) {
    return {
      database: '/test/duc.db',
      root: '/scan/root',
      port: 3000,
      ducBin: 'duc',
      mockScanRoot: null,
      configFilePath: '/test/config.json',
      enableTreeApi: true,
      defaultMinSize: null,
      limits: {
        ducTimeoutMs: 10000,
        recursiveBudgetMs: 30000,
        defaultLevels: 2,
        maxChildrenLevels: 4,
        maxTreeLevels: 2,
        maxChildrenPerDirectory: 100,
        maxRecursiveNodes: 1000,
        maxTreeNodes: 500,
        maxChildrenResponseBytes: 10485760,
        maxTreeResponseBytes: 10485760,
        recursiveConcurrency: 2
      },
      ...overrides
    };
  }

  test('calls duc json with only database flag, not a bogus depth argument', async () => {
    const calls: Array<{ args: string[]; timeoutMs: number }> = [];
    const spyExecutor: DucExecutor = async (args, timeoutMs) => {
      calls.push({ args, timeoutMs });
      return { stdout: '[]\n', stderr: '' };
    };

    await getTreeJson({
      config: makeConfig(),
      path: '/scan/root/media',
      executor: spyExecutor
    });

    expect(calls.length).toBe(1);
    const args = calls[0].args;

    // Should NOT pass depth as a CLI flag (duc json doesn't support it)
    const dFlagCount = args.filter((a) => a === '-d').length;
    expect(dFlagCount).toBe(1);

    // Should contain the database path after -d
    const dbIndex = args.indexOf('-d');
    expect(dbIndex).not.toBe(-1);
    expect(args[dbIndex + 1]).toBe('/test/duc.db');

    // Should contain -- separator and the path
    const sepIndex = args.indexOf('--');
    expect(sepIndex).not.toBe(-1);
    expect(args[sepIndex + 1]).toBe('/scan/root/media');
  });
});
