import { expect, test } from 'bun:test';
import { AttentionResponseStore, attentionResponseKey } from '../src/control/attentionResponses';
import { asReview, EMPTY_REMOTE_EVENT_STATE } from '../src/control/remoteEvents';
import type { PairingTarget, RemoteChangeReview, RemoteEventState, RemoteQuestion } from '../src/types/control';

const target: PairingTarget = { baseUrl: 'https://audit.test', machineId: 'host-a', machineName: 'Audit', token: '' };
const question: RemoteQuestion = { sessionId: 'chat-a', questionId: 'q-a', question: 'Choose a direction', options: ['Go'], allowOther: true };
const key = attentionResponseKey(target, 'question', question);
const live: RemoteEventState = { ...EMPTY_REMOTE_EVENT_STATE, connection: 'connected', questions: { 'chat-a': question } };

test('attention submission retains text and locks until an observed host resolution', () => {
  const store = new AttentionResponseStore();
  store.setText(key, '  Keep my exact answer  ');
  const attempt = store.begin(key)!;
  expect(store.begin(key)).toBeNull();
  store.submitted(attempt);
  expect(store.read(key).text).toBe('  Keep my exact answer  ');
  expect(store.begin(key)).toBeNull();
  store.reconcile(target, live, { ...live, questions: {} }, [
    { kind: 'question', sessionId: 'chat-a', promptId: 'q-a', status: 'answered' },
  ]);
  expect(store.read(key).phase).toBe('resolved');
  store.failed(attempt, 'Late timeout');
  expect(store.read(key).error).toBeNull();
});

test('empty connection and disconnected states never acknowledge an attention response', () => {
  const store = new AttentionResponseStore();
  store.setText(key, 'Do not lose this');
  store.submitted(store.begin(key)!);
  store.reconcile(target, EMPTY_REMOTE_EVENT_STATE, { ...EMPTY_REMOTE_EVENT_STATE, connection: 'connected' });
  store.reconcile(target, live, { ...EMPTY_REMOTE_EVENT_STATE, connection: 'disconnected' });
  store.reconcile(target, live, { ...live, questions: {} });
  expect(store.read(key)).toMatchObject({ text: 'Do not lose this', phase: 'waiting' });
});

test('attention failure preserves the draft and an older attempt cannot modify its manual retry', () => {
  const store = new AttentionResponseStore();
  store.setText(key, 'Original answer');
  const old = store.begin(key)!;
  store.failed(old, 'Offline');
  expect(store.read(key)).toMatchObject({ text: 'Original answer', phase: 'error' });
  store.setText(key, 'Edited after checking the desktop');
  const retry = store.begin(key)!;
  store.submitted(old);
  store.failed(old, 'Late failure');
  expect(store.read(key)).toMatchObject({ text: 'Edited after checking the desktop', phase: 'sending', error: null });
  store.submitted(retry);
  expect(store.read(key).phase).toBe('waiting');
});

test('attention identity isolates hosts, chats, prompt revisions and legacy ID-less prompts', () => {
  const keys = [
    key,
    attentionResponseKey({ ...target, machineId: 'host-b' }, 'question', question),
    attentionResponseKey(target, 'question', { ...question, sessionId: 'chat-b' }),
    attentionResponseKey(target, 'question', { ...question, questionId: 'q-b' }),
    attentionResponseKey(target, 'question', { ...question, questionId: undefined }),
    attentionResponseKey(target, 'question', { ...question, questionId: undefined, options: ['Stop'] }),
  ];
  expect(new Set(keys).size).toBe(keys.length);
  const store = new AttentionResponseStore();
  keys.forEach((value, index) => store.setText(value, `Answer ${index}`));
  keys.forEach((value, index) => expect(store.read(value).text).toBe(`Answer ${index}`));
});

test('a new prompt does not inherit a pending lock or erase its unsent draft', () => {
  const store = new AttentionResponseStore();
  const next = { ...question, questionId: 'q-b' };
  const nextKey = attentionResponseKey(target, 'question', next);
  store.setText(key, 'Unsent thought');
  store.setText(nextKey, 'Next thought');
  store.reconcile(target, live, { ...live, questions: { 'chat-a': next } });
  expect(store.read(key).text).toBe('Unsent thought');
  expect(store.read(nextKey).text).toBe('Next thought');
  expect(store.begin(nextKey)).not.toBeNull();
});

test('review decisions remain locked after submission and settle only from that host and review', () => {
  const store = new AttentionResponseStore();
  const review = { sessionId: 'chat-a', reviewId: 'r-a', changes: [] };
  const reviewKey = attentionResponseKey(target, 'review', review);
  const withReview = { ...live, reviews: { 'chat-a': review } };
  store.submitted(store.begin(reviewKey)!);
  const resolution = { kind: 'review' as const, sessionId: 'chat-a', promptId: 'r-a', status: 'accepted' as const };
  store.reconcile({ ...target, machineId: 'host-b' }, withReview, live, [resolution]);
  expect(store.read(reviewKey).phase).toBe('waiting');
  store.reconcile(target, withReview, live, [resolution]);
  expect(store.read(reviewKey).phase).toBe('resolved');
});

test('review identity survives transport normalization without duplicating a pending decision', () => {
  const review: RemoteChangeReview = {
    sessionId: 'chat-a', reviewId: 'r-a',
    changes: [{ path: 'a.txt', operation: 'edit', linesAdded: 1, linesDeleted: 0 }],
  };
  const parsed = asReview(review.sessionId, review)!;
  const reviewKey = attentionResponseKey(target, 'review', review);
  const parsedKey = attentionResponseKey(target, 'review', parsed);
  expect(parsedKey).toBe(reviewKey);
  const store = new AttentionResponseStore();
  store.submitted(store.begin(reviewKey)!);
  expect(store.begin(parsedKey)).toBeNull();
  expect(attentionResponseKey(target, 'review', {
    ...parsed, changes: [{ ...parsed.changes[0], linesAdded: 2 }],
  })).not.toBe(reviewKey);
});

test('fresh-client resolution settles saved work only for the matching origin and prompt', () => {
  const store = new AttentionResponseStore();
  store.setText(key, 'Answer from before suspension');
  const attempt = store.begin(key)!;
  store.submitted(attempt);
  const resolved = { kind: 'question' as const, sessionId: 'chat-a', promptId: 'q-a', status: 'answered' as const };
  for (const resolution of [{ ...resolved, sessionId: 'chat-b' }, { ...resolved, promptId: 'q-b' }]) {
    store.reconcile(target, EMPTY_REMOTE_EVENT_STATE, EMPTY_REMOTE_EVENT_STATE, [resolution]);
    expect(store.read(key).phase).toBe('waiting');
  }
  store.reconcile(target, EMPTY_REMOTE_EVENT_STATE, EMPTY_REMOTE_EVENT_STATE, [resolved]);
  store.submitted(attempt);
  store.failed(attempt, 'Delayed rejection');
  expect(store.read(key)).toMatchObject({ phase: 'resolved', text: 'Answer from before suspension', error: null });
});

test('authoritative absence closes rather than confirms an unsent or submitted answer', () => {
  for (const submitted of [false, true]) {
    const store = new AttentionResponseStore();
    store.setText(key, 'Saved text');
    if (submitted) store.submitted(store.begin(key)!);
    store.reconcile(target, live, { ...live, questions: {} }, [
      { kind: 'question', sessionId: 'chat-a', status: 'not_pending' },
    ]);
    expect(store.read(key)).toMatchObject({ phase: 'closed', text: 'Saved text', outcome: 'not_pending' });
    expect(store.begin(key)).toBeNull();
  }
});

test('unknown resolution status does not settle a saved response', () => {
  const store = new AttentionResponseStore();
  store.submitted(store.begin(key)!);
  store.reconcile(target, live, live, [
    { kind: 'question', sessionId: 'chat-a', promptId: 'q-a', status: 'unknown' },
  ]);
  expect(store.read(key).phase).toBe('waiting');
});

test('a late identified resolution can confirm the old prompt without settling its replacement', () => {
  const store = new AttentionResponseStore();
  const replacement = { ...question, questionId: 'q-b' };
  const replacementKey = attentionResponseKey(target, 'question', replacement);
  const next = { ...live, questions: { 'chat-a': replacement } };
  store.setText(key, 'Original answer');
  store.submitted(store.begin(key)!);
  store.reconcile(target, live, next);
  store.setText(replacementKey, 'New answer');
  store.reconcile(target, next, next, [
    { kind: 'question', sessionId: 'chat-a', promptId: 'q-a', status: 'answered' },
  ]);
  expect(store.read(key)).toMatchObject({ phase: 'resolved', text: 'Original answer', outcome: 'answered' });
  expect(store.read(replacementKey)).toMatchObject({ phase: 'idle', text: 'New answer' });
});

test('ID-less legacy completion cannot confirm an identified response', () => {
  const store = new AttentionResponseStore();
  store.submitted(store.begin(key)!);
  store.reconcile(target, live, live, [{ kind: 'question', sessionId: 'chat-a', status: 'answered' }]);
  expect(store.read(key).phase).toBe('waiting');
  const legacy = { ...question, questionId: undefined };
  const legacyKey = attentionResponseKey(target, 'question', legacy);
  store.setText(legacyKey, 'Legacy text');
  store.submitted(store.begin(legacyKey)!);
  store.reconcile(target, live, live, [{ kind: 'question', sessionId: 'chat-a', status: 'answered' }]);
  expect(store.read(legacyKey)).toMatchObject({ phase: 'closed', text: 'Legacy text' });
  expect(store.read(key).phase).toBe('waiting');
});

test('identical review republications have independent locks and revision-scoped confirmation', () => {
  const store = new AttentionResponseStore();
  const displayed = { sessionId: 'chat-a', reviewId: 'r-a', reviewRevision: 'revision-a', changes: [] };
  const replacement = { ...displayed, reviewRevision: 'revision-b' };
  const oldKey = attentionResponseKey(target, 'review', displayed);
  const newKey = attentionResponseKey(target, 'review', replacement);
  expect(newKey).not.toBe(oldKey);
  store.submitted(store.begin(oldKey)!);
  const previous = { ...live, reviews: { 'chat-a': displayed } };
  const next = { ...live, reviews: { 'chat-a': replacement } };
  store.reconcile(target, previous, next);
  expect(store.read(oldKey).phase).toBe('closed');
  store.submitted(store.begin(newKey)!);
  store.reconcile(target, next, next, [{ kind: 'review', sessionId: 'chat-a', promptId: 'r-a', reviewRevision: 'revision-a', status: 'accepted' }]);
  expect(store.read(oldKey).phase).toBe('resolved');
  expect(store.read(newKey).phase).toBe('waiting');
  store.reconcile(target, next, next, [{ kind: 'review', sessionId: 'chat-a', promptId: 'r-a', status: 'accepted' }]);
  expect(store.read(newKey).phase).toBe('waiting');
  store.reconcile(target, next, next, [{ kind: 'review', sessionId: 'chat-a', promptId: 'r-a', reviewRevision: 'revision-b', status: 'rejected' }]);
  expect(store.read(newKey)).toMatchObject({ phase: 'resolved', outcome: 'rejected' });
});

test('fresh-client review confirmation is revision scoped and malformed retained keys are ignored', () => {
  const store = new AttentionResponseStore();
  const review = { sessionId: 'chat-a', reviewId: 'r-a', reviewRevision: 'revision-b', changes: [] };
  const currentKey = attentionResponseKey(target, 'review', review);
  const legacyKey = JSON.stringify([target.baseUrl, target.machineId, 'review', 'chat-a', ['r-a', []]]);
  const malformedKeys = ['{', 'null', '{}', JSON.stringify([target.baseUrl, target.machineId, 'review', 'chat-a', null])];
  for (const savedKey of [currentKey, legacyKey, ...malformedKeys]) store.submitted(store.begin(savedKey)!);
  store.reconcile(target, EMPTY_REMOTE_EVENT_STATE, EMPTY_REMOTE_EVENT_STATE, [
    { kind: 'review', sessionId: 'chat-a', promptId: 'r-a', status: 'accepted' },
  ]);
  expect(store.read(legacyKey).phase).toBe('resolved');
  expect(store.read(currentKey).phase).toBe('waiting');
  for (const savedKey of malformedKeys) expect(store.read(savedKey).phase).toBe('waiting');
  store.reconcile(target, EMPTY_REMOTE_EVENT_STATE, EMPTY_REMOTE_EVENT_STATE, [
    { kind: 'review', sessionId: 'chat-a', promptId: 'r-a', reviewRevision: 'revision-b', status: 'rejected' },
  ]);
  expect(store.read(currentKey)).toMatchObject({ phase: 'resolved', outcome: 'rejected' });
});
