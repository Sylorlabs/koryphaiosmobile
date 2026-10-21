import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

// Importing the native Expo storage layer is inappropriate in Bun's renderer tests.
// Keep the persistence contract under test without changing the app's native storage.
if (!process.env.KORYPHAIOS_AGENT_DRAFTS_CHILD) {
  test('agent messages: persisted drafts, pending-send recovery, and failure isolation', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_AGENT_DRAFTS_CHILD: '1' },
      encoding: 'utf8', timeout: 25_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Agent draft tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
  });
} else {
  mock.module('../src/control/conversationDraftStorage', () => ({
    agentMessageDraftStorage: {
      durable: true, load: async () => null, save: async (_raw: string) => {},
    },
  }));

  const { AgentMessageDraftStore } = await import('../src/control/agentMessageDrafts');

  const key = (...parts: string[]) => JSON.stringify(parts);
  const hostA = key('direct://host-a', 'machine-a', 'project', 'chat', 'agent');
  const hostB = key('direct://host-b', 'machine-b', 'project', 'chat', 'agent');
  const otherChat = key('direct://host-a', 'machine-a', 'project', 'chat-2', 'agent');

  function memory(initial: string | null = null) {
    let persisted = initial;
    let failLoad = false;
    let failSave = false;
    const io = {
      durable: true,
      async load() {
        if (failLoad) throw new Error('Encrypted draft unavailable');
        return persisted;
      },
      async save(value: string) {
        if (failSave) throw new Error('Secure storage full');
        persisted = value;
      },
    };
    return {
      io, get: () => persisted,
      setFailLoad: (next: boolean) => { failLoad = next; },
      setFailSave: (next: boolean) => { failSave = next; },
    };
  }

  test('cold restart restores each host/chat separately, with no remote action', async () => {
    const disk = memory();
    const before = new AgentMessageDraftStore(disk.io);
    await before.whenReady();
    before.write(hostA, 'A original');
    before.write(hostB, 'B original');
    before.write(otherChat, 'Other chat');
    await before.flush();

    const after = new AgentMessageDraftStore(disk.io);
    await after.whenReady();
    expect(after.isReady()).toBe(true);
    expect(after.read(hostA)).toBe('A original');
    expect(after.read(hostB)).toBe('B original');
    expect(after.read(otherChat)).toBe('Other chat');
    expect(after.recoveries(hostA)).toHaveLength(0);
  });

  test('an interrupted dispatch is marked uncertain on restart and cannot be replayed silently', async () => {
    const disk = memory();
    const before = new AgentMessageDraftStore(disk.io);
    await before.whenReady();
    before.write(hostA, 'Do the thing');
    const attempt = before.beginSend(hostA)!;
    expect(before.beginSend(hostA)).toBeNull();
    await before.flush(); // The original text must be saved before pending-send transition.
    expect(before.markSending(attempt)).toBe(true);
    await before.flush(); // The pending-send marker must be saved before dispatch.

    const after = new AgentMessageDraftStore(disk.io);
    await after.whenReady();
    expect(after.read(hostA)).toBe('');
    expect(after.isSending(hostA)).toBe(false);
    expect(after.recoveries(hostA)[0].body).toBe('Do the thing');
    expect(after.recoveries(hostA)[0].message).toContain('status is unknown');
    expect(after.beginSend(hostA)).toBeNull();
    after.restore(hostA, after.recoveries(hostA)[0].id);
    expect(after.read(hostA)).toBe('Do the thing');
    expect(after.recoveries(hostA)).toHaveLength(0);
  });

  test('a failed preflight save blocks dispatch and keeps the original draft', async () => {
    const disk = memory();
    const store = new AgentMessageDraftStore(disk.io);
    await store.whenReady();
    store.write(hostA, 'Keep me');
    const attempt = store.beginSend(hostA)!;
    disk.setFailSave(true);
    await expect(store.flush()).rejects.toThrow('Secure storage full');
    expect(store.canPrepare(attempt)).toBe(true);
    store.cancel(attempt, 'Draft was not saved');
    expect(store.read(hostA)).toBe('Keep me');
    expect(store.beginSend(hostA)).toBeNull();
    disk.setFailSave(false);
    await store.flush();
    expect(store.getPersistenceError()).toBeNull();
    expect(store.beginSend(hostA)).not.toBeNull();
  });

  test('an unsaved pending marker aborts locally and preserves a recoverable copy', async () => {
    const disk = memory();
    const store = new AgentMessageDraftStore(disk.io);
    await store.whenReady();
    store.write(hostA, 'Sensitive unsent message');
    const attempt = store.beginSend(hostA)!;
    await store.flush();
    expect(store.markSending(attempt)).toBe(true);
    disk.setFailSave(true);
    await expect(store.flush()).rejects.toThrow('Secure storage full');
    store.abortBeforeDispatch(attempt, 'Could not save the pending marker');
    expect(store.canDispatch(attempt)).toBe(false);
    expect(store.recoveries(hostA)[0].body).toBe('Sensitive unsent message');
    expect(store.recoveries(hostA)[0].message).toContain('not sent');
    disk.setFailSave(false);
    await store.flush();
    const restored = new AgentMessageDraftStore(disk.io);
    await restored.whenReady();
    expect(restored.recoveries(hostA)[0].body).toBe('Sensitive unsent message');
  });

  test('editing during preflight invalidates the earlier send; late settlement retains new work', async () => {
    const store = new AgentMessageDraftStore();
    store.write(hostA, 'Old');
    const preflight = store.beginSend(hostA)!;
    store.write(hostA, 'New');
    expect(store.canPrepare(preflight)).toBe(false);
    expect(store.isSending(hostA)).toBe(false);
    const next = store.beginSend(hostA)!;
    expect(store.markSending(next)).toBe(true);
    store.write(hostA, 'Newer');
    store.finishSend(next, 'Network timeout');
    expect(store.read(hostA)).toBe('Newer');
    expect(store.recoveries(hostA)[0].body).toBe('New');
    store.restore(hostA, next.id);
    expect(store.read(hostA)).toBe('New');
    expect(store.recoveries(hostA)[0].body).toBe('Newer');
  });

  test('load failure blocks sends and recoverable retry does not destroy existing encrypted data', async () => {
    const disk = memory('bad snapshot');
    disk.setFailLoad(true);
    const store = new AgentMessageDraftStore(disk.io);
    await store.whenReady();
    expect(store.isReady()).toBe(false);
    expect(store.getRecoveryError()).toContain('Encrypted draft unavailable');
    expect(store.beginSend(hostA)).toBeNull();
    await expect(store.flush()).rejects.toThrow('Encrypted draft unavailable');
    expect(disk.get()).toBe('bad snapshot');
    disk.setFailLoad(false);
    store.retryLoad();
    await store.whenReady();
    expect(store.isReady()).toBe(false);
    expect(store.getRecoveryError()).toBeTruthy();
    expect(disk.get()).toBe('bad snapshot');
  });

  test('malformed or oversized snapshot never initializes a sendable store', async () => {
    for (const invalid of [
      '{"version":2,"drafts":[],"pending":[],"nextId":1}',
      '{"version":1,"drafts":[["wrong",{"body":"leak","revision":0,"recoveries":[]}]],"pending":[],"nextId":1}',
      'x'.repeat(4 * 1024 * 1024 + 1),
    ]) {
      const disk = memory(invalid);
      const store = new AgentMessageDraftStore(disk.io);
      await store.whenReady();
      expect(store.isReady()).toBe(false);
      expect(store.getRecoveryError()).toBeTruthy();
    }
  });

  test('new destinations are bounded and invalid keys cannot poison the next persisted snapshot', async () => {
    const disk = memory();
    const store = new AgentMessageDraftStore(disk.io);
    await store.whenReady();
    expect(() => store.write('not-json', 'invalid')).toThrow('Invalid agent message destination');
    for (let index = 0; index < 250; index++) {
      store.write(key('host', 'machine', 'project', 'chat', `agent-${index}`), 'Draft');
    }
    expect(() => store.write(key('host', 'machine', 'project', 'chat', 'agent-250'), 'One too many'))
      .toThrow('Too many saved agent destinations');
    await store.flush();
    const restarted = new AgentMessageDraftStore(disk.io);
    await restarted.whenReady();
    expect(restarted.isReady()).toBe(true);
    expect(restarted.read(key('host', 'machine', 'project', 'chat', 'agent-249'))).toBe('Draft');
  });
}
