import type { RemoteAgentStream, RemoteEventState } from '../types/control';

type StreamEvent = 'stream.delta' | 'stream.clear_content' | 'stream.complete';

// Keep a modest amount of immediate screen content. The authoritative full
// transcript is fetched separately. No chat history is stored by this reducer.
const MAX_CONTENT = 60_000;
const MAX_SESSIONS = 8;
const MAX_AGENTS_PER_SESSION = 8;

export function clearLiveStreamSession(state: RemoteEventState, sessionId: string): RemoteEventState {
  if (!state.streams?.[sessionId]) return state;
  const streams = { ...state.streams };
  delete streams[sessionId];
  return { ...state, streams };
}

export function applyLiveStreamEvent(
  state: RemoteEventState,
  sessionId: string,
  type: StreamEvent,
  payload: unknown,
  timestamp?: number,
): RemoteEventState {
  if (!sessionId || !payload || typeof payload !== 'object') return state;
  const data = payload as Record<string, unknown>;
  const agentId = data.agentId;
  if (typeof agentId !== 'string' || !agentId.trim() || agentId.length > 256) return state;
  const session = state.streams?.[sessionId] ?? {};
  const current = session[agentId];

  if (type === 'stream.clear_content') {
    if (!current) return state;
    const remaining = { ...session };
    delete remaining[agentId];
    if (!Object.keys(remaining).length) return clearLiveStreamSession(state, sessionId);
    return { ...state, streams: { ...state.streams, [sessionId]: remaining } };
  }

  if (type === 'stream.complete') {
    if (!current || current.complete) return state;
    const complete: RemoteAgentStream = { ...current, complete: true };
    return { ...state, streams: { ...state.streams, [sessionId]: { ...session, [agentId]: complete } } };
  }

  // Invalid/malformed deltas must never blank or resurrect a stream.
  if (typeof data.content !== 'string' || !data.content.length) return state;
  const now = typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0
    ? timestamp : Date.now();
  const starting = !current || current.complete;
  const before = starting ? '' : current.content;
  const joined = before + data.content;
  const truncated = (starting ? false : current.truncated) || joined.length > MAX_CONTENT;
  const next: RemoteAgentStream = {
    content: joined.slice(-MAX_CONTENT),
    model: typeof data.model === 'string' ? data.model.slice(0, 128) : starting ? '' : current.model,
    complete: false,
    truncated,
    startedAt: starting ? now : current.startedAt,
    updatedAt: now,
  };
  const sessions = { ...state.streams };
  if (!sessions[sessionId] && Object.keys(sessions).length >= MAX_SESSIONS) {
    delete sessions[Object.keys(sessions)[0]];
  }
  const agents = { ...(sessions[sessionId] ?? {}) };
  if (!agents[agentId] && Object.keys(agents).length >= MAX_AGENTS_PER_SESSION) {
    delete agents[Object.keys(agents)[0]];
  }
  agents[agentId] = next;
  sessions[sessionId] = agents;
  return { ...state, streams: sessions };
}
