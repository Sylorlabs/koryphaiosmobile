// Provider integration uses mocked native I/O; device behavior is a separate gate.
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act, StrictMode } from 'react';
import TestRenderer from 'react-test-renderer';
import { EMPTY_SNAPSHOT } from '../src/control/emptySnapshot';
import { attentionResponseKey } from '../src/control/attentionResponses';
import type { AttentionResolution } from '../src/control/remoteAttention';
import type { CommandResult, ControlSnapshot, PairingTarget, RemoteEventState } from '../src/types/control';

// Bun's module overrides can outlive a test file. Run this native-I/O suite in
// its own process so the aggregate run still exercises the real transports.
if (process.env.KORYPHAIOS_PROVIDER_TEST_CHILD !== '1') {
  test('provider integration: isolated native-I/O cases', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_PROVIDER_TEST_CHILD: '1' },
      encoding: 'utf8',
      timeout: 30_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Provider tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 35_000);
} else {
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const listeners = new Set<(state: string) => void>();
mock.module('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, listener: (state: string) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function snapshot(sessionId = 'chat-a'): ControlSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    activeSessionId: sessionId,
    activeProjectId: 'project-a',
    machine: { ...EMPTY_SNAPSHOT.machine, id: 'host-a', name: 'Audit host', status: 'online' },
  };
}
const reads: { host: string; session: string }[] = [];
const commands: ReturnType<typeof deferred<CommandResult>>[] = [];
let nextRead: ReturnType<typeof deferred<ControlSnapshot>> | null = null;
let nextInspect: ReturnType<typeof deferred<unknown>> | null = null;
class FakeClient {
  constructor(private target: PairingTarget) {}
  snapshot(sessionId = '') {
    reads.push({ host: this.target.machineId, session: sessionId });
    const pending = nextRead;
    nextRead = null;
    return pending?.promise ?? Promise.resolve(snapshot(sessionId || 'chat-a'));
  }
  command() {
    const pending = deferred<CommandResult>();
    commands.push(pending);
    return pending.promise;
  }
  inspect() {
    const pending = nextInspect;
    nextInspect = null;
    return pending?.promise ?? Promise.resolve({});
  }
}
mock.module('../src/control/remoteClient', () => ({ RemoteClient: FakeClient, isRemoteAuthError: () => false }));
mock.module('../src/control/securePairing', () => ({
  loadPairing: async () => null, savePairing: async () => {}, clearPairing: async () => {},
}));
// Model durable device writes without importing Expo's native modules in Bun.
let storedAttention: string | null = null;
let storedProcessDrafts: string | null = null;
mock.module('../src/control/attentionResponseStorage', () => ({
  attentionResponseStorage: {
    durable: true,
    load: async () => storedAttention,
    save: async (value: string) => { storedAttention = value; },
  },
}));
mock.module('../src/control/processDraftStorage', () => ({
  processDraftStorage: {
    durable: true,
    load: async () => storedProcessDrafts,
    save: async (value: string) => { storedProcessDrafts = value; },
  },
}));
let storedComposer: string | null = null;
mock.module('../src/control/conversationDraftStorage', () => ({
  composerDraftStorage: {
    durable: true,
    load: async () => storedComposer,
    save: async (value: string) => { storedComposer = value; },
  },
}));
const links = ['host-a', 'host-b'].map((id) => ({ peer: { id, name: id } }));
const linked = {
  links, activeHostId: 'host-a', ready: true,
  rpc: async () => ({}), subscribeEvents: () => () => {}, selectHost: async () => {},
};
mock.module('../src/control/LinkedDeviceProvider', () => ({ useLinkedDevices: () => linked }));
const clients: FakeEvents[] = [];
const responses: { host: string; kind: string; session: string; value: string | boolean; result: ReturnType<typeof deferred<void>> }[] = [];
let synchronousResponse = false;
class FakeEvents {
  disposed = false;
  suspended = false;
  session = '';
  host: string;
  onState: (state: RemoteEventState, resolutions?: AttentionResolution[]) => void;
  constructor(...args: any[]) {
    this.host = typeof args[0] === 'string' ? args[0] : args[0].machineId;
    this.onState = args.at(-1);
    clients.push(this);
  }
  emit(state: RemoteEventState, resolutions?: AttentionResolution[]) { this.onState(state, resolutions); }
  respond(kind: string, session: string, value: string | boolean) {
    const result = deferred<void>();
    responses.push({ host: this.host, kind, session, value, result });
    return synchronousResponse ? undefined : result.promise;
  }
  answerQuestion(session: string, selection: string) { return this.respond('answer', session, selection); }
  resolveReview(session: string, accepted: boolean) { return this.respond('review', session, accepted); }
  connect(session = '') { this.session = session; }
  setActiveSession(session: string) { this.session = session; }
  dispose() { this.disposed = true; }
  suspend() { this.suspended = true; }
  resume() { this.suspended = false; }
}
mock.module('../src/control/remoteEvents', () => ({
  RemoteEventClient: FakeEvents,
  EMPTY_REMOTE_EVENT_STATE: { connection: 'disconnected', runs: {}, questions: {}, reviews: {}, nativeCommands: {} },
}));
mock.module('../src/control/linkedRemoteEvents', () => ({ LinkedRemoteEventClient: FakeEvents }));
const { ControlProvider, useControl } = await import('../src/control/ControlProvider');
let control!: ReturnType<typeof useControl>;
let tree: TestRenderer.ReactTestRenderer | undefined;
function Probe() { control = useControl(); return null; }
const app = () => <StrictMode><ControlProvider><Probe /></ControlProvider></StrictMode>;

beforeEach(async () => {
  storedAttention = null;
  storedProcessDrafts = null;
  reads.length = 0;
  commands.length = 0;
  clients.length = 0;
  responses.length = 0;
  synchronousResponse = false;
  nextRead = null;
  nextInspect = null;
  linked.activeHostId = 'host-a';
  await act(async () => { tree = TestRenderer.create(app()); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  await act(async () => { await control.refresh(); });
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  expect(listeners.size).toBe(0);
});

test('Strict Mode replay leaves the current host usable and one event client alive', async () => {
  const count = reads.length;
  await act(async () => { await control.refresh(); });
  expect(reads.length).toBeGreaterThan(count);
  expect(control.snapshot.activeSessionId).toBe('chat-a');
  expect(clients.filter((client) => !client.disposed)).toHaveLength(1);
});

test('a non-selection command finishing after a chat switch cannot reopen the old chat', async () => {
  let select!: Promise<CommandResult>;
  let edit!: Promise<CommandResult>;
  await act(async () => {
    select = control.sendCommand('session.select', { sessionId: 'chat-b' });
    edit = control.sendCommand('note.update', { sessionId: 'chat-a', projectId: 'other-project' });
  });
  await act(async () => { commands[0].resolve({ accepted: true }); await select; });
  expect(control.snapshot.activeSessionId).toBe('chat-b');
  await act(async () => { commands[1].resolve({ accepted: true }); await edit; });
  expect(control.snapshot.activeSessionId).toBe('chat-b');
  expect(reads.at(-1)?.session).toBe('chat-b');
});

test('an explicitly targeted send from no-chat state does not supersede pending chat navigation', async () => {
  const empty = deferred<ControlSnapshot>();
  nextRead = empty;
  let refresh!: Promise<void>;
  await act(async () => { refresh = control.refresh(); });
  await act(async () => { empty.resolve(snapshot('')); await refresh; });
  expect(control.snapshot.activeSessionId).toBe('');
  let select!: Promise<CommandResult>;
  let send!: Promise<CommandResult>;
  await act(async () => {
    select = control.sendCommand('session.select', { sessionId: 'chat-b' });
    send = control.sendCommand('session.send_message', { sessionId: 'chat-a', body: 'scoped message' });
  });
  await act(async () => { commands[0].resolve({ accepted: true }); await select; });
  expect(control.snapshot.activeSessionId).toBe('chat-b');
  await act(async () => { commands[1].resolve({ accepted: true, sessionId: 'chat-a' }); await send; });
  expect(control.snapshot.activeSessionId).toBe('chat-b');
  expect(commands).toHaveLength(2);
});

test('refresh after a command starts does not reuse an invalidated poll', async () => {
  const old = deferred<ControlSnapshot>();
  nextRead = old;
  let oldRefresh!: Promise<void>;
  let command!: Promise<CommandResult>;
  await act(async () => { oldRefresh = control.refresh(); });
  const count = reads.length;
  await act(async () => { command = control.sendCommand('note.update'); });
  let fresh!: Promise<void>;
  await act(async () => { fresh = control.refresh(); });
  expect(reads.length).toBe(count + 1);
  await act(async () => {
    old.resolve(snapshot('stale-chat'));
    await Promise.all([oldRefresh, fresh]);
    commands[0].resolve({ accepted: true });
    await command;
  });
  expect(control.snapshot.activeSessionId).toBe('chat-a');
});

test('an old host snapshot cannot populate the newly selected host', async () => {
  const old = deferred<ControlSnapshot>();
  nextRead = old;
  let oldRefresh!: Promise<void>;
  await act(async () => { oldRefresh = control.refresh(); });
  await act(async () => { linked.activeHostId = 'host-b'; tree!.update(app()); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  await act(async () => { await control.refresh(); });
  await act(async () => { old.resolve(snapshot('old-host-chat')); await oldRefresh; });
  expect(control.pairing?.machineId).toBe('host-b');
  expect(control.snapshot.activeSessionId).toBe('chat-a');
  expect(control.commandStatuses).toHaveLength(0);
});

test('late inspection from another machine never returns private previous-host content', async () => {
  const old = deferred<unknown>();
  nextInspect = old;
  const outcome = control.inspect('notes.read', { noteId: 'host-a-only' })
    .then(() => 'delivered stale data', (caught: Error) => caught.message);
  await act(async () => { linked.activeHostId = 'host-b'; tree!.update(app()); });
  await act(async () => { await control.refresh(); });
  old.resolve({ body: 'private host A data' });
  expect(await outcome).toContain('selected machine changed');
  expect(control.pairing?.machineId).toBe('host-b');
});

test('late inspection from another chat never returns previous-chat content', async () => {
  const old = deferred<unknown>();
  nextInspect = old;
  const outcome = control.inspect('git.chat')
    .then(() => 'delivered stale data', (caught: Error) => caught.message);
  let select!: Promise<CommandResult>;
  await act(async () => { select = control.sendCommand('session.select', { sessionId: 'chat-b' }); });
  await act(async () => { commands.at(-1)!.resolve({ accepted: true }); await select; });
  expect(control.snapshot.activeSessionId).toBe('chat-b');
  old.resolve({ privateChat: 'chat-a' });
  expect(await outcome).toContain('selected chat or project changed');
});

test('inspection begun before chat A to B to A is still stale', async () => {
  const old = deferred<unknown>();
  nextInspect = old;
  const outcome = control.inspect('git.chat')
    .then(() => 'delivered stale data', (caught: Error) => caught.message);
  for (const sessionId of ['chat-b', 'chat-a']) {
    let select!: Promise<CommandResult>;
    await act(async () => { select = control.sendCommand('session.select', { sessionId }); });
    await act(async () => { commands.at(-1)!.resolve({ accepted: true }); await select; });
  }
  old.resolve({ privateChat: 'original chat-a request' });
  expect(await outcome).toContain('selected chat or project changed');
});

test('inspection still returns a result when the host and chat stay selected', async () => {
  const pending = deferred<unknown>();
  nextInspect = pending;
  const result = control.inspect<{ body: string }>('notes.read', { noteId: 'unchanged' });
  pending.resolve({ body: 'expected note' });
  expect(await result).toEqual({ body: 'expected note' });
});

test('background, inactive, active restores transport and refreshes state', async () => {
  await act(async () => { listeners.forEach((listener) => listener('background')); });
  expect(clients.every((client) => client.disposed || client.suspended)).toBe(true);
  const count = reads.length;
  await act(async () => { listeners.forEach((listener) => listener('inactive')); });
  expect(reads.length).toBe(count);
  await act(async () => { listeners.forEach((listener) => listener('active')); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  expect(reads.length).toBeGreaterThan(count);
  expect(clients.filter((client) => !client.disposed && !client.suspended)).toHaveLength(1);
});

test('iOS suspend/resume preserves the same live stream instead of resetting partial output', async () => {
  const current = clients.findLast((client) => !client.disposed)!;
  const stream = {
    content: 'Streaming response in progress', model: 'test', complete: false,
    truncated: false, startedAt: 10, updatedAt: 20,
  };
  await act(async () => {
    current.emit({ connection: 'connected', runs: {}, questions: {}, reviews: {}, nativeCommands: {},
      streams: { 'chat-a': { 'kory-manager': stream } } });
  });
  expect(control.live.streams?.['chat-a']?.['kory-manager']?.content).toBe(stream.content);
  await act(async () => { listeners.forEach((listener) => listener('background')); });
  expect(current.disposed).toBe(false);
  expect(current.suspended).toBe(true);
  await act(async () => { listeners.forEach((listener) => listener('active')); });
  expect(current.disposed).toBe(false);
  expect(current.suspended).toBe(false);
  expect(clients.filter((client) => !client.disposed)).toHaveLength(1);
  expect(control.live.streams?.['chat-a']?.['kory-manager']?.content).toBe(stream.content);
});

test('accepted mutation with failed reconciliation remains accepted and is not replayed', async () => {
  let pending!: Promise<CommandResult>;
  await act(async () => { pending = control.sendCommand('note.update'); });
  const failedRead = deferred<ControlSnapshot>();
  nextRead = failedRead;
  await act(async () => { commands[0].resolve({ accepted: true, data: 'saved' }); });
  await act(async () => {
    failedRead.reject(new Error('snapshot unavailable'));
    expect(await pending).toEqual({ accepted: true, data: 'saved' });
  });
  expect(commands).toHaveLength(1);
  expect(control.commandStatuses.at(-1)?.state).toBe('warning');
});

const question = { sessionId: 'chat-a', questionId: 'q-a', question: 'Choose a direction', options: ['Go'], allowOther: true };
const eventState = (patch: Partial<RemoteEventState> = {}): RemoteEventState => ({
  connection: 'connected', runs: {}, questions: {}, reviews: {}, nativeCommands: {}, ...patch,
});
const activeEvents = () => clients.findLast((client) => !client.disposed)!;
const showQuestion = async (value = question) => {
  await act(async () => { activeEvents().emit(eventState({ questions: { [value.sessionId]: value } })); });
  return attentionResponseKey(control.pairing, 'question', value);
};

test('attention answer dispatches once, preserves text and waits for the host event after RPC completion', async () => {
  const key = await showQuestion();
  control.attentionResponses.setText(key, 'Keep this answer');
  let pending!: Promise<void>;
  await act(async () => {
    pending = control.answerQuestion('chat-a', 'Keep this answer', 'Keep this answer', key);
    void control.answerQuestion('chat-a', 'Keep this answer', 'Keep this answer', key);
  });
  expect(responses).toHaveLength(1);
  expect(responses[0]).toMatchObject({ host: 'host-a', kind: 'answer', session: 'chat-a' });
  await act(async () => { responses[0].result.resolve(); await pending; });
  await act(async () => { await control.answerQuestion('chat-a', 'Go', undefined, key); });
  expect(responses).toHaveLength(1);
  expect(control.attentionResponses.read(key)).toMatchObject({ text: 'Keep this answer', phase: 'waiting' });
  await act(async () => { activeEvents().emit(eventState()); });
  expect(control.attentionResponses.read(key).phase).toBe('waiting');
  await act(async () => { activeEvents().emit(eventState(), [
    { kind: 'question', sessionId: 'chat-a', promptId: 'q-a', status: 'answered' },
  ]); });
  expect(control.attentionResponses.read(key).phase).toBe('resolved');
});

test('a synchronous socket write is not confirmation and cannot enable a duplicate answer', async () => {
  synchronousResponse = true;
  const key = await showQuestion();
  await act(async () => { await control.answerQuestion('chat-a', 'Go', undefined, key); });
  await act(async () => { await control.answerQuestion('chat-a', 'Go', undefined, key); });
  expect(responses).toHaveLength(1);
  expect(control.attentionResponses.read(key).phase).toBe('waiting');
});

test('an old answer callback cannot target a replacement question or revive after question A to B to A', async () => {
  const oldKey = await showQuestion();
  const oldAnswer = control.answerQuestion;
  const newer = { ...question, questionId: 'q-b' };
  await showQuestion(newer);
  await act(async () => {
    await oldAnswer('chat-a', 'Go', undefined, oldKey);
    await control.answerQuestion('chat-a', 'Go', undefined, oldKey);
  });
  await showQuestion();
  await act(async () => { await oldAnswer('chat-a', 'Go', undefined, oldKey); });
  expect(responses).toHaveLength(0);
});

test('an old answer callback cannot revive after chat A to B to A', async () => {
  const key = await showQuestion();
  const oldAnswer = control.answerQuestion;
  for (const sessionId of ['chat-b', 'chat-a']) {
    let selection!: Promise<CommandResult>;
    await act(async () => { selection = control.sendCommand('session.select', { sessionId }); });
    await act(async () => { commands.at(-1)!.resolve({ accepted: true }); await selection; });
  }
  await act(async () => { await oldAnswer('chat-a', 'Go', undefined, key); });
  expect(responses).toHaveLength(0);
});

test('late answer failure and disposed-host events cannot overwrite another host', async () => {
  const oldKey = await showQuestion();
  control.attentionResponses.setText(oldKey, 'Host A answer');
  const oldEvents = activeEvents();
  let pending!: Promise<void>;
  await act(async () => { pending = control.answerQuestion('chat-a', 'Host A answer', 'Host A answer', oldKey); });
  await act(async () => { linked.activeHostId = 'host-b'; tree!.update(app()); });
  await act(async () => { await control.refresh(); });
  const newKey = await showQuestion();
  control.attentionResponses.setText(newKey, 'Host B answer');
  await act(async () => {
    oldEvents.emit(eventState(), [{ kind: 'question', sessionId: 'chat-a', promptId: 'q-a', status: 'answered' }]);
    responses[0].result.reject(new Error('Host A unavailable'));
    await pending;
  });
  expect(control.live.questions['chat-a'].questionId).toBe('q-a');
  expect(control.attentionResponses.read(oldKey)).toMatchObject({ text: 'Host A answer', phase: 'error' });
  expect(control.attentionResponses.read(newKey)).toMatchObject({ text: 'Host B answer', phase: 'idle' });
  expect(control.error).toBeNull();
});

test('review decisions share a pending lock and a late RPC failure cannot undo host resolution', async () => {
  const review = { sessionId: 'chat-a', reviewId: 'r-a', changes: [] };
  await act(async () => { activeEvents().emit(eventState({ reviews: { 'chat-a': review } })); });
  const key = attentionResponseKey(control.pairing, 'review', review);
  let pending!: Promise<void>;
  await act(async () => {
    pending = control.resolveReview('chat-a', true, key);
    void control.resolveReview('chat-a', false, key);
  });
  expect(responses).toHaveLength(1);
  await act(async () => { activeEvents().emit(eventState(), [
    { kind: 'review', sessionId: 'chat-a', promptId: 'r-a', status: 'accepted' },
  ]); });
  await act(async () => { responses[0].result.reject(new Error('Late timeout')); await pending; });
  expect(control.attentionResponses.read(key)).toMatchObject({ phase: 'resolved', error: null });
});

test('background preserves the stream client without acknowledging responses before host evidence', async () => {
  synchronousResponse = true;
  const key = await showQuestion();
  control.attentionResponses.setText(key, 'Saved before background');
  await act(async () => { await control.answerQuestion('chat-a', 'Go', undefined, key); });
  const previous = activeEvents();
  await act(async () => { listeners.forEach((listener) => listener('background')); });
  expect(previous.suspended).toBe(true);
  await act(async () => { listeners.forEach((listener) => listener('active')); });
  expect(activeEvents()).toBe(previous);
  expect(previous.disposed).toBe(false);
  expect(previous.suspended).toBe(false);
  await act(async () => { activeEvents().emit(eventState()); });
  expect(control.attentionResponses.read(key).phase).toBe('waiting');
  await act(async () => { activeEvents().emit(eventState(), [
    { kind: 'question', sessionId: 'chat-a', status: 'not_pending' },
  ]); });
  expect(control.attentionResponses.read(key)).toMatchObject({ phase: 'closed', text: 'Saved before background' });
  expect(responses).toHaveLength(1);
});
}
