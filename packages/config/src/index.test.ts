import { describe, expect, test } from 'bun:test';
import { normalizeDucPath, parseConfig } from './index';

describe('config', () => {
  test('normalizes and parses defaults', () => {
    const config = parseConfig({});
    expect(config.database).toBe('/database/duc.db');
    expect(config.root).toBe('/scan/root');
    expect(config.mockScanRoot).toBeNull();
    expect(config.defaultMinSize).toBeNull();
  });

  test('parses optional mock root', () => {
    const config = parseConfig({ DUC_MOCK_ROOT: ' ./tests/fixtures/mock-scan-root ' });
    expect(config.mockScanRoot).toBe('./tests/fixtures/mock-scan-root');
  });

  test('rejects invalid min size', () => {
    expect(() => parseConfig({ DEFAULT_MIN_SIZE: 'abc' })).toThrow();
  });

  test('normalizes duplicate separators', () => {
    expect(normalizeDucPath('/scan/root//var/../tmp')).toBe('/scan/root/tmp');
  });
});
