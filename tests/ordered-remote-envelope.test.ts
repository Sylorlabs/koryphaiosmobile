import { expect, test } from 'bun:test';
import { OrderedRemoteEvents } from '../src/control/orderedRemoteEvents';

type Message = {
  sessionId?: string;
  epoch?: number;
  sequence?: number;
  text: string;
};

test('malformed durable event metadata cannot bypass the applied stream cursor', () => {
  const ordered = new OrderedRemoteEvents<Message>();

  expect(ordered.ingest({ sessionId: 'chat-a', epoch: 2, sequence: 1, text: 'new timeline' }).events)
    .toEqual([{ sessionId: 'chat-a', epoch: 2, sequence: 1, text: 'new timeline' }]);

  // Once epoch 2 is applied, these invalid envelopes must never reach the UI
  // as unordered legacy events. Otherwise a delayed or malformed host frame
  // can replace a run/attention state from the active timeline.
  const invalid: Message[] = [
    { sessionId: 'chat-a', epoch: 1, sequence: 0, text: 'old cursor zero' },
    { sessionId: 'chat-a', epoch: 1, text: 'missing sequence' },
    { sessionId: 'chat-a', sequence: 2, text: 'missing epoch' },
    { sessionId: 'chat-a', epoch: 2, sequence: 1.5, text: 'fractional sequence' },
    { sessionId: 'chat-a', epoch: Number.NaN, sequence: 2, text: 'invalid epoch' },
    { epoch: 2, sequence: 2, text: 'missing session' },
  ];
  for (const event of invalid) {
    expect(ordered.ingest(event).events).toEqual([]);
  }

  expect(ordered.getCursor('chat-a')).toEqual({ epoch: 2, sequence: 1 });
  expect(ordered.ingest({ sessionId: 'chat-a', epoch: 2, sequence: 2, text: 'next' }).events)
    .toEqual([{ sessionId: 'chat-a', epoch: 2, sequence: 2, text: 'next' }]);
});

test('unsequenced legacy messages still flow while valid durable events replay in order', () => {
  const ordered = new OrderedRemoteEvents<Message>();
  const legacy = { sessionId: 'chat-a', text: 'non-durable notification' };
  expect(ordered.ingest(legacy).events).toEqual([legacy]);

  expect(ordered.ingest({ sessionId: 'chat-a', epoch: 1, sequence: 2, text: 'B' })).toMatchObject({
    events: [], replayFrom: { sessionId: 'chat-a', epoch: 1, sequence: 0 },
  });
  expect(ordered.ingest({ sessionId: 'chat-a', epoch: 1, sequence: 1, text: 'A' }).events.map((event) => event.text))
    .toEqual(['A', 'B']);
});
