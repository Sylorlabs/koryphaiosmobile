import { expect, test } from 'bun:test';

import { mergeLiveManagerFeed } from '../src/control/liveManagerFeed';
import type { FeedEntry, RemoteAgentStream } from '../src/types/control';

const stream = (content: string, complete = false): RemoteAgentStream => ({
  content, complete, truncated: false, startedAt: 100, updatedAt: 120, model: 'test-model',
});
const user = (id: string): FeedEntry => ({ id, kind: 'user', author: 'You', body: `Question ${id}`, createdAt: '11:00' });
const assistant = (id: string, body: string): FeedEntry => ({
  id, kind: 'assistant', author: 'Kory', body, createdAt: '11:01', agentId: 'kory-manager', messageId: id,
});

test('first manager chunk paints immediately without a stored assistant message', () => {
  const base = [user('q1')];
  const updated = mergeLiveManagerFeed(base, 'chat-1', stream('Hello '));
  expect(updated).toHaveLength(2);
  expect(updated[1].body).toBe('Hello ');
  expect(updated[1].id).toBe('live-stream:chat-1:kory-manager');
  expect(base).toHaveLength(1);
});

test('snapshot containing current response suppresses an identical synthetic bubble', () => {
  const feed = [user('q1'), assistant('response-1', 'Hello world')];
  expect(mergeLiveManagerFeed(feed, 'chat-1', stream('Hello world', true))).toEqual(feed);
});

test('a partial persisted assistant response is extended in place, never shown twice', () => {
  const feed = [user('q1'), assistant('response-1', 'Hello')];
  const updated = mergeLiveManagerFeed(feed, 'chat-1', stream('Hello world'));
  expect(updated).toHaveLength(2);
  expect(updated[1].id).toBe('response-1');
  expect(updated[1].body).toBe('Hello world');
  expect(feed[1].body).toBe('Hello');
});

test('previous answer remains alongside new live output when the new question follows it', () => {
  const feed = [user('q1'), assistant('response-1', 'Old response'), user('q2')];
  const updated = mergeLiveManagerFeed(feed, 'chat-1', stream('New response'));
  expect(updated.map((item) => item.body)).toEqual(['Question q1', 'Old response', 'Question q2', 'New response']);
});

test('a completed unpersisted response stays visible until snapshot catch-up', () => {
  const updated = mergeLiveManagerFeed([user('q1')], 'chat-1', stream('Done.', true));
  expect(updated.at(-1)?.body).toBe('Done.');
});

test('no stream or no selected session returns only real messages', () => {
  const feed = [user('q1')];
  expect(mergeLiveManagerFeed(feed, 'chat-1', undefined)).toEqual(feed);
  expect(mergeLiveManagerFeed(feed, '', stream('Not this chat'))).toEqual(feed);
});
