import { describe, expect, test } from 'bun:test';
import { parseDucLsOutput } from './parser';
import { resolveRequestedPath } from './path-policy';

describe('duc parser', () => {
  test('parses bytes and classification output', () => {
    const children = parseDucLsOutput('4096 var/\n1024 readme.txt\n2048 exec*\n512 link@\n', '/scan/root', null);
    expect(children).toHaveLength(4);
    expect(children[0]?.type).toBe('directory');
    expect(children[0]?.name).toBe('var');
    expect(children[1]?.name).toBe('readme.txt');
    expect(children[2]?.name).toBe('exec');
    expect(children[2]?.type).toBe('file');
    expect(children[3]?.name).toBe('link');
    expect(children[3]?.type).toBe('file');
  });

  test('rejects outside root paths', () => {
    expect(() => resolveRequestedPath('/scan/root', '/etc')).toThrow();
  });
});
