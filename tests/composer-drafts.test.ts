import { expect, test } from 'bun:test';
import { ComposerDraftStore, MAX_COMPOSER_ATTACHMENT_BYTES, composerDestinationKey } from '../src/control/composerDrafts';
import type { ComposerDestination } from '../src/control/composerDrafts';
import type { MessageAttachment } from '../src/types/control';

const target: ComposerDestination = { baseUrl: 'linked://host-a', machineId: 'host-a', projectId: 'project-a', sessionId: 'chat-a' };
const file = (name: string, size = 4): MessageAttachment => ({ type: 'file', name, data: 'data', size });
function setup() {
  const store = new ComposerDraftStore();
  const lease = store.activate(target);
  store.setBody(lease.key, '  Original draft\n');
  store.setAttachments(lease.key, () => [file('original.txt')]);
  return { store, lease };
}

test('rapid send presses synchronously acquire a single attempt', () => {
  const { store, lease } = setup();
  expect(store.begin(lease)).not.toBeNull();
  expect(store.begin(lease)).toBeNull();
});

test('editing during model preflight preserves new content and cancels the old send', () => {
  const { store, lease } = setup();
  const attempt = store.begin(lease)!;
  store.setBody(lease.key, 'Revised while checking model');
  expect(store.consume(attempt)).toBe(false);
  expect(store.read(lease.key).body).toBe('Revised while checking model');
  expect(store.read(lease.key).attachments[0].name).toBe('original.txt');
  expect(store.busy(lease.key)).toBe(false);
});

test('changing attachments during consent invalidates the old approval', () => {
  const { store, lease } = setup();
  const attempt = store.begin(lease)!;
  store.waitForConsent(attempt);
  store.setAttachments(lease.key, (current) => [...current, file('new.txt')]);
  expect(store.resumeConsent(attempt)).toBe(false);
  expect(store.read(lease.key).attachments).toHaveLength(2);
});

test('leaving a host and returning cannot revive its old preflight', () => {
  const { store, lease } = setup();
  const attempt = store.begin(lease)!;
  const other = store.activate({ ...target, baseUrl: 'linked://host-b', machineId: 'host-b' });
  store.setBody(other.key, 'Host B work');
  const returned = store.activate(target);
  expect(store.consume(attempt)).toBe(false);
  expect(store.read(returned.key).body).toBe('  Original draft\n');
  expect(store.read(other.key).body).toBe('Host B work');
});

test('chat and project changes keep independent drafts', () => {
  const { store, lease } = setup();
  const other = store.activate({ ...target, projectId: 'project-b', sessionId: 'chat-b' });
  store.setBody(other.key, 'Different project');
  expect(store.read(lease.key).body).toBe('  Original draft\n');
  expect(store.read(other.key).body).toBe('Different project');
});

test('a model or focus lease change invalidates consent in the same chat', () => {
  const { store, lease } = setup();
  const attempt = store.begin(lease)!;
  store.waitForConsent(attempt);
  store.activate(target);
  expect(store.resumeConsent(attempt)).toBe(false);
  expect(store.read(lease.key).body).toBe('  Original draft\n');
});

test('a send acknowledgement never clears the next draft', () => {
  const { store, lease } = setup();
  const attempt = store.begin(lease)!;
  expect(store.consume(attempt)).toBe(true);
  store.setBody(lease.key, 'Next message');
  store.setAttachments(lease.key, () => [file('next.txt')]);
  store.finish(attempt);
  expect(store.read(lease.key).body).toBe('Next message');
  expect(store.read(lease.key).attachments[0].name).toBe('next.txt');
  expect(store.read(lease.key).saved).toHaveLength(0);
});

test('send failure retains original raw text/files separately from newer work', () => {
  const { store, lease } = setup();
  const attempt = store.begin(lease)!;
  store.consume(attempt);
  store.setBody(lease.key, 'Next message');
  store.setAttachments(lease.key, () => [file('next.txt')]);
  store.finish(attempt, 'Connection closed before acknowledgement');
  const draft = store.read(lease.key);
  expect(draft.body).toBe('Next message');
  expect(draft.attachments[0].name).toBe('next.txt');
  expect(draft.saved[0].body).toBe('  Original draft\n');
  expect(draft.saved[0].attachments[0].name).toBe('original.txt');
  expect(draft.saved[0].message).toContain('Check this chat before resending');
});

test('restoring a failed draft swaps and preserves the newer draft without a send', () => {
  const { store, lease } = setup();
  const attempt = store.begin(lease)!;
  store.consume(attempt);
  store.setBody(lease.key, 'New work');
  store.finish(attempt, 'Timeout');
  store.restore(lease.key, attempt.id);
  expect(store.read(lease.key).body).toBe('  Original draft\n');
  expect(store.read(lease.key).saved[0].body).toBe('New work');
  expect(store.busy(lease.key)).toBe(false);
  store.restore(lease.key, store.read(lease.key).saved[0].id);
  expect(store.read(lease.key).body).toBe('New work');
  expect(store.read(lease.key).saved[0].body).toBe('  Original draft\n');
});

test('late failure stays with original host/chat after navigation', () => {
  const { store, lease } = setup();
  const attempt = store.begin(lease)!;
  store.consume(attempt);
  const other = store.activate({ ...target, sessionId: 'chat-b' });
  store.setBody(other.key, 'Chat B');
  store.finish(attempt, 'Timeout');
  expect(store.read(other.key).body).toBe('Chat B');
  expect(store.read(other.key).saved).toHaveLength(0);
  expect(store.read(lease.key).saved).toHaveLength(1);
});

test('an already submitted attempt stays locked across navigation until it settles', () => {
  const { store, lease } = setup();
  const attempt = store.begin(lease)!;
  store.consume(attempt);
  store.setBody(lease.key, 'Next');
  store.deactivate(lease);
  const returned = store.activate(target);
  expect(store.begin(returned)).toBeNull();
  store.finish(attempt);
  expect(store.begin(returned)).not.toBeNull();
});

test('double consent confirmation and cancellation during preference storage cannot send twice', () => {
  const { store, lease } = setup();
  const attempt = store.begin(lease)!;
  store.waitForConsent(attempt);
  expect(store.resumeConsent(attempt)).toBe(true);
  expect(store.resumeConsent(attempt)).toBe(false);
  store.cancel(attempt);
  expect(store.consume(attempt)).toBe(false);
  expect(store.read(lease.key).body).toBe('  Original draft\n');
});

test('an old cancellation cannot release the newer send lock', () => {
  const { store, lease } = setup();
  const old = store.begin(lease)!;
  store.setBody(lease.key, 'Edited');
  const next = store.begin(lease)!;
  store.cancel(old);
  expect(store.busy(lease.key)).toBe(true);
  expect(store.consume(next)).toBe(true);
});

test('late file results can append only to their original draft and recheck current total size', () => {
  const { store, lease } = setup();
  const other = store.activate({ ...target, sessionId: 'chat-b' });
  store.setAttachments(lease.key, (current) => [...current, file('picked.txt')]);
  expect(store.read(other.key).attachments).toHaveLength(0);
  expect(store.read(lease.key).attachments).toHaveLength(2);
  expect(() => store.setAttachments(lease.key, (current) => [...current, file('huge', MAX_COMPOSER_ATTACHMENT_BYTES)])).toThrow('15 MB');
  expect(store.read(lease.key).attachments).toHaveLength(2);
});

test('no selected chat disables sending without dropping its draft', () => {
  const store = new ComposerDraftStore();
  const lease = store.activate({ ...target, sessionId: '' });
  store.setBody(lease.key, 'Do not lose this');
  expect(store.begin(lease)).toBeNull();
  expect(store.read(lease.key).body).toBe('Do not lose this');
});

test('destination keys cannot collide when identifiers contain separators', () => {
  expect(composerDestinationKey({ ...target, projectId: 'a|b', sessionId: 'c' }))
    .not.toBe(composerDestinationKey({ ...target, projectId: 'a', sessionId: 'b|c' }));
});

test('attachment limits also cover recovery and are rechecked before restore or send', () => {
  const { store, lease } = setup();
  expect(() => store.saveRecovery(lease.key, {
    body: '', attachments: [file('large.m4a', MAX_COMPOSER_ATTACHMENT_BYTES + 1)], message: 'recovery',
  })).toThrow('15 MB');
  expect(store.read(lease.key).saved).toHaveLength(0);
  const id = store.saveRecovery(lease.key, { body: 'saved', attachments: [file('small')], message: 'recovery' });
  // Simulate stale/legacy state that bypassed normal ingress validation.
  store.read(lease.key).saved[0].attachments[0].size = MAX_COMPOSER_ATTACHMENT_BYTES + 1;
  expect(() => store.restore(lease.key, id)).toThrow('15 MB');
  expect(store.read(lease.key).body).toBe('  Original draft\n');
  expect(store.read(lease.key).saved).toHaveLength(1);
  store.read(lease.key).attachments[0].size = MAX_COMPOSER_ATTACHMENT_BYTES + 1;
  expect(() => store.begin(lease)).toThrow('15 MB');
  expect(store.busy(lease.key)).toBe(false);
});

test('small or invalid size metadata cannot bypass the actual encoded payload limit', () => {
  const { store, lease } = setup();
  const huge = { ...file('large', 1), data: 'a'.repeat((MAX_COMPOSER_ATTACHMENT_BYTES + 3) * 4 / 3) };
  expect(() => store.setAttachments(lease.key, () => [huge])).toThrow('15 MB');
  expect(() => store.setAttachments(lease.key, () => [file('invalid', Number.NaN)])).toThrow('invalid size');
  expect(store.read(lease.key).attachments[0].name).toBe('original.txt');
});

test('disk-only recording recovery cannot be restored into a remote message', () => {
  const { store, lease } = setup();
  const id = store.saveRecovery(lease.key, {
    body: '', attachments: [], message: 'Export recording',
    localRecording: { uri: 'file:///recording.m4a', name: 'recording.m4a', mimeType: 'audio/mp4' },
  });
  expect(() => store.restore(lease.key, id)).toThrow('Export this recording');
  expect(store.read(lease.key).body).toBe('  Original draft\n');
  expect(store.read(lease.key).saved).toHaveLength(1);
});
