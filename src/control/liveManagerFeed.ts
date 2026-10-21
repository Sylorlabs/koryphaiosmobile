import type { FeedEntry, RemoteAgentStream } from '../types/control';

const STREAM_PREFIX = 'live-stream:';

/** Join the latest ordered desktop chunks with the last known stored feed.
 * The host remains authoritative and replaces this transient rendering as
 * soon as a snapshot contains the response. */
export function mergeLiveManagerFeed(
  feed: FeedEntry[],
  sessionId: string,
  stream?: RemoteAgentStream,
): FeedEntry[] {
  if (!sessionId || !stream?.content) return feed;
  const body = stream.truncated ? `… Earlier output is in the desktop transcript.\n${stream.content}` : stream.content;
  const last = feed.at(-1);

  if (last?.kind === 'assistant' && !last.userHidden &&
    (last.agentId === 'kory-manager' || last.agentId === 'manager') &&
    !last.attachments?.length) {
    // When the host already stored all the streamed text, render only the
    // persisted entry. A partially persisted response is extended in place,
    // preserving its message ID and scroll position.
    if (last.body === body || (!stream.truncated && last.body.endsWith(stream.content))) return feed;
    if (!stream.truncated && last.body.length && stream.content.startsWith(last.body)) {
      return [...feed.slice(0, -1), { ...last, body: stream.content, isStreaming: true }];
    }
  }

  return [...feed, {
    id: `${STREAM_PREFIX}${sessionId}:kory-manager`,
    kind: 'assistant', author: 'Kory', agentId: 'kory-manager',
    body, createdAt: '', model: stream.model, meta: stream.complete ? 'Syncing' : 'Streaming',
    // Even after stream.complete the synthetic row has no durable message ID.
    // Keep response actions disabled until a real persisted entry appears.
    isStreaming: true,
  }];
}
