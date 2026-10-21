import { expect, test } from 'bun:test';

import { ProcessInputDraftStore, processInputDraftKey, type ProcessDraftPersistence } from '../src/control/processInputDrafts';
import { openProcessDrafts, sealProcessDrafts } from '../src/control/processDraftCrypto';

const key = processInputDraftKey('host-a', 'process-1');
const waitReady = async (store: ProcessInputDraftStore) => {
  await store.whenReady();
  expect(store.isReady()).toBe(true);
};

function memoryStorage(): ProcessDraftPersistence & { raw: string | null } {
  return {
    durable: true,
    raw: null,
    async load() { return this.raw; },
    async save(contents) { this.raw = contents; },
  };
}

test('encrypted process draft envelope is authenticated, versioned and tamper resistant', () => {
  const secret = new Uint8Array(32).fill(0x39);
  const nonce = new Uint8Array(12).fill(0x14);
  const data = sealProcessDrafts(secret, nonce, 'private stdin');
  expect(new TextDecoder().decode(data)).not.toContain('private stdin');
  expect(openProcessDrafts(secret, data)).toBe('private stdin');
  data[data.length - 1] ^= 1;
  expect(() => openProcessDrafts(secret, data)).toThrow();
  expect(() => openProcessDrafts(new Uint8Array(32).fill(0x22), data)).toThrow();
});

test('cold restart restores process stdin and host-owned launcher without sending them', async () => {
  const persistence = memoryStorage();
  const first = new ProcessInputDraftStore(persistence);
  await waitReady(first);
  first.edit(key, 'unsent private command');
  first.editLauncherCommand('host-a', 'echo never auto-run');
  first.editLauncherName('keep this name');
  await first.flush();
  const restored = new ProcessInputDraftStore(persistence);
  await waitReady(restored);
  expect(restored.snapshot().drafts[key].text).toBe('unsent private command');
  expect(restored.snapshot().launcher).toMatchObject({ owner: 'host-a', command: 'echo never auto-run', name: 'keep this name' });
  expect(restored.snapshot().pendingStarts).toEqual([]);
  expect(restored.snapshot().pendingInputs).toEqual([]);
  restored.edit(processInputDraftKey('host-b', 'process-1'), 'another host');
  await restored.flush();
  expect((await new ProcessInputDraftStore(persistence).whenReady()) === undefined).toBe(true);
});

test('cold restart marks in-flight input, process control, start and cleanup uncertain', async () => {
  const persistence = memoryStorage();
  const store = new ProcessInputDraftStore(persistence);
  await waitReady(store);
  store.edit(key, 'unsafe to retry');
  store.editLauncherCommand('host-a', 'echo maybe executed');
  store.beginInput(key);
  store.beginControl(key);
  store.beginStart('host-a');
  store.beginCleanup('host-a');
  await store.flush();
  const fresh = new ProcessInputDraftStore(persistence);
  await waitReady(fresh);
  expect(fresh.snapshot().pendingInputs).toEqual([]);
  expect(fresh.snapshot().pendingControls).toEqual([]);
  expect(fresh.snapshot().pendingStarts).toEqual([]);
  expect(fresh.snapshot().pendingCleanups).toEqual([]);
  expect(fresh.snapshot().inputFeedback[key].message).toContain('Check the host');
  expect(fresh.snapshot().controlFeedback[key].message).toContain('Check the host');
  expect(fresh.snapshot().startFeedback['host-a'].message).toContain('Check the host');
  expect(fresh.snapshot().cleanupFeedback['host-a'].message).toContain('Check the host');
  expect(fresh.snapshot().drafts[key].text).toBe('unsafe to retry');
  expect(fresh.snapshot().launcher.command).toBe('echo maybe executed');
});

test('corrupt or unavailable persisted drafts are never overwritten by editing', async () => {
  const persistence = memoryStorage();
  persistence.raw = '{"version":11,"drafts":[]}';
  const store = new ProcessInputDraftStore(persistence);
  await store.whenReady();
  expect(store.isReady()).toBe(false);
  expect(store.getRecoveryError()).toBeTruthy();
  expect(store.beginStart('host-a')).toBeNull();
  store.edit(key, 'should be rejected');
  await expect(store.flush()).rejects.toThrow();
  expect(persistence.raw).toBe('{"version":11,"drafts":[]}');
  persistence.raw = null;
  store.retryLoad();
  await waitReady(store);
  store.edit(key, 'new safe draft');
  await store.flush();
  expect(persistence.raw).toContain('new safe draft');
});

test('stale asynchronous save never replaces a newer edit or clears A to B to A input', async () => {
  const persistence = memoryStorage();
  let release!: () => void;
  let block = false;
  const adapter: ProcessDraftPersistence = {
    ...persistence,
    load: () => persistence.load(),
    save: async (value) => {
      if (block) await new Promise<void>((resolve) => { release = resolve; });
      await persistence.save(value);
    },
  };
  const store = new ProcessInputDraftStore(adapter);
  await waitReady(store);
  store.edit(key, 'first');
  block = true;
  const pending = store.flush();
  for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
  expect(release).toBeDefined();
  store.edit(key, 'second');
  block = false;
  release();
  await pending;
  // The flush that callers await must include edits made during the first write.
  expect(persistence.raw).toContain('second');
  const restored = new ProcessInputDraftStore(persistence);
  await waitReady(restored);
  expect(restored.snapshot().drafts[key].text).toBe('second');
  const generation = restored.beginInput(key)!;
  const submitted = restored.snapshot().drafts[key];
  restored.edit(key, 'third');
  restored.confirm(key, submitted, generation);
  expect(restored.snapshot().drafts[key].text).toBe('third');
});

test('write failures remain visible and preserve unsent work for retry', async () => {
  const persistence = memoryStorage();
  let fail = true;
  const adapter: ProcessDraftPersistence = {
    durable: true, load: () => persistence.load(),
    save: async (contents) => {
      if (fail) throw new Error('device storage full');
      await persistence.save(contents);
    },
  };
  const store = new ProcessInputDraftStore(adapter);
  await waitReady(store);
  store.edit(key, 'keep me');
  await expect(store.flush()).rejects.toThrow('device storage full');
  expect(store.getPersistenceError()).toContain('device storage full');
  expect(store.snapshot().drafts[key].text).toBe('keep me');
  fail = false;
  await store.flush();
  expect(store.getPersistenceError()).toBeNull();
  expect(persistence.raw).toContain('keep me');
});

test('disconnect cancels in-flight continuations without erasing host-scoped drafts', async () => {
  const persistence = memoryStorage();
  const store = new ProcessInputDraftStore(persistence);
  await waitReady(store);
  const other = processInputDraftKey('host-b', 'process-1');
  store.edit(key, 'A-owned stdin');
  store.edit(other, 'B-owned stdin');
  store.editLauncherCommand('host-a', 'echo only A');
  const generation = store.beginInput(key)!;
  store.beginStart('host-a');
  await store.flush();
  store.invalidateConnection();
  expect(store.isCurrent(generation)).toBe(false);
  expect(store.snapshot().pendingInputs).toEqual([]);
  expect(store.snapshot().pendingStarts).toEqual([]);
  expect(store.snapshot().inputFeedback[key].message).toContain('Check the host');
  expect(store.snapshot().startFeedback['host-a'].message).toContain('Check the host');
  expect(store.snapshot().launcher.owner).toBe('host-a');
  store.confirm(key, { text: 'A-owned stdin', revision: 1 }, generation);
  await store.flush();
  const reloaded = new ProcessInputDraftStore(persistence);
  await waitReady(reloaded);
  expect(reloaded.snapshot().drafts[key].text).toBe('A-owned stdin');
  expect(reloaded.snapshot().drafts[other].text).toBe('B-owned stdin');
  expect(reloaded.snapshot().launcher.command).toBe('echo only A');
});
