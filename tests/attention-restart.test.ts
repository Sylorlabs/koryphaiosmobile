import { expect, test } from 'bun:test';
import { AttentionResponseStore, attentionResponseKey, type AttentionResponsePersistence } from '../src/control/attentionResponses';
import { openAttentionResponses, sealAttentionResponses } from '../src/control/attentionResponseCrypto';
import { EMPTY_REMOTE_EVENT_STATE } from '../src/control/remoteEvents';

const target = { baseUrl: 'https://audit.example', machineId: 'a', machineName: 'Audit', token: 'never-persist-me' };
const question = { sessionId: 'session-a', questionId: 'q-1', question: 'Choose', options: ['Yes'], allowOther: true };
const key = attentionResponseKey(target, 'question', question);
const state = { ...EMPTY_REMOTE_EVENT_STATE, questions: { 'session-a': question } };

function memoryStorage(initial: string | null = null) {
  let stored = initial;
  const storage: AttentionResponsePersistence = {
    durable: true,
    load: async () => stored,
    save: async (value) => { stored = value; },
  };
  return { storage, read: () => stored };
}

test('draft text, option selections, and submitted locks survive process restart', async () => {
  const disk = memoryStorage();
  const first = new AttentionResponseStore(disk.storage);
  await first.whenReady();
  first.setText(key, 'Unsent draft');
  await first.flush();
  const reloadDraft = new AttentionResponseStore(disk.storage);
  await reloadDraft.whenReady();
  expect(reloadDraft.read(key)).toMatchObject({ text: 'Unsent draft', phase: 'idle' });

  const attempt = first.begin(key, 'Yes')!;
  await first.flush(); // must complete before touching the transport
  first.submitted(attempt);
  await first.flush();
  const restored = new AttentionResponseStore(disk.storage);
  expect(restored.busy(key)).toBe(true); // cannot submit during hydration
  await restored.whenReady();
  expect(restored.read(key)).toMatchObject({ phase: 'waiting', choice: 'Yes', text: 'Unsent draft' });
  expect(restored.begin(key)).toBeNull();
  expect(disk.read()).not.toContain(target.token);
});

test('crash during send restores an uncertain lock; no action is replayed', async () => {
  const disk = memoryStorage();
  const first = new AttentionResponseStore(disk.storage);
  await first.whenReady();
  first.begin(key, 'Yes');
  await first.flush();
  const restored = new AttentionResponseStore(disk.storage);
  await restored.whenReady();
  expect(restored.read(key)).toMatchObject({ phase: 'uncertain', choice: 'Yes' });
  expect(restored.begin(key)).toBeNull();
  restored.reconcile(target, EMPTY_REMOTE_EVENT_STATE, EMPTY_REMOTE_EVENT_STATE, [
    { kind: 'question', sessionId: 'session-a', promptId: 'q-1', status: 'answered' },
  ]);
  expect(restored.read(key).phase).toBe('resolved');
  await restored.flush();
  const third = new AttentionResponseStore(disk.storage);
  await third.whenReady();
  expect(third.read(key).phase).toBe('resolved');
});

test('review choices with no response text are restored and cannot be reapproved', async () => {
  const review = { sessionId: 'session-a', reviewId: 'review-a', reviewRevision: 'rev-3', changes: [] };
  const reviewKey = attentionResponseKey(target, 'review', review);
  const disk = memoryStorage();
  const first = new AttentionResponseStore(disk.storage);
  await first.whenReady();
  first.begin(reviewKey, 'Reject changes');
  await first.flush();
  const restored = new AttentionResponseStore(disk.storage);
  await restored.whenReady();
  expect(restored.read(reviewKey)).toMatchObject({ phase: 'uncertain', choice: 'Reject changes' });
  expect(restored.savedFor(target).map((entry) => entry.key)).toContain(reviewKey);
  expect(restored.savedFor({ ...target, machineId: 'different' })).toEqual([]);
  restored.reconcile(target, EMPTY_REMOTE_EVENT_STATE, EMPTY_REMOTE_EVENT_STATE, [
    { kind: 'review', sessionId: 'session-a', promptId: 'review-a', reviewRevision: 'rev-2', status: 'accepted' },
  ]);
  expect(restored.read(reviewKey).phase).toBe('uncertain');
});

test('host confirmation arriving while storage hydrates is applied after recovery', async () => {
  const source = memoryStorage();
  const first = new AttentionResponseStore(source.storage);
  await first.whenReady();
  first.begin(key);
  await first.flush();
  let release!: (value: string | null) => void;
  const gate = new Promise<string | null>((resolve) => { release = resolve; });
  const store = new AttentionResponseStore({ durable: true, load: () => gate, save: source.storage.save });
  store.reconcile(target, state, { ...state, questions: {} }, [
    { kind: 'question', sessionId: 'session-a', promptId: 'q-1', status: 'answered' },
  ]);
  expect(store.begin(key)).toBeNull();
  release(source.read());
  await store.whenReady();
  expect(store.read(key).phase).toBe('resolved');
});

test('recovery errors never silently overwrite the stored snapshot or unlock uncertain approvals', async () => {
  const disk = memoryStorage('{corrupted');
  const store = new AttentionResponseStore(disk.storage);
  await store.whenReady();
  expect(store.isReady()).toBe(false);
  expect(store.getRecoveryError()).not.toBeNull();
  expect(store.begin(key)).toBeNull();
  await expect(store.flush()).rejects.toThrow();
  expect(disk.read()).toBe('{corrupted');
});

test('persistence failure is exposed; remote dispatch must await a successful sending lock', async () => {
  const disk: AttentionResponsePersistence = {
    durable: true, load: async () => null,
    save: async () => { throw new Error('Device storage is full'); },
  };
  const store = new AttentionResponseStore(disk);
  await store.whenReady();
  const attempt = store.begin(key);
  expect(attempt).not.toBeNull();
  await expect(store.flush()).rejects.toThrow('Device storage is full');
  expect(store.getPersistenceError()).toBe('Device storage is full');
  store.failed(attempt!, 'Device storage is full');
  expect(store.read(key)).toMatchObject({ phase: 'error', error: 'Device storage is full' });
});

test('concurrent storage writes serialize and never replace newer persisted work', async () => {
  const saves: Array<{ content: string; release: () => void }> = [];
  let stored: string | null = null;
  let startedFirstSave!: () => void;
  const firstSaveStarted = new Promise<void>((resolve) => { startedFirstSave = resolve; });
  const disk: AttentionResponsePersistence = {
    durable: true, load: async () => stored,
    save: (content) => new Promise<void>((resolve) => {
      saves.push({ content, release: () => { stored = content; resolve(); } });
      if (saves.length === 1) startedFirstSave();
    }),
  };
  const store = new AttentionResponseStore(disk);
  await store.whenReady();
  store.setText(key, 'A');
  const first = store.flush();
  await firstSaveStarted; // prove the first revision is already in flight
  expect(JSON.parse(saves[0].content).entries[0][1].text).toBe('A');
  store.setText(key, 'B');
  const second = store.flush();
  await Promise.resolve();
  expect(saves.length).toBe(1);
  saves[0].release();
  await first;
  // Completion of the first flight schedules the queued second flight.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(saves.length).toBe(2);
  saves[1].release();
  await second;
  const restored = new AttentionResponseStore({ durable: true, load: async () => stored, save: async () => {} });
  await restored.whenReady();
  expect(restored.read(key).text).toBe('B');
});

test('encrypted storage prevents plaintext recovery and rejects tampered ciphertext', () => {
  const keyBytes = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const nonce = Uint8Array.from({ length: 12 }, (_, i) => i + 30);
  const secret = 'Response with private user text';
  const sealed = sealAttentionResponses(keyBytes, nonce, secret);
  expect(new TextDecoder().decode(sealed)).not.toContain(secret);
  expect(openAttentionResponses(keyBytes, sealed)).toBe(secret);
  const changed = sealed.slice();
  changed[changed.length - 1] ^= 1;
  expect(() => openAttentionResponses(keyBytes, changed)).toThrow();
  expect(() => openAttentionResponses(new Uint8Array(32), sealed)).toThrow();
});
