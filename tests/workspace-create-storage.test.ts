import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

if (process.env.KORY_WORKSPACE_STORAGE_CHILD !== '1') {
  test('workspace review Keychain entries retain long Unicode drafts and fail closed', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_WORKSPACE_STORAGE_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Workspace storage tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  const disk = new Map<string, string>();
  let failWriteAt = -1;
  let writeCount = 0;
  let failDeleteAt = -1;
  let deleteCount = 0;
  mock.module('expo-secure-store', () => ({
    getItemAsync: async (key: string) => disk.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      writeCount++;
      if (writeCount === failWriteAt) throw new Error('Keychain write rejected');
      if (Buffer.byteLength(value, 'utf8') > 2048) throw new Error('Keychain entry too large');
      disk.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      deleteCount++;
      if (deleteCount === failDeleteAt) throw new Error('Keychain delete rejected');
      disk.delete(key);
    },
  }));
  const { workspaceCreationReviewStorage: storage } = await import('../src/control/workspaceCreationReviewStorage');

  test('short draft uses one key and survives load and clear', async () => {
    const key = 'short-host\u0000goal';
    const review = { label: 'Create goal: Check connectivity' };
    await storage.save(key, review);
    expect(disk.size).toBe(1);
    expect(await storage.load(key)).toEqual(review);
    await storage.clear(key);
    expect(await storage.load(key)).toBeNull();
  });

  test('long multi-byte drafts are chunked into entries below the iOS Keychain limit', async () => {
    const key = 'long-host\u0000goal';
    const review = { label: `Create goal: ${'🎼mañana'.repeat(275)}` };
    await storage.save(key, review);
    expect(disk.size).toBeGreaterThan(3);
    for (const [storageKey, value] of disk) {
      expect(Buffer.byteLength(value, 'utf8')).toBeLessThanOrEqual(1200);
      expect(storageKey).not.toContain('long-host');
    }
    expect(await storage.load(key)).toEqual(review);
    await storage.clear(key);
    expect(disk.size).toBe(0);
  });

  test('a failed middle chunk write never publishes a valid saved creation review', async () => {
    const key = 'partial-host\u0000checklist';
    const review = { label: `Create checklist: ${'🧩'.repeat(450)}` };
    const before = writeCount;
    failWriteAt = before + 2;
    await expect(storage.save(key, review)).rejects.toThrow('Keychain write rejected');
    expect(await storage.load(key)).toBeNull();
    failWriteAt = -1;
    await storage.save(key, review);
    expect(await storage.load(key)).toEqual(review);
    await storage.clear(key);
    expect(disk.size).toBe(0);
  });

  test('a missing chunk or failed delete does not impersonate a cleared review', async () => {
    const key = 'damaged-host\u0000goal';
    const review = { label: `Create goal: ${'🍀'.repeat(420)}` };
    await storage.save(key, review);
    const anyChunk = [...disk.keys()].find((savedKey) => savedKey.endsWith('.1'));
    expect(anyChunk).toBeDefined();
    disk.delete(anyChunk!);
    await expect(storage.load(key)).rejects.toThrow('incomplete');
    await storage.save(key, review);
    expect(await storage.load(key)).toEqual(review);
    failDeleteAt = deleteCount + 2;
    await expect(storage.clear(key)).rejects.toThrow('Keychain delete rejected');
    expect([...disk.values()].some((value) => value.includes('workspaceCreationChunks'))).toBe(true);
    failDeleteAt = -1;
    await storage.clear(key);
    expect(disk.size).toBe(0);
  });
}
