import { afterEach, expect, spyOn, test } from 'bun:test';
import { EMPTY_REMOTE_EVENT_STATE, RemoteEventClient } from '../src/control/remoteEvents';
import { LinkedRemoteEventClient } from '../src/control/linkedRemoteEvents';
import { AttentionResponseStore, attentionResponseKey } from '../src/control/attentionResponses';

const cleanups = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

const target = { baseUrl: 'https://host.invalid', token: 'test-token', machineId: 'test', machineName: 'Test' };

function sockets(onState = () => {}) {
  const instances = [];
  const timers = [];
  class Socket {
    static OPEN = 1;
    readyState = 0;
    sent = [];
    constructor(url) { this.url = url; instances.push(this); }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.readyState = 3; this.onclose?.(); }
    open() { this.readyState = 1; this.onopen?.(); }
    message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  }
  const originalSocket = globalThis.WebSocket;
  globalThis.WebSocket = Socket;
  const timerSpy = spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay) => {
    const timer = { callback, delay, cancelled: false };
    timers.push(timer);
    return timer;
  });
  const clearSpy = spyOn(globalThis, 'clearTimeout').mockImplementation((timer) => { if (timer) timer.cancelled = true; });
  cleanups.push(() => { globalThis.WebSocket = originalSocket; timerSpy.mockRestore(); clearSpy.mockRestore(); });
  const states = [];
  const client = new RemoteEventClient(target, (state, resolutions) => { states.push(state); onState(state, resolutions); });
  cleanups.push(() => client.dispose());
  return { instances, timers, states, client };
}

test('direct socket URL preserves the host Bearer authentication contract', () => {
  const { instances, client } = sockets();
  client.connect('chat-a');
  const url = new URL(instances[0].url);
  expect(url.protocol).toBe('wss:');
  expect(url.pathname).toBe('/ws');
  expect(url.searchParams.get('auth')).toBe('Bearer test-token');

  const restored = new RemoteEventClient({ ...target, token: 'Bearer test-token' }, () => {});
  cleanups.push(() => restored.dispose());
  restored.connect('chat-b');
  expect(new URL(instances[1].url).searchParams.get('auth')).toBe('Bearer test-token');
});

test('direct manager deltas paint in strict order, clear rejected output and retain completion until snapshot', () => {
  const { client, instances, states } = sockets();
  client.connect('chat-a');
  instances[0].open();
  const emit = (sequence, type, payload, epoch = 1) => instances[0].message({
    type, sessionId: 'chat-a', epoch, sequence, payload,
  });
  emit(1, 'stream.delta', { agentId: 'kory-manager', content: 'Reject me' });
  expect(states.at(-1).streams['chat-a']['kory-manager'].content).toBe('Reject me');
  emit(2, 'stream.clear_content', { agentId: 'kory-manager' });
  expect(states.at(-1).streams['chat-a']?.['kory-manager']).toBeUndefined();
  emit(4, 'stream.delta', { agentId: 'kory-manager', content: 'world' });
  expect(states.at(-1).streams['chat-a']).toBeUndefined();
  emit(3, 'stream.delta', { agentId: 'kory-manager', content: 'Hello ' });
  expect(states.at(-1).streams['chat-a']['kory-manager'].content).toBe('Hello world');
  emit(4, 'stream.delta', { agentId: 'kory-manager', content: 'world' });
  expect(states.at(-1).streams['chat-a']['kory-manager'].content).toBe('Hello world');
  client.resume();
  instances[1].open();
  instances[1].message({
    type: 'stream.complete', sessionId: 'chat-a', epoch: 1, sequence: 5,
    payload: { agentId: 'kory-manager' },
  });
  expect(states.at(-1).streams['chat-a']['kory-manager']).toMatchObject({ content: 'Hello world', complete: true });
  instances[1].message({
    type: 'session.timeline_rewritten', sessionId: 'chat-a', epoch: 2, sequence: 1, payload: {},
  });
  expect(states.at(-1).streams['chat-a']).toBeUndefined();
});

test('linked stream maintains independent chat/agent state across replay, stop and rewrite', async () => {
  const { client, states, emit } = linked(async (_host, operation) => {
    if (operation === 'open_chat') return { eventCursor: { epoch: 1, latestSequence: 0 } };
    if (operation === 'events') return [];
    return {};
  });
  client.connect('chat-a');
  await flush();
  const push = (sessionId, sequence, type, payload, epoch = 1) => emit({ type, sessionId, epoch, sequence, payload });
  push('chat-a', 1, 'stream.delta', { agentId: 'kory-manager', content: 'A' });
  push('chat-a', 2, 'stream.delta', { agentId: 'worker', content: 'private worker text' });
  push('chat-b', 1, 'stream.delta', { agentId: 'kory-manager', content: 'Other chat' });
  expect(states.at(-1).streams['chat-a']['kory-manager'].content).toBe('A');
  expect(states.at(-1).streams['chat-a']['worker'].content).toBe('private worker text');
  expect(states.at(-1).streams['chat-b']['kory-manager'].content).toBe('Other chat');
  push('chat-a', 3, 'stream.complete', { agentId: 'kory-manager' });
  expect(states.at(-1).streams['chat-a']['kory-manager'].complete).toBe(true);
  push('chat-a', 1, 'session.timeline_rewritten', {}, 2);
  expect(states.at(-1).streams['chat-a']).toBeUndefined();
  expect(states.at(-1).streams['chat-b']['kory-manager'].content).toBe('Other chat');
});

test('resume replaces a stale open socket and restores the active subscription', () => {
  const { client, instances, states, timers } = sockets();
  client.connect('chat-a');
  client.connect('chat-a');
  expect(instances).toHaveLength(1);
  instances[0].open();
  const oldClose = instances[0].onclose;
  client.resume();
  expect(instances).toHaveLength(2);
  instances[1].open();
  expect(instances[1].sent.some((message) => message.type === 'subscribe_session' && message.sessionId === 'chat-a')).toBe(true);
  oldClose();
  expect(states.at(-1).connection).toBe('connected');
  expect(timers).toHaveLength(0);
  instances[0].message({ type: 'kory.ask_user', sessionId: 'chat-a', payload: { question: 'Stale question' } });
  expect(states.at(-1).questions).toEqual({});
});

test('suspension cancels retries; repeated resume/suspend does not duplicate sockets', () => {
  const { client, instances, timers } = sockets();
  client.connect();
  instances[0].close();
  expect(timers[0].delay).toBe(1600);
  client.suspend();
  client.suspend();
  client.connect();
  expect(timers[0].cancelled).toBe(true);
  timers[0].callback();
  expect(instances).toHaveLength(1);
  client.resume();
  expect(instances).toHaveLength(2);
  client.dispose();
  client.resume();
  expect(instances).toHaveLength(2);
});

test('socket errors recover even if the platform never emits close; backoff increases', () => {
  const { client, instances, timers } = sockets();
  client.connect();
  instances[0].onerror();
  expect(timers[0].delay).toBe(1600);
  timers[0].callback();
  instances[1].onerror();
  expect(timers[1].delay).toBe(3200);
});

test('the first native output chunk is bounded as well as later chunks', () => {
  const { client, instances, states } = sockets();
  client.connect('chat-a');
  instances[0].open();
  instances[0].message({ type: 'native.command', sessionId: 'chat-a', payload: {
    messageId: 'output', command: 'test', text: 'x'.repeat(100_000),
  } });
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toHaveLength(60_000);
});

test('direct durable output survives replay, missing chunks and a new timeline epoch', () => {
  const { client, instances, states } = sockets();
  const command = (sequence, text, epoch = 1) => ({
    type: 'native.command', sessionId: 'chat-a', epoch, sequence,
    payload: { messageId: 'output', command: 'test', text, isPartial: true },
  });
  client.connect('chat-a');
  instances[0].open();
  instances[0].message(command(1, 'A'));
  instances[0].message(command(2, 'B'));
  instances[0].message(command(2, 'B'));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('AB');

  client.resume();
  instances[1].open();
  expect(instances[1].sent.find((item) => item.type === 'subscribe_session' && item.sessionId === 'chat-a'))
    .toMatchObject({ epoch: 1, sequence: 2 });
  instances[1].message(command(1, 'A'));
  instances[1].message(command(2, 'B'));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('AB');

  instances[1].message(command(4, 'D'));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('AB');
  expect(instances[1].sent.at(-1)).toMatchObject({
    type: 'subscribe_session', sessionId: 'chat-a', epoch: 1, sequence: 2,
  });
  instances[1].message(command(3, 'C'));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('ABCD');

  instances[1].message({
    type: 'session.timeline_rewritten', sessionId: 'chat-a', epoch: 2, sequence: 1,
    payload: { reason: 'conversation_rewind', eventEpoch: 2 },
  });
  instances[1].message(command(2, 'New', 2));
  instances[1].message(command(5, 'old', 1));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('New');
});

test('direct live output ignores malformed cursor metadata after a timeline update', () => {
  const { client, instances, states } = sockets();
  const output = (epoch, sequence, text) => ({
    type: 'native.command', sessionId: 'chat-a', epoch, sequence,
    payload: { messageId: 'output', command: 'status', text, isPartial: true },
  });
  client.connect('chat-a');
  instances[0].open();
  instances[0].message(output(2, 1, 'New'));
  instances[0].message(output(1, 0, 'Old'));
  instances[0].message(output(2, undefined, 'Broken'));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('New');
});

test('direct missing-chunk replay retries a lost request and stops once output catches up', () => {
  const { client, instances, states, timers } = sockets();
  const output = (sequence, text) => ({
    type: 'native.command', sessionId: 'chat-a', epoch: 1, sequence,
    payload: { messageId: 'output', command: 'test', text, isPartial: true },
  });
  client.connect('chat-a');
  instances[0].open();
  instances[0].message(output(1, 'A'));
  instances[0].message(output(3, 'C'));

  const replayRequests = () => instances[0].sent.filter((item) =>
    item.type === 'subscribe_session' && item.sessionId === 'chat-a' &&
    item.epoch === 1 && item.sequence === 1);
  expect(replayRequests()).toHaveLength(1);
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('A');

  // The first request is lost, but the socket never closes. The client must
  // make progress on its own rather than waiting for another incoming chunk.
  const firstRetry = timers.at(-1);
  expect(firstRetry?.delay).toBe(1600);
  firstRetry.callback();
  expect(replayRequests()).toHaveLength(2);
  const secondRetry = timers.at(-1);
  expect(secondRetry?.delay).toBe(3200);

  instances[0].message(output(2, 'B'));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('ABC');
  expect(secondRetry.cancelled).toBe(true);
  secondRetry.callback();
  expect(replayRequests()).toHaveLength(2);
});

test('direct replay retry from a disconnected socket cannot block new recovery', () => {
  const { client, instances, timers, states } = sockets();
  const output = (sequence, text) => ({
    type: 'native.command', sessionId: 'chat-a', epoch: 1, sequence,
    payload: { messageId: 'out', command: 'status', text, isPartial: true },
  });
  client.connect('chat-a');
  instances[0].open();
  instances[0].message(output(1, 'A'));
  instances[0].message(output(3, 'C'));
  const staleRetry = timers.at(-1);
  instances[0].close();
  expect(staleRetry.cancelled).toBe(true);
  const reconnect = timers.at(-1);
  reconnect.callback();
  instances[1].open();
  instances[1].message(output(3, 'C'));
  const activeRetry = timers.at(-1);
  expect(activeRetry).not.toBe(staleRetry);
  expect(activeRetry.delay).toBe(1600);
  const newSocketReplayCount = () => instances[1].sent.filter((item) =>
    item.type === 'subscribe_session' && item.epoch === 1 && item.sequence === 1).length;
  const beforeStaleRetry = newSocketReplayCount();
  staleRetry.callback();
  expect(newSocketReplayCount()).toBe(beforeStaleRetry);
  activeRetry.callback();
  expect(newSocketReplayCount()).toBe(beforeStaleRetry + 1);
  instances[1].message(output(2, 'B'));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('ABC');
});

test('direct timeline rewrite invalidates old run and attention controls before accepting a new revision', () => {
  const resolutions = [];
  const { client, instances, states } = sockets((_state, items) => resolutions.push(...(items ?? [])));
  const send = (sequence, type, payload, epoch = 1) => instances[0].message({
    type, sessionId: 'chat-a', epoch, sequence, payload,
  });
  client.connect('chat-a');
  instances[0].open();
  send(1, 'run.state', { snapshot: run(99) });
  send(2, 'kory.ask_user', { ...prompt, questionId: 'old-q' });
  send(3, 'session.changes', { ...pendingReview, reviewId: 'old-r', reviewRevision: 'old-v' });
  send(4, 'native.command', { messageId: 'out', command: 'status', text: 'Old output' });
  const oldQuestion = states.at(-1).questions['chat-a'];
  const oldReview = states.at(-1).reviews['chat-a'];

  send(1, 'session.timeline_rewritten', { reason: 'conversation_rewind' }, 2);
  expect(states.at(-1).nativeCommands['chat-a']).toBeUndefined();
  expect(states.at(-1).runs['chat-a']).toBeUndefined();
  expect(states.at(-1).questions['chat-a']).toBeUndefined();
  expect(states.at(-1).reviews['chat-a']).toBeUndefined();
  expect(resolutions).toEqual([
    { kind: 'question', sessionId: 'chat-a', promptId: 'old-q', status: 'not_pending' },
    { kind: 'review', sessionId: 'chat-a', promptId: 'old-r', reviewRevision: 'old-v', status: 'not_pending' },
  ]);
  send(2, 'run.state', { snapshot: run(1) }, 2);
  expect(states.at(-1).runs['chat-a'].revision).toBe(1);
  expect(() => client.answerQuestion('chat-a', 'Yes', undefined, oldQuestion)).toThrow('changed');
  expect(() => client.resolveReview('chat-a', true, oldReview)).toThrow('changed');
});

test('direct filtered replay advances across stale prompts without dropping output', () => {
  const { client, instances, states } = sockets();
  const output = (sequence, text) => ({ type: 'native.command', sessionId: 'chat-a', epoch: 1,
    sequence, payload: { messageId: 'cli', command: 'status', text, isPartial: true } });
  const skipped = (sequence) => ({ type: 'session.replay_skipped', sessionId: 'chat-a',
    epoch: 1, sequence, payload: null, replayed: true });
  client.connect('chat-a');
  instances[0].open();

  instances[0].message(output(4, 'B'));
  expect(states.at(-1).nativeCommands['chat-a']).toBeUndefined();
  expect(instances[0].sent.at(-1)).toMatchObject({
    type: 'subscribe_session', sessionId: 'chat-a', epoch: 1, sequence: 0,
  });
  instances[0].message(skipped(1));
  instances[0].message(skipped(2));
  instances[0].message(output(3, 'A'));
  instances[0].message(skipped(2));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('AB');
  expect(states.at(-1).questions['chat-a']).toBeUndefined();
  expect(states.at(-1).reviews['chat-a']).toBeUndefined();
  client.resume();
  instances[1].open();
  expect(instances[1].sent.find((message) => message.type === 'subscribe_session'))
    .toMatchObject({ sessionId: 'chat-a', epoch: 1, sequence: 4 });
});

test('direct actionable waits tolerate malformed lists without subscribing to invalid chats', () => {
  const { client, instances } = sockets();
  client.connect('chat-a');
  instances[0].open();
  const subscriptions = () => instances[0].sent
    .filter((message) => message.type === 'subscribe_session')
    .map((message) => message.sessionId);

  expect(() => instances[0].message({ type: 'session.actionable_waits', payload: {
    questionSessionIds: { malformed: true },
    reviewSessionIds: ['chat-b', null, '', 10],
  } })).not.toThrow();
  expect(subscriptions()).toEqual(['chat-a', 'chat-b']);
  expect(() => instances[0].message({ type: 'session.actionable_waits', payload: {
    questionSessionIds: 'not-an-array', reviewSessionIds: false,
  } })).not.toThrow();
  expect(subscriptions()).toEqual(['chat-a', 'chat-b']);
});

function linked(rpc, onState = () => {}) {
  const listeners = new Set();
  const states = [];
  const client = new LinkedRemoteEventClient('host', rpc, (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, (state, resolutions) => { states.push(state); onState(state, resolutions); });
  cleanups.push(() => client.dispose());
  return {
    client, states, listeners,
    emit: (event) => listeners.forEach((listener) => listener('host', { type: 'event', event })),
    transport: (connected) => listeners.forEach((listener) => listener('host', { type: 'transport.connection', connected })),
  };
}

test('linked live output ignores malformed cursor metadata after a timeline update', async () => {
  const { client, states, emit } = linked(async (_host, operation) =>
    operation === 'open_chat' ? { eventCursor: { epoch: 2, latestSequence: 0 } } : []);
  const output = (epoch, sequence, text) => ({
    type: 'native.command', sessionId: 'chat-a', epoch, sequence,
    payload: { messageId: 'output', command: 'status', text, isPartial: true },
  });
  client.connect('chat-a');
  await flush();
  emit(output(2, 1, 'New'));
  emit(output(1, 0, 'Old'));
  emit(output(2, undefined, 'Broken'));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('New');
});

const run = (revision) => ({ sessionId: 'chat-a', revision, phase: 'thinking', status: 'active', updatedAt: revision });

test('linked transport reports connecting until an actual host response', async () => {
  const response = deferred();
  const { client, states, listeners } = linked(async () => response.promise);
  client.connect('chat-a');
  client.connect('chat-a');
  expect(listeners.size).toBe(1);
  expect(states.at(-1).connection).toBe('connecting');
  response.resolve({ run: run(1) });
  await flush();
  expect(states.at(-1).connection).toBe('connected');
});

function linkedOutput(sequence, text, epoch = 1) {
  return {
    type: 'native.command', sessionId: 'chat-a', epoch, sequence,
    payload: { messageId: 'output', command: 'test', text },
  };
}

test('linked stream deduplicates live chunks and fills an out-of-order gap from authorized history', async () => {
  const requested = [];
  const { client, states, emit } = linked(async (_host, operation, input) => {
    if (operation === 'open_chat') return { eventCursor: { epoch: 1, latestSequence: 0 } };
    if (operation === 'events') {
      requested.push(input);
      return input.sequence === 2 ? [linkedOutput(3, 'C'), linkedOutput(4, 'D')] : [];
    }
    return {};
  });
  client.connect('chat-a');
  await flush();
  emit(linkedOutput(1, 'A'));
  emit(linkedOutput(2, 'B'));
  emit(linkedOutput(2, 'B'));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('AB');
  emit(linkedOutput(4, 'D'));
  await flush();
  expect(requested).toContainEqual({ sessionId: 'chat-a', epoch: 1, sequence: 2 });
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('ABCD');
});

test('linked history catch-up paginates beyond 100 events, retaining strict sequence order', async () => {
  const cursors = [];
  const { client, states } = linked(async (_host, operation, input) => {
    if (operation === 'open_chat') return { eventCursor: { epoch: 1, latestSequence: 1 } };
    if (operation === 'events') {
      cursors.push(input.sequence);
      if (input.sequence === 1) return Array.from({ length: 100 }, (_, index) => linkedOutput(index + 2, 'x'));
      if (input.sequence === 101) return [linkedOutput(102, '!')];
      return [];
    }
    return {};
  });
  client.connect('chat-a');
  await flush();
  expect(cursors).toEqual([1, 101]);
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe(`${'x'.repeat(100)}!`);
});

test('linked rewritten epoch resets old output and run revision, and rejects stale chunks', async () => {
  let epoch = 1;
  const { client, states, emit } = linked(async (_host, operation) => {
    if (operation === 'open_chat') return {
      run: run(epoch === 1 ? 100 : 1),
      eventCursor: { epoch, latestSequence: epoch === 1 ? 1 : 0 },
    };
    if (operation === 'events') return [];
    return {};
  });
  client.connect('chat-a');
  await flush();
  emit(linkedOutput(2, 'Old'));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('Old');
  expect(states.at(-1).runs['chat-a'].revision).toBe(100);
  epoch = 2;
  client.resume();
  await flush();
  expect(states.at(-1).runs['chat-a'].revision).toBe(1);
  expect(states.at(-1).nativeCommands['chat-a']).toBeUndefined();
  emit(linkedOutput(1, 'New', 2));
  emit(linkedOutput(3, 'Old', 1));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('New');
});

test('linked open ignores old-epoch snapshot after a newer live timeline arrives', async () => {
  const opening = deferred();
  const replayCursors = [];
  const { client, states, emit } = linked(async (_host, operation, input) => {
    if (operation === 'open_chat') return opening.promise;
    if (operation === 'events') { replayCursors.push(input); return []; }
    return {};
  });
  client.connect('chat-a');
  emit({ type: 'run.state', sessionId: 'chat-a', epoch: 2, sequence: 1,
    payload: { snapshot: run(1) } });
  opening.resolve({
    eventCursor: { epoch: 1, latestSequence: 8 },
    run: run(100), question: prompt, review: pendingReview,
  });
  await flush();
  expect(states.at(-1).connection).toBe('connected');
  expect(states.at(-1).runs['chat-a'].revision).toBe(1);
  expect(states.at(-1).questions['chat-a']).toBeUndefined();
  expect(states.at(-1).reviews['chat-a']).toBeUndefined();
  expect(replayCursors).toContainEqual({ sessionId: 'chat-a', epoch: 2, sequence: 1 });
});

test('linked history retry restores connected controls after successful replay', async () => {
  const timers = [];
  const setSpy = spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay) => {
    const timer = { callback, delay, cancelled: false };
    timers.push(timer);
    return timer;
  });
  const clearSpy = spyOn(globalThis, 'clearTimeout').mockImplementation((timer) => {
    if (timer) timer.cancelled = true;
  });
  cleanups.push(() => { setSpy.mockRestore(); clearSpy.mockRestore(); });
  let replayCount = 0;
  const { client, states } = linked(async (_host, operation) => {
    if (operation === 'open_chat') return { eventCursor: { epoch: 1, latestSequence: 0 } };
    if (operation === 'events') {
      if (++replayCount === 1) throw new Error('Relay interrupted replay');
      return [linkedOutput(1, 'Recovered')];
    }
    return {};
  });
  client.connect('chat-a');
  await flush();
  expect(states.at(-1).connection).toBe('error');
  expect(timers.at(-1).delay).toBe(1600);
  timers.at(-1).callback();
  await flush();
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('Recovered');
  expect(states.at(-1).connection).toBe('connected');
});

test('linked disconnect invalidates an unfinished open; reconnect installs the current watch', async () => {
  const first = deferred();
  const second = deferred();
  let opens = 0;
  const { client, states, transport } = linked(async (_host, operation) => {
    if (operation === 'open_chat') return ++opens === 1 ? first.promise : second.promise;
    return {};
  });
  client.connect('chat-a');
  expect(opens).toBe(1);
  transport(false);
  expect(states.at(-1).connection).toBe('disconnected');
  first.resolve({ run: run(9), eventCursor: { epoch: 1, latestSequence: 0 } });
  await flush();
  expect(states.at(-1).connection).toBe('disconnected');
  expect(states.at(-1).runs['chat-a']).toBeUndefined();
  transport(true);
  expect(opens).toBe(2);
  second.resolve({ run: run(1), eventCursor: { epoch: 1, latestSequence: 0 } });
  await flush();
  expect(states.at(-1).connection).toBe('connected');
  expect(states.at(-1).runs['chat-a'].revision).toBe(1);
});

test('linked transport ignores stale queued events while offline and replays from the last applied cursor', async () => {
  const replayCursors = [];
  const { client, states, emit, transport } = linked(async (_host, operation, input) => {
    if (operation === 'open_chat') return { eventCursor: { epoch: 1, latestSequence: 0 } };
    if (operation === 'events') {
      replayCursors.push(input);
      return input.sequence === 1 ? [linkedOutput(2, 'B')] : [];
    }
    return {};
  });
  client.connect('chat-a');
  await flush();
  emit(linkedOutput(1, 'A'));
  transport(false);
  emit(linkedOutput(2, 'B'));
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('A');
  expect(states.at(-1).connection).toBe('disconnected');
  transport(true);
  await flush();
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('AB');
  expect(replayCursors).toContainEqual({ sessionId: 'chat-a', epoch: 1, sequence: 1 });
});

test('linked epoch rewrite removes stale question and review leases before accepting new controls', async () => {
  const { client, states, emit } = linked(async (_host, operation) =>
    operation === 'open_chat' ? { eventCursor: { epoch: 1, latestSequence: 0 } } : []);
  client.connect('chat-a');
  await flush();
  emit({ type: 'kory.ask_user', sessionId: 'chat-a', epoch: 1, sequence: 1, payload: {
    sessionId: 'chat-a', questionId: 'old-q', question: 'Approve?', options: ['Yes'],
  } });
  emit({ type: 'session.changes', sessionId: 'chat-a', epoch: 1, sequence: 2, payload: {
    sessionId: 'chat-a', reviewId: 'old-r', reviewRevision: 'old-revision', changes: [],
  } });
  const question = states.at(-1).questions['chat-a'];
  const review = states.at(-1).reviews['chat-a'];
  expect(question?.questionId).toBe('old-q');
  expect(review?.reviewId).toBe('old-r');
  emit({ type: 'session.timeline_rewritten', sessionId: 'chat-a', epoch: 2, sequence: 1,
    payload: { reason: 'conversation_rewind' } });
  expect(states.at(-1).questions['chat-a']).toBeUndefined();
  expect(states.at(-1).reviews['chat-a']).toBeUndefined();
  await expect(client.answerQuestion('chat-a', 'Yes', undefined, question)).rejects.toThrow('This request changed');
  await expect(client.resolveReview('chat-a', true, review)).rejects.toThrow('This request changed');
});

test('late linked snapshot cannot resurrect a resolved question or regress run state', async () => {
  const response = deferred();
  const { client, states, emit } = linked(async () => response.promise);
  client.connect('chat-a');
  emit({ type: 'run.state', sessionId: 'chat-a', payload: { snapshot: run(5) } });
  emit({ type: 'kory.ask_user_resolved', sessionId: 'chat-a', payload: { questionId: 'old-question', status: 'answered' } });
  response.resolve({ run: run(1), question: { questionId: 'old-question', question: 'Old question' } });
  await flush();
  expect(states.at(-1).runs['chat-a'].revision).toBe(5);
  expect(states.at(-1).questions['chat-a']).toBeUndefined();
});

test('linked resume reopens the session once; disposal ignores pending responses', async () => {
  const response = deferred();
  let opened = 0;
  const { client, states, listeners } = linked(async (_host, operation) => {
    if (operation === 'open_chat') { opened++; return response.promise; }
    return {};
  });
  client.connect('chat-a');
  client.suspend();
  expect(listeners.size).toBe(0);
  client.resume();
  expect(listeners.size).toBe(1);
  expect(opened).toBe(2);
  client.dispose();
  const updates = states.length;
  response.reject(new Error('Disconnected'));
  await flush();
  expect(states).toHaveLength(updates);
  expect(listeners.size).toBe(0);
});

test('linked answer and review failures propagate to the control provider', async () => {
  const { client, states, emit } = linked(async (_host, operation) => {
    if (operation === 'answer' || operation === 'review') throw new Error('Host unavailable');
    return {};
  });
  client.connect('chat-a');
  await flush();
  emit({ type: 'kory.ask_user', sessionId: 'chat-a', payload: prompt });
  emit({ type: 'session.changes', sessionId: 'chat-a', payload: pendingReview });
  await expect(client.answerQuestion('chat-a', 'Yes', undefined, states.at(-1).questions['chat-a'])).rejects.toThrow('Host unavailable');
  await expect(client.resolveReview('chat-a', true, states.at(-1).reviews['chat-a'])).rejects.toThrow('Host unavailable');
});

function responseObserver() {
  const store = new AttentionResponseStore();
  let previous = EMPTY_REMOTE_EVENT_STATE;
  return {
    store,
    receive(next, resolutions) {
      store.reconcile(target, previous, next, resolutions);
      previous = next;
    },
  };
}

const prompt = { sessionId: 'chat-a', questionId: 'q-a', question: 'Choose', options: ['Go'], allowOther: true };
const pendingReview = { sessionId: 'chat-a', reviewId: 'r-a', changes: [] };

test('direct timeline rewrite closes old saved responses without implying a successful answer or review', () => {
  const { store, receive } = responseObserver();
  const { client, instances, states } = sockets(receive);
  const send = (sequence, type, payload, epoch = 1) => instances[0].message({
    type, sessionId: 'chat-a', epoch, sequence, payload,
  });
  client.connect('chat-a');
  instances[0].open();
  send(1, 'kory.ask_user', prompt);
  send(2, 'session.changes', { ...pendingReview, reviewRevision: 'v1' });
  const questionKey = attentionResponseKey(target, 'question', states.at(-1).questions['chat-a']);
  const reviewKey = attentionResponseKey(target, 'review', states.at(-1).reviews['chat-a']);
  store.setText(questionKey, 'Keep unconfirmed answer');
  store.submitted(store.begin(questionKey));
  store.submitted(store.begin(reviewKey));

  send(1, 'session.timeline_rewritten', { reason: 'conversation_rewind' }, 2);
  expect(store.read(questionKey)).toMatchObject({ phase: 'closed', text: 'Keep unconfirmed answer' });
  expect(store.read(reviewKey).phase).toBe('closed');
  expect(states.at(-1).questions['chat-a']).toBeUndefined();
  expect(states.at(-1).reviews['chat-a']).toBeUndefined();
  expect(instances[0].sent.some((message) =>
    message.type === 'user_input' || message.type === 'session.accept_changes')).toBe(false);
});

for (const transport of ['direct', 'linked']) {
  test(`${transport} sends the displayed revision and ignores stale or malformed review acknowledgments`, async () => {
    const displayed = { ...pendingReview, reviewRevision: 'publication-b' };
    let client, states, emit;
    const actions = [];
    if (transport === 'direct') {
      const fixture = sockets();
      fixture.client.connect('chat-a');
      fixture.instances[0].open();
      ({ client, states } = fixture);
      emit = (event) => fixture.instances[0].message(event);
      const originalSend = fixture.instances[0].send.bind(fixture.instances[0]);
      fixture.instances[0].send = (raw) => { actions.push(JSON.parse(raw)); originalSend(raw); };
    } else {
      const fixture = linked(async (_host, operation, payload) => {
        if (operation === 'review') actions.push(payload);
        return {};
      });
      ({ client, states, emit } = fixture);
      client.connect('chat-a');
      await flush();
    }
    emit({ type: 'session.changes', sessionId: 'chat-a', payload: displayed });
    expect(states.at(-1).reviews['chat-a'].reviewRevision).toBe('publication-b');
    await client.resolveReview('chat-a', true, states.at(-1).reviews['chat-a']);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ reviewId: 'r-a', reviewRevision: 'publication-b' });
    for (const payload of [
      { reviewId: 'r-a', reviewRevision: 'publication-a', status: 'accepted' },
      { reviewId: 'r-a', status: 'rejected' },
      { reviewId: 'r-a', reviewRevision: 'publication-b', status: 'future-status' },
      { reviewRevision: 'publication-b', status: 'not_pending' },
      { reviewId: null, reviewRevision: null, status: 'not_pending' },
      { reviewId: 'r-a', reviewRevision: null, status: 'not_pending' },
      { reviewId: 'r-a', reviewRevision: '', status: 'accepted' },
      { reviewId: 'r-a', reviewRevision: 42, status: 'not_pending' },
    ]) {
      emit({ type: 'session.changes_resolved', sessionId: 'chat-a', payload });
      expect(states.at(-1).reviews['chat-a']?.reviewRevision).toBe('publication-b');
    }
    emit({ type: 'session.changes_resolved', sessionId: 'chat-a', payload: {
      reviewId: 'r-a', reviewRevision: 'publication-b', status: 'accepted',
    } });
    expect(states.at(-1).reviews['chat-a']).toBeUndefined();
  });
}

test('linked run/output and other-chat events cannot suppress pending attention snapshots', async () => {
  const response = deferred();
  const { client, states, emit } = linked(async (_host, operation) => operation === 'open_chat' ? response.promise : {});
  client.connect('chat-a');
  emit({ type: 'run.state', sessionId: 'chat-a', payload: { snapshot: run(5) } });
  emit({ type: 'native.command', sessionId: 'chat-a', payload: { messageId: 'output', command: 'test', text: 'Working' } });
  emit({ type: 'kory.ask_user', sessionId: 'chat-b', payload: { ...prompt, questionId: 'q-b' } });
  emit({ type: 'session.changes', sessionId: 'chat-b', payload: { ...pendingReview, reviewId: 'r-b' } });
  emit({ type: 'kory.ask_user_resolved', sessionId: 'chat-b', payload: { questionId: 'q-b', status: 'answered' } });
  emit({ type: 'session.changes_resolved', sessionId: 'chat-b', payload: { reviewId: 'r-b', status: 'accepted' } });
  response.resolve({ run: run(1), question: prompt, review: pendingReview });
  await flush();
  expect(states.at(-1).questions['chat-a']?.questionId).toBe('q-a');
  expect(states.at(-1).reviews['chat-a']?.reviewId).toBe('r-a');
  expect(states.at(-1).runs['chat-a'].revision).toBe(5);
  expect(states.at(-1).nativeCommands['chat-a'][0].text).toBe('Working');
  expect(states.at(-1).questions['chat-b']).toBeUndefined();
  expect(states.at(-1).reviews['chat-b']).toBeUndefined();
});

test('linked malformed and unknown-status events cannot hide pending attention snapshots', async () => {
  const response = deferred();
  const { client, states, emit } = linked(async (_host, operation) => operation === 'open_chat' ? response.promise : {});
  client.connect('chat-a');
  emit({ type: 'kory.ask_user', sessionId: 'chat-a', payload: { question: 42 } });
  emit({ type: 'session.changes', sessionId: 'chat-a', payload: { changes: null } });
  for (const status of [undefined, 'unknown', 'future-status']) {
    emit({ type: 'kory.ask_user_resolved', sessionId: 'chat-a', payload: { questionId: 'q-a', status } });
    emit({ type: 'session.changes_resolved', sessionId: 'chat-a', payload: { reviewId: 'r-a', status } });
  }
  emit({ type: 'kory.ask_user_resolved', sessionId: 'chat-a', payload: { questionId: null, status: 'not_pending' } });
  for (const payload of [
    { reviewId: null, reviewRevision: null, status: 'not_pending' },
    { reviewRevision: 'publication-a', status: 'not_pending' },
    { reviewId: 'r-a', reviewRevision: 42, status: 'accepted' },
  ]) emit({ type: 'session.changes_resolved', sessionId: 'chat-a', payload });
  response.resolve({ question: prompt, review: pendingReview });
  await flush();
  expect(states.at(-1).questions['chat-a']?.questionId).toBe('q-a');
  expect(states.at(-1).reviews['chat-a']?.reviewId).toBe('r-a');
});

for (const definition of [
  { field: 'question', bucket: 'questions', event: 'kory.ask_user', resolved: 'kory.ask_user_resolved', id: 'questionId', prompt, status: 'answered' },
  { field: 'review', bucket: 'reviews', event: 'session.changes', resolved: 'session.changes_resolved', id: 'reviewId', prompt: pendingReview, status: 'accepted' },
]) {
  const sibling = definition.field === 'question'
    ? { bucket: 'reviews', id: 'reviewId', value: 'r-a' }
    : { bucket: 'questions', id: 'questionId', value: 'q-a' };

  for (const snapshotField of ['old', 'absent']) {
    test(`linked newer ${definition.field} survives an ${snapshotField} snapshot while the other attention kind loads`, async () => {
      const response = deferred();
      const { client, states, emit } = linked(async (_host, operation) => operation === 'open_chat' ? response.promise : {});
      client.connect('chat-a');
      emit({ type: definition.event, sessionId: 'chat-a', payload: { ...definition.prompt, [definition.id]: 'replacement' } });
      response.resolve({ question: prompt, review: pendingReview, [definition.field]: snapshotField === 'absent' ? null : definition.prompt });
      await flush();
      expect(states.at(-1)[definition.bucket]['chat-a']?.[definition.id]).toBe('replacement');
      expect(states.at(-1)[sibling.bucket]['chat-a']?.[sibling.id]).toBe(sibling.value);
    });
  }

  test(`linked resolved ${definition.field} stays closed while the other attention kind loads`, async () => {
    const response = deferred();
    const { client, states, emit } = linked(async (_host, operation) => operation === 'open_chat' ? response.promise : {});
    client.connect('chat-a');
    emit({ type: definition.resolved, sessionId: 'chat-a', payload: { [definition.id]: definition.prompt[definition.id], status: definition.status } });
    response.resolve({ question: prompt, review: pendingReview });
    await flush();
    expect(states.at(-1)[definition.bucket]['chat-a']).toBeUndefined();
    expect(states.at(-1)[sibling.bucket]['chat-a']?.[sibling.id]).toBe(sibling.value);
  });
}

test('linked unrelated events cannot suppress authoritative absence when reconnecting', async () => {
  const { store, receive } = responseObserver();
  const response = deferred();
  let opened = 0;
  const { client, states, emit } = linked(async (_host, operation) => {
    if (operation !== 'open_chat') return {};
    return ++opened === 1 ? { question: prompt, review: pendingReview } : response.promise;
  }, receive);
  client.connect('chat-a');
  await flush();
  const questionKey = attentionResponseKey(target, 'question', prompt);
  const reviewKey = attentionResponseKey(target, 'review', pendingReview);
  store.setText(questionKey, 'Keep this unconfirmed answer');
  store.submitted(store.begin(questionKey));
  store.submitted(store.begin(reviewKey));
  client.resume();
  emit({ type: 'run.state', sessionId: 'chat-a', payload: { snapshot: run(5) } });
  emit({ type: 'kory.ask_user', sessionId: 'chat-b', payload: { ...prompt, questionId: 'q-b' } });
  response.resolve({ question: null, review: null });
  await flush();
  expect(states.at(-1).questions['chat-a']).toBeUndefined();
  expect(states.at(-1).reviews['chat-a']).toBeUndefined();
  expect(states.at(-1).questions['chat-b']?.questionId).toBe('q-b');
  expect(store.read(questionKey)).toMatchObject({ phase: 'closed', text: 'Keep this unconfirmed answer' });
  expect(store.read(reviewKey).phase).toBe('closed');
});

test('linked late opens cannot overwrite attention after a chat A-B-A selection', async () => {
  const requests = [];
  const { client, states } = linked(async (_host, operation) => {
    if (operation !== 'open_chat') return {};
    const request = deferred();
    requests.push(request);
    return request.promise;
  });
  client.connect('chat-a');
  client.setActiveSession('chat-b');
  client.setActiveSession('chat-a');
  expect(requests).toHaveLength(2);
  requests[0].resolve({ question: prompt, review: null });
  requests[1].resolve({ question: { ...prompt, questionId: 'other-chat' }, review: pendingReview });
  await flush();
  await flush();
  expect(requests).toHaveLength(3);
  requests[2].resolve({ question: { ...prompt, questionId: 'current' }, review: pendingReview });
  await flush();
  expect(states.at(-1).questions['chat-a']?.questionId).toBe('current');
  expect(states.at(-1).reviews['chat-a']?.reviewId).toBe('r-a');
  expect(states.at(-1).questions['chat-b']).toBeUndefined();
});

test('linked A-B-A navigation retains the current desktop watch when an old close is delayed', async () => {
  const closeA = deferred();
  const watched = new Set();
  let openedA = 0;
  const { client } = linked(async (_host, operation, payload) => {
    const sessionId = payload?.sessionId;
    if (operation === 'open_chat') {
      if (sessionId === 'chat-a') openedA++;
      watched.add(sessionId);
      return { run: run(1) };
    }
    if (operation === 'close_chat') {
      if (sessionId === 'chat-a') await closeA.promise;
      watched.delete(sessionId);
    }
    return {};
  });
  client.connect('chat-a');
  await flush();
  client.setActiveSession('chat-b');
  await flush();
  client.setActiveSession('chat-a');
  await flush();
  closeA.resolve();
  await flush();
  expect(openedA).toBe(2);
  expect(watched.has('chat-a')).toBe(true);
  expect(watched.has('chat-b')).toBe(false);
});

test('real socket reconnect and prompt replay cannot acknowledge or erase an answer', () => {
  const { store, receive } = responseObserver();
  const { client, instances, timers, states } = sockets(receive);
  client.connect('chat-a');
  instances[0].open();
  instances[0].message({ type: 'kory.ask_user', sessionId: 'chat-a', payload: prompt });
  const key = attentionResponseKey(target, 'question', prompt);
  store.setText(key, 'Keep this exact answer');
  const attempt = store.begin(key);
  client.answerQuestion('chat-a', 'Go', undefined, states.at(-1).questions['chat-a']);
  store.submitted(attempt);
  instances[0].close();
  timers[0].callback();
  instances[1].open();
  expect(store.read(key)).toMatchObject({ text: 'Keep this exact answer', phase: 'waiting' });
  instances[1].message({ type: 'kory.ask_user', sessionId: 'chat-a', payload: prompt });
  expect(store.begin(key)).toBeNull();
  expect(instances[1].sent.some((message) => message.type === 'user_input')).toBe(false);
  instances[1].message({ type: 'kory.ask_user_resolved', sessionId: 'chat-a', payload: { questionId: 'q-a', status: 'answered' } });
  expect(store.read(key).phase).toBe('resolved');
});

test('reconnecting while another chat is active rechecks previous unanswered sessions', () => {
  const { store, receive } = responseObserver();
  const { client, instances } = sockets(receive);
  client.connect('chat-a');
  instances[0].open();
  instances[0].message({ type: 'kory.ask_user', sessionId: 'chat-a', payload: prompt });
  const key = attentionResponseKey(target, 'question', prompt);
  store.submitted(store.begin(key));
  client.setActiveSession('chat-b');
  client.resume();
  instances[1].open();
  expect(instances[1].sent.filter((message) => message.type === 'subscribe_session').map((message) => message.sessionId).sort()).toEqual(['chat-a', 'chat-b']);
  instances[1].message({ type: 'kory.ask_user_resolved', sessionId: 'chat-a', payload: { status: 'not_pending' } });
  expect(store.read(key).phase).toBe('closed');
});

for (const transport of ['direct', 'linked']) {
  test(`${transport} late resolutions cannot remove a replacement question or review`, async () => {
    const newerQuestion = { ...prompt, questionId: 'q-b' };
    const newerReview = { ...pendingReview, reviewId: 'r-b' };
    let states, emit;
    if (transport === 'direct') {
      const fixture = sockets();
      fixture.client.connect('chat-a');
      fixture.instances[0].open();
      states = fixture.states;
      emit = (message) => fixture.instances[0].message(message);
    } else {
      const fixture = linked(async () => ({}));
      fixture.client.connect('chat-a');
      await flush();
      ({ states, emit } = fixture);
    }
    emit({ type: 'kory.ask_user', sessionId: 'chat-a', payload: newerQuestion });
    emit({ type: 'session.changes', sessionId: 'chat-a', payload: newerReview });
    emit({ type: 'kory.ask_user_resolved', sessionId: 'chat-a', payload: { questionId: 'q-a', status: 'answered' } });
    emit({ type: 'session.changes_resolved', sessionId: 'chat-a', payload: { reviewId: 'r-a', status: 'accepted' } });
    expect(states.at(-1).questions['chat-a']?.questionId).toBe('q-b');
    expect(states.at(-1).reviews['chat-a']?.reviewId).toBe('r-b');
  });
}

test('linked snapshot absence closes the prompt without claiming the response succeeded', async () => {
  const { store, receive } = responseObserver();
  let opened = 0;
  const { client } = linked(async (_host, operation) => operation === 'open_chat' && ++opened === 1
    ? { question: prompt, review: pendingReview } : { question: null, review: null }, receive);
  client.connect('chat-a');
  await flush();
  const key = attentionResponseKey(target, 'question', prompt);
  store.setText(key, 'Recover this answer');
  store.submitted(store.begin(key));
  client.resume();
  await flush();
  expect(store.read(key)).toMatchObject({ phase: 'closed', text: 'Recover this answer' });
});

test('replacement prompts preserve an unconfirmed response instead of marking it successful', () => {
  const { store, receive } = responseObserver();
  const { client, instances } = sockets(receive);
  client.connect('chat-a');
  instances[0].open();
  instances[0].message({ type: 'kory.ask_user', sessionId: 'chat-a', payload: prompt });
  const key = attentionResponseKey(target, 'question', prompt);
  store.setText(key, 'Unconfirmed answer');
  store.submitted(store.begin(key));
  instances[0].message({ type: 'kory.ask_user', sessionId: 'chat-a', payload: { ...prompt, questionId: 'q-b' } });
  expect(store.read(key)).toMatchObject({ phase: 'closed', text: 'Unconfirmed answer' });
});

for (const transport of ['direct', 'linked']) {
  async function attentionFixture(receive) {
    if (transport === 'direct') {
      const fixture = sockets(receive);
      fixture.client.connect('chat-a');
      fixture.instances[0].open();
      return { ...fixture, emit: (event) => fixture.instances[0].message(event) };
    }
    const fixture = linked(async () => ({}), receive);
    fixture.client.connect('chat-a');
    await flush();
    return fixture;
  }

  test(`${transport} unknown resolution events preserve live prompts and waiting responses`, async () => {
    const { store, receive } = responseObserver();
    const { states, emit } = await attentionFixture(receive);
    const questionKey = attentionResponseKey(target, 'question', prompt);
    const reviewKey = attentionResponseKey(target, 'review', pendingReview);
    emit({ type: 'kory.ask_user', sessionId: 'chat-a', payload: prompt });
    emit({ type: 'session.changes', sessionId: 'chat-a', payload: pendingReview });
    store.setText(questionKey, 'Keep my answer');
    store.submitted(store.begin(questionKey));
    store.submitted(store.begin(reviewKey));
    for (const status of [undefined, 'unknown', 'future-status']) {
      emit({ type: 'kory.ask_user_resolved', sessionId: 'chat-a', payload: { questionId: 'q-a', status } });
      emit({ type: 'session.changes_resolved', sessionId: 'chat-a', payload: { reviewId: 'r-a', status } });
      expect(states.at(-1).questions['chat-a']?.questionId).toBe('q-a');
      expect(states.at(-1).reviews['chat-a']?.reviewId).toBe('r-a');
      expect(store.read(questionKey)).toMatchObject({ phase: 'waiting', text: 'Keep my answer' });
      expect(store.read(reviewKey).phase).toBe('waiting');
    }
  });

  test(`${transport} late host confirmation settles only the original saved prompt`, async () => {
    const { store, receive } = responseObserver();
    const { states, emit } = await attentionFixture(receive);
    const oldKey = attentionResponseKey(target, 'question', prompt);
    const replacement = { ...prompt, questionId: 'q-b' };
    const newKey = attentionResponseKey(target, 'question', replacement);
    emit({ type: 'kory.ask_user', sessionId: 'chat-a', payload: prompt });
    store.setText(oldKey, 'Original answer');
    const attempt = store.begin(oldKey);
    store.submitted(attempt);
    emit({ type: 'kory.ask_user', sessionId: 'chat-a', payload: replacement });
    store.setText(newKey, 'Replacement answer');
    expect(store.read(oldKey).phase).toBe('closed');
    emit({ type: 'kory.ask_user_resolved', sessionId: 'chat-a', payload: { questionId: 'q-a', status: 'answered' } });
    store.submitted(attempt);
    store.failed(attempt, 'Late failure');
    expect(store.read(oldKey)).toMatchObject({ phase: 'resolved', text: 'Original answer', outcome: 'answered', error: null });
    expect(store.read(newKey)).toMatchObject({ phase: 'idle', text: 'Replacement answer' });
    expect(states.at(-1).questions['chat-a']?.questionId).toBe('q-b');
  });
}
