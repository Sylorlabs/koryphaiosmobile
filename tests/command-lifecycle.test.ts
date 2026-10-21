import { expect, test } from 'bun:test';
import { ControlRequestScope, recordCommand, runCommandLifecycle, type CommandStatus } from '../src/control/commandLifecycle';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('accepted mutation remains accepted when reconciliation fails, without replay', async () => {
  let sends = 0;
  const statuses: CommandStatus[] = [];
  const accepted = { accepted: true, sessionId: 'new-session' };
  const result = await runCommandLifecycle({
    id: 'create', name: 'session.create',
    execute: async () => { sends++; return accepted; },
    reconcile: async () => { throw new Error('Read timed out'); },
    publish: (status) => statuses.push(status),
  });
  expect(result).toBe(accepted);
  expect(sends).toBe(1);
  expect(statuses.map((status) => status.state)).toEqual(['running', 'accepted', 'warning']);
  expect(statuses.at(-1)?.message).toContain('Do not repeat');
  expect(statuses.at(-1)?.acknowledgedAt).toBeNumber();
});

test('actual command failure rejects and never reconciles or retries', async () => {
  let reads = 0;
  let sends = 0;
  const failure = new Error('Connection closed after send');
  const statuses: CommandStatus[] = [];
  await expect(runCommandLifecycle({
    id: 'stop', name: 'agent.control',
    execute: async () => { sends++; throw failure; },
    reconcile: async () => { reads++; },
    publish: (status) => statuses.push(status),
  })).rejects.toBe(failure);
  expect(sends).toBe(1);
  expect(reads).toBe(0);
  expect(statuses.at(-1)?.message).toContain('not confirmed');
});

test('negative acknowledgement does not become success', async () => {
  await expect(runCommandLifecycle({
    id: 'rejected', name: 'session.create', execute: async () => ({ accepted: false }),
    reconcile: async () => { throw new Error('Must not read'); }, publish: () => {},
  })).rejects.toThrow('did not accept');
});

test('local feedback precedes send; acknowledgement precedes slow state refresh', async () => {
  const read = deferred<void>();
  const statuses: CommandStatus[] = [];
  let clock = 0;
  const promise = runCommandLifecycle({
    id: 'timing', name: 'session.create', now: () => ++clock,
    execute: async () => {
      expect(statuses.at(-1)?.state).toBe('running');
      return { accepted: true };
    },
    reconcile: () => read.promise, publish: (status) => statuses.push(status),
  });
  await Promise.resolve();
  expect(statuses.at(-1)?.state).toBe('accepted');
  expect(statuses.at(-1)?.reconciledAt).toBeUndefined();
  read.resolve();
  await promise;
  const final = statuses.at(-1)!;
  expect(final.state).toBe('accepted');
  expect(final.message).toContain('Latest state loaded');
  expect(final.feedbackPublishedAt).toBeLessThan(final.sentAt!);
  expect(final.sentAt).toBeLessThan(final.acknowledgedAt!);
  expect(final.acknowledgedAt).toBeLessThan(final.reconciledAt!);
});

test('out-of-order concurrent commands retain both outcomes', async () => {
  let history: CommandStatus[] = [];
  const first = deferred<{ accepted: boolean }>();
  const second = deferred<{ accepted: boolean }>();
  const start = (id: string, pending: typeof first) => runCommandLifecycle({
    id, name: 'setting.update', execute: () => pending.promise, reconcile: async () => {},
    publish: (status) => { history = recordCommand(history, status); },
  });
  const a = start('first', first);
  const b = start('second', second);
  second.resolve({ accepted: true });
  await b;
  expect(history.find((item) => item.id === 'first')?.state).toBe('running');
  first.reject(new Error('Request lost'));
  await expect(a).rejects.toThrow('Request lost');
  expect(history.map((item) => [item.id, item.state])).toEqual([['first', 'error'], ['second', 'accepted']]);
});

test('a stale selection cannot be presented as a refreshed host result', async () => {
  const statuses: CommandStatus[] = [];
  let sends = 0;
  await runCommandLifecycle({
    id: 'stale', name: 'session.select',
    execute: async () => { sends++; return { accepted: true }; },
    reconcile: async () => false,
    publish: (status) => statuses.push(status),
  });
  expect(sends).toBe(1);
  expect(statuses.at(-1)?.state).toBe('accepted');
  expect(statuses.at(-1)?.reconciledAt).toBeUndefined();
  expect(statuses.at(-1)?.message).toContain('Selection changed');
  expect(statuses.some((status) => status.state === 'success')).toBe(false);
});

test('older snapshots and old selections cannot overwrite newer state', () => {
  const scope = new ControlRequestScope();
  const poll = scope.beginSnapshot();
  const firstSelection = scope.beginCommand(true);
  expect(scope.acceptsSnapshot(poll)).toBe(false);
  const firstRead = scope.beginSnapshot();
  scope.beginCommand(true);
  expect(scope.acceptsSelection(firstSelection)).toBe(false);
  expect(scope.acceptsSnapshot(firstRead)).toBe(false);
  const older = scope.beginSnapshot();
  const newer = scope.beginSnapshot();
  expect(scope.acceptsSnapshot(older)).toBe(false);
  expect(scope.acceptsSnapshot(newer)).toBe(true);
});

test('disconnect invalidates outstanding host reads and commands', () => {
  const scope = new ControlRequestScope();
  const command = scope.beginCommand(false);
  const read = scope.beginSnapshot();
  scope.dispose();
  expect(scope.acceptsSelection(command)).toBe(false);
  expect(scope.acceptsSnapshot(read)).toBe(false);
  expect(new ControlRequestScope().acceptsSelection(0)).toBe(true);
});

test('history bounds completed entries but preserves pending operations', () => {
  let history: CommandStatus[] = [{ id: 'pending', name: 'x', label: 'x', state: 'running', message: '', startedAt: 0, feedbackPublishedAt: 0 }];
  for (let index = 0; index < 100; index++) {
    history = recordCommand(history, { ...history[0], id: String(index), state: 'success' });
  }
  expect(history).toHaveLength(31);
  expect(history[0].id).toBe('pending');
});
