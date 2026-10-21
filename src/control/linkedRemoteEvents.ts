import type { DeviceBody } from '@koryphaios/shared/src/device-client';
import type { RemoteChangeReview, RemoteEventState, RemoteQuestion } from '../types/control';
import { EMPTY_REMOTE_EVENT_STATE, asNativeCommand, asQuestion, asReview, asRunSnapshot } from './remoteEvents';
import { OrderedRemoteEvents } from './orderedRemoteEvents';
import { applyLiveStreamEvent, clearLiveStreamSession } from './liveStream';
import type { LinkedDeviceRpc } from './linkedRemoteTransport';
import { applyAttentionResolution, readAttentionResolution, requireCurrentAttentionPrompt, type AttentionResolution } from './remoteAttention';

type SubscribeEvents = (listener: (hostId: string, body: DeviceBody) => void) => () => void;
type LinkedSnapshot = { run?: unknown; question?: unknown; review?: unknown; eventCursor?: unknown };
type LinkedEvent = {
  type?: string;
  sessionId?: string;
  epoch?: number;
  sequence?: number;
  payload?: unknown;
  timestamp?: number;
};
const LINKED_REPLAY_PAGE_SIZE = 100;
const MAX_REPLAY_PAGES = 256;

export class LinkedRemoteEventClient {
  private disposed = false;
  private suspended = false;
  private generation = 0;
  // Only attention events for the session being opened can invalidate its
  // corresponding snapshot field. Run/output events and other chats cannot.
  private attentionRevision = { question: 0, review: 0 };
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSessionId = '';
  private unsubscribe: (() => void) | null = null;
  private state: RemoteEventState = EMPTY_REMOTE_EVENT_STATE;
  private readonly orderedEvents = new OrderedRemoteEvents<LinkedEvent>();
  private readonly replays = new Map<string, { controller: AbortController; generation: number }>();
  private readonly replayTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly replayAttempts = new Map<string, number>();
  // The desktop has a single watch per peer/chat. A delayed close_chat can
  // otherwise remove a newer open_chat watch after rapid A→B→A navigation.
  private sessionOperations = new Map<string, { kind: 'open' | 'close'; settled: Promise<void> }>();

  constructor(
    private readonly hostId: string,
    private readonly rpc: LinkedDeviceRpc,
    private readonly subscribeEvents: SubscribeEvents,
    private readonly onState: (state: RemoteEventState, resolutions?: AttentionResolution[]) => void,
  ) {}

  connect(activeSessionId?: string): void {
    this.activeSessionId = activeSessionId ?? this.activeSessionId;
    if (this.disposed || this.suspended || this.unsubscribe) return;
    this.unsubscribe = this.subscribeEvents((hostId, body) => {
      if (this.disposed || this.suspended || hostId !== this.hostId) return;
      if (body.type === 'transport.connection') {
        if (body.connected === false) {
          // An open_chat response from the old relay connection must never
          // resurrect a connected badge or an old run after disconnect.
          this.generation += 1;
          this.cancelReplays();
          this.orderedEvents.clearPending();
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
          this.update({ ...this.state, connection: 'disconnected' });
        } else if (body.connected === true && ['disconnected', 'error'].includes(this.state.connection)) {
          this.update({ ...this.state, connection: 'connecting' });
          this.open(this.activeSessionId);
        }
        return;
      }
      // Late relay callbacks can still be queued after transport drops. The
      // durable replay cursor will recover those events after reconnect.
      if (body.type === 'event' && this.state.connection !== 'disconnected') this.handleEvent(body.event);
    });
    this.update({ ...this.state, connection: 'connecting' });
    this.open(this.activeSessionId);
  }

  setActiveSession(sessionId: string): void {
    if (sessionId === this.activeSessionId) return;
    const previous = this.activeSessionId;
    this.activeSessionId = sessionId;
    this.cancelReplays();
    this.orderedEvents.clearPending();
    if (previous) this.closeChat(previous);
    if (!this.disposed && !this.suspended && this.unsubscribe && this.state.connection !== 'disconnected')
      this.open(sessionId);
  }

  private serializeChat<T>(sessionId: string, kind: 'open' | 'close', action: () => Promise<T>): Promise<T> {
    const prior = this.sessionOperations.get(sessionId);
    // Multiple opens are idempotent: a foreground reconnect must not wait
    // for a stalled open request. A close, however, must follow *all* pending
    // opens, and a new open must wait for its preceding close to finish.
    const invoke = () => {
      try { return action(); }
      catch (caught) { return Promise.reject(caught); }
    };
    const request = prior && (kind === 'close' || prior.kind === 'close')
      ? prior.settled.then(invoke)
      : invoke();
    const resultSettled = request.then(() => undefined, () => undefined);
    const settled = kind === 'open' && prior?.kind === 'open'
      ? Promise.all([prior.settled, resultSettled]).then(() => undefined)
      : resultSettled;
    const current = { kind, settled };
    this.sessionOperations.set(sessionId, current);
    void settled.then(() => {
      if (this.sessionOperations.get(sessionId) === current) this.sessionOperations.delete(sessionId);
    });
    return request;
  }

  private closeChat(sessionId: string): void {
    void this.serializeChat(sessionId, 'close', () => this.rpc(this.hostId, 'close_chat', { sessionId })).catch(() => undefined);
  }

  async answerQuestion(sessionId: string, selection: string, text: string | undefined, expected: RemoteQuestion | undefined): Promise<void> {
    this.requireConnected();
    const question = requireCurrentAttentionPrompt(sessionId, expected, this.state.questions[sessionId]);
    await this.rpc(this.hostId, 'answer', {
      sessionId,
      questionId: question.questionId,
      selection,
      ...(text?.trim() ? { text: text.trim() } : {}),
    });
  }

  async resolveReview(sessionId: string, accepted: boolean, expected: RemoteChangeReview | undefined): Promise<void> {
    this.requireConnected();
    const review = requireCurrentAttentionPrompt(sessionId, expected, this.state.reviews[sessionId]);
    await this.rpc(this.hostId, 'review', {
      sessionId,
      reviewId: review.reviewId,
      reviewRevision: review.reviewRevision,
      accept: accepted,
    });
  }

  private requireConnected(): void {
    if (this.disposed || this.suspended || !this.unsubscribe || this.state.connection !== 'connected') {
      throw new Error('Live controls are disconnected. Reconnect before responding.');
    }
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.cancelReplays();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.activeSessionId) this.closeChat(this.activeSessionId);
  }

  suspend(): void {
    if (this.disposed || this.suspended) return;
    this.suspended = true;
    this.generation += 1;
    this.cancelReplays();
    this.orderedEvents.clearPending();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.update({ ...this.state, connection: 'disconnected' });
  }

  resume(): void {
    if (this.disposed) return;
    this.suspend();
    this.suspended = false;
    this.reconnectAttempts = 0;
    this.connect();
  }

  private open(sessionId: string): void {
    const generation = ++this.generation;
    this.cancelReplays();
    const attentionRevision = { ...this.attentionRevision };
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const current = () => !this.disposed && !this.suspended && this.generation === generation;
    const request = sessionId
      ? this.serializeChat(sessionId, 'open', () => this.rpc<LinkedSnapshot>(this.hostId, 'open_chat', { sessionId }))
      : this.rpc(this.hostId, 'workspaces').then(() => ({} as LinkedSnapshot));
    void request
      .then((snapshot) => {
        if (!current()) return;
        this.reconnectAttempts = 0;
        // A timeline rewrite can reset run revisions to zero. Establish the
        // host epoch before comparing its snapshot against our cached run.
        const eventCursor = snapshot.eventCursor;
        if (sessionId && eventCursor && typeof eventCursor === 'object') {
          const { epoch, latestSequence } = eventCursor as { epoch?: unknown; latestSequence?: unknown };
          if (typeof epoch === 'number' && Number.isSafeInteger(epoch) && epoch > 0 &&
              typeof latestSequence === 'number' && Number.isSafeInteger(latestSequence) && latestSequence >= 0) {
            // A newer live timeline can arrive while the host assembles the
            // snapshot. Its old run and prompts must not overwrite that epoch.
            if ((this.orderedEvents.getCursor(sessionId)?.epoch ?? 0) > epoch) {
              this.update({ ...this.state, connection: 'connected' });
              this.startReplay(sessionId);
              return;
            }
            this.orderedEvents.seedCursor(sessionId, epoch, latestSequence);
            if (this.orderedEvents.advanceEpoch(sessionId, epoch)) this.resetSessionTimeline(sessionId, 'snapshot');
          }
        }
        const run = asRunSnapshot(sessionId, { snapshot: snapshot.run });
        const question = asQuestion(sessionId, snapshot.question);
        const review = asReview(sessionId, snapshot.review);
        const questions = { ...this.state.questions };
        const reviews = { ...this.state.reviews };
        const resolutions: AttentionResolution[] = [];
        // Only explicit null is authoritative absence. Missing or malformed
        // snapshot fields cannot acknowledge a response or erase live state.
        // Each kind has its own guard so a new question cannot hide a review.
        if (attentionRevision.question === this.attentionRevision.question) {
          if (snapshot.question === null) {
            delete questions[sessionId];
            resolutions.push({ kind: 'question', sessionId, status: 'not_pending' });
          }
          if (question) questions[sessionId] = question;
        }
        if (attentionRevision.review === this.attentionRevision.review) {
          if (snapshot.review === null) {
            delete reviews[sessionId];
            resolutions.push({ kind: 'review', sessionId, status: 'not_pending' });
          }
          if (review) reviews[sessionId] = review;
        }
        this.update({
          ...this.state,
          connection: 'connected',
          runs: run && (this.state.runs[sessionId]?.revision ?? -1) <= run.revision
            ? { ...this.state.runs, [sessionId]: run } : this.state.runs,
          questions,
          reviews,
        }, resolutions);
        // Catch up even if the final terminal event was lost and no further
        // live event arrives to reveal the gap.
        if (sessionId && this.orderedEvents.getCursor(sessionId)) this.startReplay(sessionId);
      })
      .catch(() => {
        if (!current()) return;
        this.update({ ...this.state, connection: 'error' });
        const delay = Math.min(30_000, 1600 * 2 ** this.reconnectAttempts++);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (current()) this.open(this.activeSessionId);
        }, delay);
      });
  }

  private cancelReplays(): void {
    for (const { controller } of this.replays.values()) controller.abort();
    this.replays.clear();
    for (const timer of this.replayTimers.values()) clearTimeout(timer);
    this.replayTimers.clear();
    this.replayAttempts.clear();
  }

  private retryReplay(sessionId: string): void {
    if (this.disposed || this.suspended || sessionId !== this.activeSessionId || this.replayTimers.has(sessionId)) return;
    const attempt = this.replayAttempts.get(sessionId) ?? 0;
    const delay = Math.min(30_000, 1600 * 2 ** attempt);
    this.replayAttempts.set(sessionId, Math.min(attempt + 1, 5));
    const timer = setTimeout(() => {
      this.replayTimers.delete(sessionId);
      this.startReplay(sessionId);
    }, delay);
    this.replayTimers.set(sessionId, timer);
  }

  private startReplay(sessionId: string): void {
    if (
      this.disposed || this.suspended || !this.unsubscribe ||
      sessionId !== this.activeSessionId || this.replays.has(sessionId)
    ) return;
    const timer = this.replayTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.replayTimers.delete(sessionId);
    const request = { controller: new AbortController(), generation: this.generation };
    this.replays.set(sessionId, request);
    const current = () => !this.disposed && !this.suspended &&
      this.generation === request.generation && this.activeSessionId === sessionId &&
      !request.controller.signal.aborted;
    void (async () => {
      for (let page = 0; page < MAX_REPLAY_PAGES && current(); page++) {
        const cursor = this.orderedEvents.getCursor(sessionId);
        if (!cursor) return;
        const fetched: unknown = await this.rpc(
          this.hostId, 'events', { sessionId, ...cursor }, request.controller.signal, 15_000,
        );
        if (!current()) return;
        if (!Array.isArray(fetched) || fetched.length > LINKED_REPLAY_PAGE_SIZE) {
          throw new Error('Host returned an invalid linked event replay page');
        }
        for (const event of fetched) {
          if (!current()) return;
          this.ingestEvent(event, false);
        }
        const after = this.orderedEvents.getCursor(sessionId);
        if (fetched.length === LINKED_REPLAY_PAGE_SIZE &&
            after?.epoch === cursor.epoch && after.sequence === cursor.sequence) {
          throw new Error('Linked event replay is missing an ordered sequence');
        }
        if (fetched.length < LINKED_REPLAY_PAGE_SIZE) {
          if (this.orderedEvents.getGap(sessionId)) this.retryReplay(sessionId);
          else {
            this.replayAttempts.delete(sessionId);
            // The stream can recover without another open_chat response.
            // Restore control only after the ordered tail is fully caught up.
            if (this.state.connection === 'error') this.update({ ...this.state, connection: 'connected' });
          }
          return;
        }
      }
      if (current()) throw new Error('Linked event replay exceeded its bounded page limit');
    })().catch(() => {
      if (!current()) return;
      this.update({ ...this.state, connection: 'error' });
      this.retryReplay(sessionId);
    }).finally(() => {
      if (this.replays.get(sessionId) === request) this.replays.delete(sessionId);
    });
  }

  private handleEvent(raw: unknown): void {
    this.ingestEvent(raw, true);
  }

  private ingestEvent(raw: unknown, canReplay: boolean): void {
    if (!raw || typeof raw !== 'object') return;
    const message = raw as LinkedEvent;
    const received = this.orderedEvents.ingest(message);
    if (received.resetSession) this.resetSessionTimeline(received.resetSession);
    for (const event of received.events) this.applyEvent(event);
    if (received.replayFrom && canReplay) this.startReplay(received.replayFrom.sessionId);
  }

  private resetSessionTimeline(sessionId: string, origin: 'live' | 'snapshot' = 'live'): void {
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
    // A live epoch change invalidates an in-flight snapshot's old attention
    // fields; a fresh snapshot may itself supply new-epoch attention.
    if (origin === 'live') {
      this.markAttentionEvent(sessionId, 'question');
      this.markAttentionEvent(sessionId, 'review');
    }
    this.update(clearLiveStreamSession({ ...this.state, nativeCommands, runs, questions, reviews }, sessionId), resolutions);
  }

  private applyEvent(message: LinkedEvent): void {
    const sessionId = typeof message.sessionId === 'string' ? message.sessionId : '';
    if (!sessionId) return;
    if (message.type === 'stream.delta' || message.type === 'stream.clear_content' || message.type === 'stream.complete') {
      const next = applyLiveStreamEvent(this.state, sessionId, message.type, message.payload, message.timestamp);
      if (next !== this.state) this.update(next);
      return;
    }
    if (message.type === 'run.state') {
      const next = asRunSnapshot(sessionId, message.payload);
      if (!next || (this.state.runs[sessionId]?.revision ?? -1) > next.revision) return;
      this.update({ ...this.state, runs: { ...this.state.runs, [sessionId]: next } });
      return;
    }
    if (message.type === 'kory.ask_user') {
      const next = asQuestion(sessionId, message.payload);
      if (next) {
        this.markAttentionEvent(sessionId, 'question');
        this.update({ ...this.state, questions: { ...this.state.questions, [sessionId]: next } });
      }
      return;
    }
    if (message.type === 'kory.ask_user_resolved') {
      const resolution = readAttentionResolution('question', sessionId, message.payload);
      if (resolution.status !== 'unknown') this.markAttentionEvent(sessionId, 'question');
      this.update(applyAttentionResolution(this.state, resolution), [resolution]);
      return;
    }
    if (message.type === 'session.changes') {
      const next = asReview(sessionId, message.payload);
      if (next) {
        this.markAttentionEvent(sessionId, 'review');
        this.update({ ...this.state, reviews: { ...this.state.reviews, [sessionId]: next } });
      }
      return;
    }
    if (message.type === 'session.changes_resolved') {
      const resolution = readAttentionResolution('review', sessionId, message.payload);
      if (resolution.status !== 'unknown') this.markAttentionEvent(sessionId, 'review');
      this.update(applyAttentionResolution(this.state, resolution), [resolution]);
      return;
    }
    if (message.type === 'native.command') {
      const next = asNativeCommand(sessionId, message.payload, message.timestamp);
      if (!next) return;
      const current = this.state.nativeCommands[sessionId] ?? [];
      const index = current.findIndex((item) => item.messageId === next.messageId);
      const merged = index >= 0
        ? current.map((item, offset) => offset === index ? { ...item, ...next, text: `${item.text}${next.text}`.slice(-60_000), isError: item.isError || next.isError } : item)
        : [...current, { ...next, text: next.text.slice(-60_000) }].slice(-20);
      this.update({ ...this.state, nativeCommands: { ...this.state.nativeCommands, [sessionId]: merged } });
    }
  }

  private markAttentionEvent(sessionId: string, kind: 'question' | 'review'): void {
    // Generation guards already reject opens for previously selected sessions.
    // Two counters suffice; no per-chat revision history needs to be retained.
    if (sessionId === this.activeSessionId) this.attentionRevision[kind] += 1;
  }

  private update(next: RemoteEventState, resolutions?: AttentionResolution[]): void {
    this.state = next;
    this.onState(next, resolutions);
  }
}
