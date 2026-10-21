// Exercise the real provider and transports together. Only native I/O and the
// remote host are simulated; device and host-handler validation remain separate.
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act, StrictMode } from 'react';
import TestRenderer from 'react-test-renderer';
import { EMPTY_SNAPSHOT } from '../src/control/emptySnapshot';
import { attentionResponseKey } from '../src/control/attentionResponses';

if (process.env.KORYPHAIOS_ATTENTION_DISPATCH_TEST_CHILD !== '1') {
  test('attention dispatch: isolated provider and real transport integration', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_ATTENTION_DISPATCH_TEST_CHILD: '1' },
      encoding: 'utf8', timeout: 30_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Attention dispatch tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 35_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const appListeners = new Set<(state: string) => void>();
  mock.module('react-native', () => ({ AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appListeners.add(listener);
      return { remove: () => appListeners.delete(listener) };
    },
  } }));
  const target = { baseUrl: 'https://audit.invalid', machineId: 'host-a', machineName: 'Audit host', token: 'test-only' };
  mock.module('../src/control/securePairing', () => ({
    loadPairing: async () => target, savePairing: async () => {}, clearPairing: async () => {},
  }));
  // Provider integration simulates durable native writes; avoid importing Expo's
  // native file-system module in Bun's isolated React renderer.
  let savedResponses: string | null = null;
  mock.module('../src/control/attentionResponseStorage', () => ({
    attentionResponseStorage: {
      durable: true,
      load: async () => savedResponses,
      save: async (value: string) => { savedResponses = value; },
    },
  }));
  let savedProcessDrafts: string | null = null;
  mock.module('../src/control/processDraftStorage', () => ({
    processDraftStorage: {
      durable: true,
      load: async () => savedProcessDrafts,
      save: async (value: string) => { savedProcessDrafts = value; },
    },
  }));
  let savedComposer: string | null = null;
  mock.module('../src/control/conversationDraftStorage', () => ({
    composerDraftStorage: {
      durable: true,
      load: async () => savedComposer,
      save: async (value: string) => { savedComposer = value; },
    },
  }));
  mock.module('../src/control/remoteClient', () => ({
    isRemoteAuthError: () => false,
    RemoteClient: class {
      async snapshot() {
        return { ...EMPTY_SNAPSHOT, activeSessionId: 'chat-a', activeProjectId: 'project-a',
          machine: { ...EMPTY_SNAPSHOT.machine, id: 'host-a', status: 'online' } };
      }
    },
  }));
  const actions: Record<string, unknown>[] = [];
  const linkedListeners = new Set<(host: string, body: unknown) => void>();
  const linked = {
    links: [{ peer: { id: 'host-a', name: 'Audit host' } }], activeHostId: '', ready: true,
    rpc: async (_host: string, operation: string, payload: Record<string, unknown>) => {
      if (operation === 'answer' || operation === 'review') actions.push(payload);
      return {};
    },
    subscribeEvents: (listener: (host: string, body: unknown) => void) => {
      linkedListeners.add(listener);
      return () => { linkedListeners.delete(listener); };
    },
    selectHost: async () => {},
  };
  mock.module('../src/control/LinkedDeviceProvider', () => ({ useLinkedDevices: () => linked }));
  const originalSocket = globalThis.WebSocket;
  const sockets: Socket[] = [];
  class Socket {
    static OPEN = 1;
    readyState = 0;
    onopen?: () => void;
    onclose?: () => void;
    onmessage?: (event: { data: string }) => void;
    constructor() {
      sockets.push(this);
      queueMicrotask(() => {
        if (this.readyState === 3) return;
        this.readyState = 1;
        this.onopen?.();
      });
    }
    send(data: string) {
      const message = JSON.parse(data);
      if (['user_input', 'session.accept_changes', 'session.reject_changes'].includes(message.type)) actions.push(message);
    }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const { ControlProvider, useControl } = await import('../src/control/ControlProvider');
  let control!: ReturnType<typeof useControl>;
  let tree: TestRenderer.ReactTestRenderer | undefined;
  function Probe() { control = useControl(); return null; }
  beforeEach(() => {
    actions.length = 0;
    sockets.length = 0;
    savedResponses = null;
    savedProcessDrafts = null;
    savedComposer = null;
    globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  });
  afterEach(async () => {
    await act(async () => { tree?.unmount(); });
    tree = undefined;
    globalThis.WebSocket = originalSocket;
    expect(appListeners.size).toBe(0);
    expect(linkedListeners.size).toBe(0);
    expect(sockets.every((socket) => socket.readyState === 3)).toBe(true);
  });
  async function mount(transport: string) {
    linked.activeHostId = transport === 'linked' ? 'host-a' : '';
    await act(async () => { tree = TestRenderer.create(<StrictMode><ControlProvider><Probe /></ControlProvider></StrictMode>); });
    await act(async () => { await control.refresh(); });
    await act(async () => { await Promise.resolve(); });
    expect(control.live.connection).toBe('connected');
  }
  function emitEvent(transport: string, event: object) {
    if (transport === 'direct') sockets.findLast((socket) => socket.readyState === 1)!.onmessage?.({ data: JSON.stringify(event) });
    else linkedListeners.forEach((listener) => listener('host-a', { type: 'event', event }));
  }
  function emit(transport: string, kind: string, prompt: unknown) {
    emitEvent(transport, { type: kind === 'question' ? 'kory.ask_user' : 'session.changes', sessionId: 'chat-a', payload: prompt });
  }
  function promptFor(kind: string, id: string, legacy = false) {
    return kind === 'question'
      ? { sessionId: 'chat-a', questionId: legacy ? undefined : id, question: `Question ${id}`, options: ['Go'], allowOther: true }
      : { sessionId: 'chat-a', reviewId: legacy ? undefined : id, reviewRevision: legacy ? undefined : `publication-${id}`, changes: [{ path: `${id}.txt`, operation: 'edit', linesAdded: 1, linesDeleted: 0 }] };
  }
  function respond(captured: typeof control, kind: 'question' | 'review', key: string) {
    return kind === 'question'
      ? captured.answerQuestion('chat-a', 'Go', undefined, key)
      : captured.resolveReview('chat-a', true, key);
  }

  for (const transport of ['direct', 'linked']) {
    for (const kind of ['question', 'review'] as const) {
      test(`${transport} ${kind} sends the rendered prompt identity once`, async () => {
        await mount(transport);
        const prompt = promptFor(kind, 'a');
        await act(async () => { emit(transport, kind, prompt); });
        const key = attentionResponseKey(control.pairing, kind, prompt);
        await act(async () => { await respond(control, kind, key); await respond(control, kind, key); });
        expect(actions).toHaveLength(1);
        expect(actions[0][kind === 'question' ? 'questionId' : 'reviewId']).toBe('a');
        if (kind === 'review') expect(actions[0].reviewRevision).toBe('publication-a');
        expect(control.attentionResponses.read(key).phase).toBe('waiting');
      });

      for (const scenario of ['replacement', 'A-B-A', 'legacy', ...(kind === 'review' ? ['revision'] : [])]) {
        test(`${transport} ${kind} rejects ${scenario} before React commits and keeps the new control usable`, async () => {
          await mount(transport);
          const original = promptFor(kind, 'a', scenario === 'legacy');
          const replacement = scenario === 'revision'
            ? { ...original, reviewRevision: 'publication-b' }
            : promptFor(kind, 'b', scenario === 'legacy');
          await act(async () => { emit(transport, kind, original); });
          const captured = control;
          const oldKey = attentionResponseKey(control.pairing, kind, original);
          const current = scenario === 'A-B-A' ? original : replacement;
          await act(async () => {
            emit(transport, kind, replacement);
            if (scenario === 'A-B-A') emit(transport, kind, original);
            await respond(captured, kind, oldKey);
          });
          expect(actions).toHaveLength(0);
          expect(control.attentionResponses.read(oldKey).phase).toBe('error');
          const key = attentionResponseKey(control.pairing, kind, current);
          await act(async () => { await respond(control, kind, key); });
          expect(actions).toHaveLength(1);
          expect(actions[0][kind === 'question' ? 'questionId' : 'reviewId']).toBe(scenario === 'legacy' ? undefined : ['A-B-A', 'revision'].includes(scenario) ? 'a' : 'b');
          if (kind === 'review') expect(actions[0].reviewRevision).toBe(current.reviewRevision);
        });
      }
    }

    test(`${transport} provider keeps a republished review actionable through delayed acknowledgments`, async () => {
      await mount(transport);
      const original = promptFor('review', 'a');
      const replacement = { ...original, reviewRevision: 'publication-b' };
      await act(async () => { emit(transport, 'review', original); });
      const oldKey = attentionResponseKey(control.pairing, 'review', original);
      await act(async () => { await respond(control, 'review', oldKey); });
      await act(async () => { emit(transport, 'review', replacement); });
      const newKey = attentionResponseKey(control.pairing, 'review', replacement);
      expect(control.attentionResponses.read(oldKey).phase).toBe('closed');
      await act(async () => { await respond(control, 'review', newKey); });
      expect(actions.map((action) => action.reviewRevision)).toEqual(['publication-a', 'publication-b']);
      for (const payload of [
        { reviewId: 'a', reviewRevision: 'publication-a', status: 'accepted' },
        { reviewId: 'a', status: 'rejected' },
      ]) {
        await act(async () => { emitEvent(transport, { type: 'session.changes_resolved', sessionId: 'chat-a', payload }); });
        expect(control.live.reviews['chat-a']?.reviewRevision).toBe('publication-b');
        expect(control.attentionResponses.read(newKey).phase).toBe('waiting');
      }
      expect(control.attentionResponses.read(oldKey).phase).toBe('resolved');
      await act(async () => { emitEvent(transport, { type: 'session.changes_resolved', sessionId: 'chat-a', payload: {
        reviewId: 'a', reviewRevision: 'publication-b', status: 'rejected',
      } }); });
      expect(control.live.reviews['chat-a']).toBeUndefined();
      expect(control.attentionResponses.read(newKey)).toMatchObject({ phase: 'resolved', outcome: 'rejected' });
    });
  }
}
