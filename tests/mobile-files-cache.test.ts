import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

// Keep native-module mocks isolated from the other Bun React Native suites.
if (!process.env.KORY_MOBILE_FILES_CHILD) {
  test('native file export and preview cache safety', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_MOBILE_FILES_CHILD: '1' },
      encoding: 'utf8',
      timeout: 25_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Native files failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 30_000);
} else {
  const writes = new Map<string, string | Uint8Array>();
  const shares: { uri: string; options: { dialogTitle?: string } }[] = [];
  const createdDirectories: string[] = [];
  class Directory {
    uri: string;
    constructor(...parts: (string | Directory)[]) {
      this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');
    }
    create() { createdDirectories.push(this.uri); }
  }
  class File {
    uri: string;
    constructor(...parts: (string | Directory)[]) {
      this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');
    }
    write(value: string | Uint8Array) { writes.set(this.uri, value); }
  }
  mock.module('expo-file-system', () => ({ File, Directory, Paths: { cache: 'file:///cache' } }));
  mock.module('expo-document-picker', () => ({ getDocumentAsync: async () => ({ canceled: true }) }));
  mock.module('expo-sharing', () => ({
    isAvailableAsync: async () => true,
    shareAsync: async (uri: string, options: { dialogTitle?: string }) => { shares.push({ uri, options }); },
  }));
  const { shareTextFile, shareBytesFile, cacheBase64File, shareBase64File } =
    await import('../src/native/mobileFiles');

  test('concurrent same-name exports preserve each payload and original file name', async () => {
    const [first, second] = await Promise.all([
      shareTextFile('usage.csv', 'first export', 'text/csv'),
      shareTextFile('usage.csv', 'second export', 'text/csv'),
    ]);
    expect(first).not.toBe(second);
    expect(first).toEndWith('/usage.csv');
    expect(second).toEndWith('/usage.csv');
    expect(writes.get(first)).toBe('first export');
    expect(writes.get(second)).toBe('second export');
    expect(shares.slice(-2).map((share) => share.options.dialogTitle)).toEqual(['usage.csv', 'usage.csv']);
  });

  test('preview cache and share use isolated files for an identical suggested name', async () => {
    const before = cacheBase64File('image.png', 'Zmlyc3Q=');
    const after = await shareBase64File('image.png', 'c2Vjb25k', 'image/png');
    expect(after).not.toBe(before);
    expect(writes.get(before)).toBe('Zmlyc3Q=');
    expect(writes.get(after)).toBe('c2Vjb25k');
  });

  test('untrusted path-like names cannot escape the cache or create reserved file names', async () => {
    const invalid = await shareBytesFile('..', new Uint8Array([1, 2]), 'application/octet-stream');
    const traversal = await shareTextFile('../../private/report.csv', 'clean', 'text/csv');
    for (const path of [invalid, traversal]) {
      expect(path.startsWith('file:///cache/')).toBe(true);
      expect(path.split('/').slice(3)).not.toContain('..');
      expect(path).not.toEndWith('/..');
    }
    expect(createdDirectories.length).toBeGreaterThan(0);
  });

  test('long user titles retain their export extension', async () => {
    const longTitle = `${'very-long-note-'.repeat(15)}.md`;
    const uri = await shareTextFile(longTitle, '# note', 'text/markdown');
    expect(uri).toEndWith('.md');
    expect(uri.split('/').at(-1)!.length).toBeLessThanOrEqual(140);
    expect(writes.get(uri)).toBe('# note');
  });
}
