import { describe, expect, test } from 'bun:test';
import { parseDucLsOutput } from './parser';
import { resolveRequestedPath } from './path-policy';

describe('duc parser', () => {
  test('parses bytes and classification output', () => {
    const children = parseDucLsOutput('4096 var/\n1024 readme.txt\n', '/scan/root', null);
    expect(children).toHaveLength(2);
    expect(children[0]?.type).toBe('directory');
    expect(children[0]?.path).toBe('/scan/root/var');
  });

  test('rejects outside root paths', () => {
    expect(() => resolveRequestedPath('/scan/root', '/etc')).toThrow();
  });
});
