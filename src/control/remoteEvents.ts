import type {
  NativeCommandOutput,
  PairingTarget,
  RemoteChangeReview,
  RemoteChangeSummary,
  RemoteEventState,
  RemoteQuestion,
  RemoteRunPhase,
  RemoteRunSnapshot,
  RemoteRunStatus,
} from '../types/control';
import { applyAttentionResolution, readAttentionResolution, requireCurrentAttentionPrompt, type AttentionResolution } from './remoteAttention';
import { OrderedRemoteEvents } from './orderedRemoteEvents';
import { applyLiveStreamEvent, clearLiveStreamSession } from './liveStream';

type EventEnvelope = {
  type?: string;
  sessionId?: string;
  payload?: unknown;
  timestamp?: number;
  epoch?: number;
  sequence?: number;
};

export const EMPTY_REMOTE_EVENT_STATE: RemoteEventState = {
  connection: 'disconnected',
  questions: {},
  reviews: {},
  nativeCommands: {},
  runs: {},
  streams: {},
};

const RUN_PHASES = new Set<RemoteRunPhase>([
  'idle',
  'analyzing',
  'thinking',
  'streaming',
  'tool_calling',
  'compacting',
  'waiting_terminal',
  'waiting_user',
  'done',
  'error',
  'cancelled',
]);

const RUN_STATUSES = new Set<RemoteRunStatus>(['idle', 'active', 'waiting', 'terminal']);

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asRunSnapshot(sessionId: string, payload: unknown): RemoteRunSnapshot | null {
  if (!payload || typeof payload !== 'object') return null;
  const snapshot = (payload as { snapshot?: unknown }).snapshot;
  if (!snapshot || typeof snapshot !== 'object') return null;
  const item = snapshot as Record<string, unknown>;
  if (item.sessionId !== sessionId) return null;
  if (typeof item.revision !== 'number' || !Number.isSafeInteger(item.revision) || item.revision < 0) {
    return null;
  }
  if (typeof item.phase !== 'string' || !RUN_PHASES.has(item.phase as RemoteRunPhase)) return null;
  if (typeof item.status !== 'string' || !RUN_STATUSES.has(item.status as RemoteRunStatus)) return null;
  if (typeof item.updatedAt !== 'number' || !Number.isFinite(item.updatedAt)) return null;

  return {
    sessionId,
    runId: nullableString(item.runId),
    revision: item.revision,
    phase: item.phase as RemoteRunPhase,
    status: item.status as RemoteRunStatus,
    waitingReason: typeof item.waitingReason === 'string' ? item.waitingReason : '',
    continuationId: nullableString(item.continuationId),
    activeAgentIds: Array.isArray(item.activeAgentIds)
      ? item.activeAgentIds.filter((value): value is string => typeof value === 'string' && Boolean(value))
      : [],
    startedAt: nullableNumber(item.startedAt),
    updatedAt: item.updatedAt,
    finishedAt: nullableNumber(item.finishedAt),
    terminalReason: nullableString(item.terminalReason),
  };
}

function websocketUrl(target: PairingTarget): string {
  const url = new URL(target.baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
  url.search = '';
  // The desktop renderer uses the same backend-supported fallback because
  // browser WebSockets cannot set an Authorization header. Never log this URL.
  // The host validates this query fallback with the same Bearer parser as
  // HTTP Authorization. Pairing stores the token without that prefix.
  url.searchParams.set('auth', `Bearer ${target.token.replace(/^Bearer\s+/i, '').trim()}`);
  return url.toString();
}

export function asQuestion(sessionId: string, payload: unknown): RemoteQuestion | null {
  if (!payload || typeof payload !== 'object') return null;
  const item = payload as Record<string, unknown>;
  if (typeof item.question !== 'string') return null;
  return {
    sessionId,
    questionId: typeof item.questionId === 'string' ? item.questionId : undefined,
    question: item.question,
    options: Array.isArray(item.options) ? item.options.filter((value): value is string => typeof value === 'string') : [],
    allowOther: item.allowOther === true,
    allowKeepChatting: item.allowKeepChatting === true,
  };
}

export function asReview(sessionId: string, payload: unknown): RemoteChangeReview | null {
  if (!payload || typeof payload !== 'object') return null;
  const item = payload as Record<string, unknown>;
  if (!Array.isArray(item.changes)) return null;
  const changes = item.changes.flatMap((raw): RemoteChangeSummary[] => {
    if (!raw || typeof raw !== 'object') return [];
    const change = raw as Record<string, unknown>;
    if (
      typeof change.path !== 'string' ||
      !['create', 'edit', 'delete'].includes(String(change.operation))
    ) {
      return [];
    }
    return [{
      path: change.path,
      linesAdded: typeof change.linesAdded === 'number' ? change.linesAdded : 0,
      linesDeleted: typeof change.linesDeleted === 'number' ? change.linesDeleted : 0,
      operation: change.operation as RemoteChangeSummary['operation'],
    }];
  });
  return {
    sessionId,
    reviewId: typeof item.reviewId === 'string' ? item.reviewId : undefined,
    reviewRevision: typeof item.reviewRevision === 'string' ? item.reviewRevision : undefined,
    changes,
  };
}

export function asNativeCommand(sessionId: string, payload: unknown, timestamp?: number): NativeCommandOutput | null {
  if (!payload || typeof payload !== 'object') return null;
  const item = payload as Record<string, unknown>;
  if (typeof item.messageId !== 'string' || typeof item.command !== 'string') return null;
  return {
    sessionId,
    messageId: item.messageId,
    provider: typeof item.provider === 'string' ? item.provider : '',
    providerLabel: typeof item.providerLabel === 'string' ? item.providerLabel : 'CLI',
    command: item.command,
    rawCommand: typeof item.rawCommand === 'string' ? item.rawCommand : `/${item.command}`,
    text: typeof item.text === 'string' ? item.text : '',
    isError: item.isError === true,
    complete: item.isPartial !== true,
    updatedAt: timestamp ?? Date.now(),
  };
}

export class RemoteEventClient {
  private readonly orderedEvents = new OrderedRemoteEvents<EventEnvelope>();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly gapRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly gapRetryAttempts = new Map<string, number>();
  private reconnectAttempts = 0;
  private suspended = false;
  private disposed = false;
  private activeSessionId = '';
  private subscriptions = new Set<string>();
  private state: RemoteEventState = EMPTY_REMOTE_EVENT_STATE;

  constructor(
    private readonly target: PairingTarget,
    private readonly onState: (state: RemoteEventState, resolutions?: AttentionResolution[]) => void,
  ) {}

  connect(activeSessionId?: string): void {
    this.activeSessionId = activeSessionId ?? this.activeSessionId;
    if (this.disposed || this.suspended || this.socket) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.update({ ...this.state, connection: 'connecting' });
    this.openSocket();
  }

  setActiveSession(sessionId: string): void {
    this.activeSessionId = sessionId;
    if (sessionId && this.socket?.readyState === WebSocket.OPEN) this.subscribe(sessionId);
  }

  answerQuestion(sessionId: string, selection: string, text: string | undefined, expected: RemoteQuestion | undefined): void {
    const question = requireCurrentAttentionPrompt(sessionId, expected, this.state.questions[sessionId]);
    this.send({
      type: 'user_input',
      sessionId,
      selection,
      ...(text?.trim() ? { text: text.trim() } : {}),
      questionId: question.questionId,
      timestamp: Date.now(),
    });
  }

  resolveReview(sessionId: string, accepted: boolean, expected: RemoteChangeReview | undefined): void {
    const review = requireCurrentAttentionPrompt(sessionId, expected, this.state.reviews[sessionId]);
    this.send({
      type: accepted ? 'session.accept_changes' : 'session.reject_changes',
      sessionId,
      reviewId: review.reviewId,
      reviewRevision: review.reviewRevision,
      timestamp: Date.now(),
    });
  }

  dispose(): void {
    this.disposed = true;
    this.closeSocket();
  }

  suspend(): void {
    if (this.disposed || this.suspended) return;
    this.suspended = true;
    this.closeSocket();
    this.update({ ...this.state, connection: 'disconnected' });
  }

  resume(): void {
    if (this.disposed) return;
    this.suspended = false;
    // A socket can still report OPEN after iOS suspended its network traffic.
    this.closeSocket();
    this.reconnectAttempts = 0;
    this.connect();
  }

  private closeSocket(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const sessionId of this.gapRetryTimers.keys()) this.clearGapRetry(sessionId);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.subscriptions.clear();
    this.orderedEvents.clearPending();
  }

  private clearGapRetry(sessionId: string): void {
    const timer = this.gapRetryTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.gapRetryTimers.delete(sessionId);
    this.gapRetryAttempts.delete(sessionId);
  }

  /** A missing replay response must not stall the stream indefinitely when
   * the WebSocket remains open but the host never sends another chunk. */
  private scheduleGapRetry(sessionId: string): void {
    const socket = this.socket;
    if (this.disposed || this.suspended || !socket ||
        socket.readyState !== WebSocket.OPEN || this.gapRetryTimers.has(sessionId)) return;
    const attempt = this.gapRetryAttempts.get(sessionId) ?? 0;
    const delay = Math.min(30_000, 1600 * 2 ** attempt);
    this.gapRetryAttempts.set(sessionId, Math.min(attempt + 1, 5));
    const timer = setTimeout(() => {
      if (this.gapRetryTimers.get(sessionId) !== timer) return;
      this.gapRetryTimers.delete(sessionId);
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN ||
          this.disposed || this.suspended) {
        this.clearGapRetry(sessionId);
        return;
      }
      const gap = this.orderedEvents.getGap(sessionId);
      if (!gap) {
        this.clearGapRetry(sessionId);
        return;
      }
      try {
        this.send({ type: 'subscribe_session', ...gap, timestamp: Date.now() });
      } catch {
        // A closing socket is handled by the normal reconnect path.
      }
      this.scheduleGapRetry(sessionId);
    }, delay);
    this.gapRetryTimers.set(sessionId, timer);
  }

  private openSocket(): void {
    let socket: WebSocket;
    try {
      socket = new WebSocket(websocketUrl(this.target));
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;
    socket.onopen = () => {
      if (this.disposed || this.socket !== socket) return;
      this.reconnectAttempts = 0;
      this.subscriptions.clear();
      this.update({
        ...this.state,
        connection: 'connected',
      });
      if (this.activeSessionId) this.subscribe(this.activeSessionId);
      // Revalidate previously observed waits too: answered-while-offline chats
      // are absent from actionable_waits and otherwise never receive closure.
      for (const sessionId of [...Object.keys(this.state.questions), ...Object.keys(this.state.reviews)]) {
        this.subscribe(sessionId);
      }
      this.send({ type: 'session.actionable_waits.request', timestamp: Date.now() });
    };
    socket.onmessage = (event) => {
      if (this.disposed || this.socket !== socket) return;
      this.handleMessage(event.data);
    };
    socket.onerror = () => {
      if (this.disposed || this.socket !== socket) return;
      this.closeSocket();
      this.scheduleReconnect();
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      for (const sessionId of this.gapRetryTimers.keys()) this.clearGapRetry(sessionId);
      if (this.disposed || this.suspended) return;
      this.subscriptions.clear();
      this.orderedEvents.clearPending();
      this.update({ ...this.state, connection: 'disconnected' });
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.suspended || this.reconnectTimer) return;
    this.update({ ...this.state, connection: 'error' });
    const delay = Math.min(30000, 1600 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed && !this.suspended && !this.socket) {
        this.update({ ...this.state, connection: 'connecting' });
        this.openSocket();
      }
    }, delay);
  }

  private subscribe(sessionId: string): void {
    if (!sessionId || this.subscriptions.has(sessionId)) return;
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.subscriptions.add(sessionId);
    const cursor = this.orderedEvents.getCursor(sessionId);
    this.send({ type: 'subscribe_session', sessionId, timestamp: Date.now(), ...cursor });
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('Live remote controls are reconnecting. Try again in a moment.');
    }
    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(raw: unknown): void {
    let message: EventEnvelope;
    try {
      const serialized = typeof raw === 'string' ? raw : String(raw);
      message = JSON.parse(serialized) as EventEnvelope;
    } catch {
      return;
    }

    if (!message || typeof message !== 'object') return;
    const received = this.orderedEvents.ingest(message);
    if (received.resetSession) {
      // Rewinding a chat replaces its run, output and attention timeline.
      // A new run can start at revision zero, and old prompts must never
      // remain actionable after their host timeline has been discarded.
      const sessionId = received.resetSession;
      const nativeCommands = { ...this.state.nativeCommands };
      const runs = { ...this.state.runs };
      const questions = { ...this.state.questions };
      const reviews = { ...this.state.reviews };
      const resolutions: AttentionResolution[] = [];
      const question = questions[sessionId];
      const review = reviews[sessionId];
      if (question) resolutions.push({
        kind: 'question', sessionId, promptId: question.questionId, status: 'not_pending',
      });
      if (review) resolutions.push({
        kind: 'review', sessionId, promptId: review.reviewId,
        reviewRevision: review.reviewRevision, status: 'not_pending',
      });
      delete nativeCommands[sessionId];
      delete runs[sessionId];
      delete questions[sessionId];
      delete reviews[sessionId];
      this.update(clearLiveStreamSession({ ...this.state, nativeCommands, runs, questions, reviews }, sessionId), resolutions);
    }
    for (const ordered of received.events) this.applyMessage(ordered);
    if (received.replayFrom && this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: 'subscribe_session', ...received.replayFrom, timestamp: Date.now() });
      this.scheduleGapRetry(received.replayFrom.sessionId);
    } else if (typeof message.sessionId === 'string' &&
               !this.orderedEvents.getGap(message.sessionId)) {
      this.clearGapRetry(message.sessionId);
    }
  }

  private applyMessage(message: EventEnvelope): void {

    if (message.type === 'ping') {
      try {
        this.send({ type: 'pong', timestamp: Date.now() });
      } catch {
        // The close handler owns reconnection.
      }
      return;
    }

    if (message.type === 'session.actionable_waits') {
      // A mixed-version host may return malformed or partial wait lists.
      // Ignore invalid entries so one bad frame cannot break live streaming.
      const waits = message.payload && typeof message.payload === 'object'
        ? message.payload as Record<string, unknown> : {};
      for (const kind of ['questionSessionIds', 'reviewSessionIds'] as const) {
        const sessionIds = waits[kind];
        if (!Array.isArray(sessionIds)) continue;
        for (const sessionId of sessionIds) {
          if (typeof sessionId === 'string' && sessionId.trim()) this.subscribe(sessionId);
        }
      }
      return;
    }

    const sessionId = typeof message.sessionId === 'string' ? message.sessionId : '';
    if (!sessionId) return;

    if (message.type === 'stream.delta' || message.type === 'stream.clear_content' || message.type === 'stream.complete') {
      const next = applyLiveStreamEvent(this.state, sessionId, message.type, message.payload, message.timestamp);
      if (next !== this.state) this.update(next);
      return;
    }

    if (message.type === 'run.state') {
      const next = asRunSnapshot(sessionId, message.payload);
      if (!next) return;
      const current = this.state.runs[sessionId];
      // Match desktop's canonical run-state reducer: an older revision may
      // never overwrite newer host truth. Equal revisions are safe replay.
      if (current && current.revision > next.revision) return;
      this.update({
        ...this.state,
        runs: { ...this.state.runs, [sessionId]: next },
      });
      return;
    }

    if (message.type === 'kory.ask_user') {
      const question = asQuestion(sessionId, message.payload);
      if (question) {
        this.update({
          ...this.state,
          questions: { ...this.state.questions, [sessionId]: question },
        });
      }
      return;
    }

    if (message.type === 'kory.ask_user_resolved') {
      const resolution = readAttentionResolution('question', sessionId, message.payload);
      this.update(applyAttentionResolution(this.state, resolution), [resolution]);
      return;
    }

    if (message.type === 'session.changes') {
      const review = asReview(sessionId, message.payload);
      if (review) {
        this.update({
          ...this.state,
          reviews: { ...this.state.reviews, [sessionId]: review },
        });
      }
      return;
    }

    if (message.type === 'session.changes_resolved') {
      const resolution = readAttentionResolution('review', sessionId, message.payload);
      this.update(applyAttentionResolution(this.state, resolution), [resolution]);
      return;
    }

    if (message.type === 'native.command') {
      const next = asNativeCommand(sessionId, message.payload, message.timestamp);
      if (!next) return;
      const current = this.state.nativeCommands[sessionId] ?? [];
      const existingIndex = current.findIndex((item) => item.messageId === next.messageId);
      const merged = existingIndex >= 0
        ? current.map((item, index) => index === existingIndex
            ? {
                ...item,
                ...next,
                text: `${item.text}${next.text}`.slice(-60_000),
                isError: item.isError || next.isError,
              }
            : item)
        : [...current, { ...next, text: next.text.slice(-60_000) }].slice(-20);
      this.update({
        ...this.state,
        nativeCommands: { ...this.state.nativeCommands, [sessionId]: merged },
      });
    }
  }

  private update(next: RemoteEventState, resolutions?: AttentionResolution[]): void {
    this.state = next;
    this.onState(next, resolutions);
  }
}
