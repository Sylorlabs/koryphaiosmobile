import type { PairingTarget, RemoteChangeReview, RemoteEventState, RemoteQuestion } from '../types/control';
import { attentionResolutionMatches, type AttentionKind, type AttentionResolution } from './remoteAttention';

export type { AttentionKind } from './remoteAttention';
export type AttentionResponse = {
  text: string;
  phase: 'idle' | 'sending' | 'uncertain' | 'waiting' | 'error' | 'resolved' | 'closed';
  error: string | null;
  outcome?: AttentionResolution['status'];
  choice?: string;
};
type Attempt = { key: string };
const EMPTY_RESPONSE: AttentionResponse = { text: '', phase: 'idle', error: null };
const MAX_SAVED_BYTES = 1024 * 1024;
const SAVE_DELAY_MS = 180;

export interface AttentionResponsePersistence {
  durable: boolean;
  load(): Promise<string | null>;
  save(contents: string): Promise<void>;
}

export type SavedAttention = { key: string; kind: AttentionKind; sessionId: string; response: AttentionResponse };

function keyOrigin(key: string): { baseUrl: string; machineId: string; kind: AttentionKind; sessionId: string } | null {
  try {
    const decoded: unknown = JSON.parse(key);
    if (!Array.isArray(decoded) || decoded.length !== 5) return null;
    const [baseUrl, machineId, kind, sessionId, identity] = decoded;
    if (typeof baseUrl !== 'string' || !baseUrl || typeof machineId !== 'string' || !machineId
      || (kind !== 'question' && kind !== 'review') || typeof sessionId !== 'string' || !sessionId
      || !Array.isArray(identity) || identity.length < 2) return null;
    return { baseUrl, machineId, kind, sessionId };
  } catch { return null; }
}

function decodeStored(raw: string): Map<string, AttentionResponse> {
  if (new TextEncoder().encode(raw).length > MAX_SAVED_BYTES) throw new Error('Saved responses exceed the allowed size');
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 1
    || !('entries' in parsed) || !Array.isArray(parsed.entries) || parsed.entries.length > 500) {
    throw new Error('Unsupported saved-response snapshot');
  }
  const output = new Map<string, AttentionResponse>();
  for (const item of parsed.entries) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string'
      || !keyOrigin(item[0]) || !item[1] || typeof item[1] !== 'object') continue;
    const value = item[1] as Partial<AttentionResponse>;
    if (typeof value.text !== 'string' || typeof value.phase !== 'string'
      || !['idle', 'sending', 'uncertain', 'waiting', 'error', 'resolved', 'closed'].includes(value.phase)
      || (value.error !== null && typeof value.error !== 'string')
      || (value.choice !== undefined && typeof value.choice !== 'string')) continue;
    output.set(item[0], {
      text: value.text,
      phase: value.phase === 'sending' ? 'uncertain' : value.phase,
      error: value.error,
      ...(typeof value.choice === 'string' ? { choice: value.choice } : {}),
      ...(typeof value.outcome === 'string' ? { outcome: value.outcome } : {}),
    } as AttentionResponse);
  }
  return output;
}

/** Include visible content as well as IDs: legacy hosts can omit prompt IDs. */
export function attentionResponseKey(
  target: Pick<PairingTarget, 'baseUrl' | 'machineId'> | null,
  kind: AttentionKind,
  prompt: RemoteQuestion | RemoteChangeReview | undefined,
): string {
  if (!target || !prompt) return '';
  const identity = 'question' in prompt
    ? [prompt.questionId ?? null, prompt.question, prompt.options, prompt.allowOther, prompt.allowKeepChatting ?? false]
    : [prompt.reviewId ?? null, prompt.changes.map((change) => ({
      // Match by visible values, not the insertion order of transport fields.
      // Keep change order and contents significant so replacements stay distinct.
      path: change.path,
      linesAdded: change.linesAdded,
      linesDeleted: change.linesDeleted,
      operation: change.operation,
    })), prompt.reviewRevision ?? null];
  return JSON.stringify([target.baseUrl, target.machineId, kind, prompt.sessionId, identity]);
}

/** Provider-owned drafts and response locks survive route and layout remounts. */
export class AttentionResponseStore {
  private responses = new Map<string, AttentionResponse>();
  private attempts = new Map<string, Attempt>();
  private listeners = new Set<() => void>();
  private version = 0;
  private dirty = 0;
  private saved = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private writeFlight: Promise<void> = Promise.resolve();
  private ready: Promise<void> = Promise.resolve();
  private hydrated = true;
  private recoveryError: string | null = null;
  private persistenceError: string | null = null;
  private deferredReconciles: {
    target: PairingTarget; previous: RemoteEventState; next: RemoteEventState; resolutions: AttentionResolution[];
  }[] = [];

  constructor(private readonly persistence?: AttentionResponsePersistence) {
    if (persistence) this.retryRecovery();
  }

  private retryRecovery() {
    this.hydrated = false;
    this.recoveryError = null;
    this.ready = (async () => {
      try {
        const contents = await this.persistence!.load();
        this.responses = contents ? decodeStored(contents) : new Map();
        this.hydrated = true;
        this.notify();
        const buffered = this.deferredReconciles.splice(0);
        for (const event of buffered) this.reconcile(event.target, event.previous, event.next, event.resolutions);
        if (contents?.includes('"sending"')) this.changed(); // persist the recovered uncertain state
      } catch (caught) {
        this.recoveryError = caught instanceof Error ? caught.message : 'Could not restore saved responses';
        this.notify();
      }
    })();
    this.notify();
  }

  retryLoad() { if (!this.hydrated && this.recoveryError) this.retryRecovery(); }
  whenReady(): Promise<void> { return this.ready; }
  isReady() { return this.hydrated; }
  getRecoveryError() { return this.recoveryError; }
  getPersistenceError() { return this.persistenceError; }
  isDurable() { return this.persistence?.durable ?? false; }

  getVersion = () => this.version;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  read(key: string): AttentionResponse { return this.responses.get(key) ?? EMPTY_RESPONSE; }

  savedFor(target: Pick<PairingTarget, 'baseUrl' | 'machineId'> | null): SavedAttention[] {
    if (!target || !this.hydrated) return [];
    return [...this.responses].reverse().flatMap(([key, response]) => {
      const origin = keyOrigin(key);
      return origin?.baseUrl === target.baseUrl && origin.machineId === target.machineId
        && (response.text || response.phase !== 'idle')
        ? [{ key, kind: origin.kind, sessionId: origin.sessionId, response }] : [];
    });
  }

  setText(key: string, text: string) {
    if (!key || this.busy(key)) return;
    this.responses.set(key, { text, phase: 'idle', error: null });
    this.changed();
  }

  busy(key: string) {
    if (!this.hydrated) return true;
    const phase = this.read(key).phase;
    return phase === 'sending' || phase === 'uncertain' || phase === 'waiting' || phase === 'resolved' || phase === 'closed';
  }

  begin(key: string, choice?: string): Attempt | null {
    if (!key || this.busy(key)) return null;
    const attempt = { key };
    this.attempts.set(key, attempt);
    this.responses.set(key, { ...this.read(key), phase: 'sending', error: null, choice });
    this.changed();
    return attempt;
  }

  isCurrent(attempt: Attempt) {
    return this.attempts.get(attempt.key) === attempt && this.read(attempt.key).phase === 'sending';
  }

  /** Flush the sending lock before touching the network. If storage fails,
   * the caller must fail the attempt without dispatching the mutation. */
  async flush(): Promise<void> {
    await this.ready;
    if (!this.hydrated) throw new Error(this.recoveryError ?? 'Response recovery is incomplete');
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.persistence) return;
    const flight = this.writeFlight.catch(() => {}).then(async () => {
      if (this.saved === this.dirty) return;
      const revision = this.dirty;
      const contents = JSON.stringify({ version: 1, entries: [...this.responses] });
      if (new TextEncoder().encode(contents).length > MAX_SAVED_BYTES) {
        throw new Error('Saved responses have reached the 1 MB limit. Resolve or clear saved history before responding.');
      }
      await this.persistence!.save(contents);
      this.saved = revision;
      if (this.persistenceError) { this.persistenceError = null; this.notify(); }
    });
    this.writeFlight = flight;
    try { await flight; }
    catch (caught) {
      this.persistenceError = caught instanceof Error ? caught.message : 'Unable to save the response';
      this.notify();
      throw caught;
    }
  }

  submitted(attempt: Attempt) {
    if (this.attempts.get(attempt.key) !== attempt) return;
    this.responses.set(attempt.key, { ...this.read(attempt.key), phase: 'waiting' });
    this.changed();
  }

  failed(attempt: Attempt, error: string) {
    if (this.attempts.get(attempt.key) !== attempt) return;
    this.attempts.delete(attempt.key);
    this.responses.set(attempt.key, { ...this.read(attempt.key), phase: 'error', error });
    this.changed();
  }

  /** Host resolution evidence is required; connection/reset/map disappearance
   * alone says nothing about whether the desktop received the response. */
  reconcile(target: PairingTarget, previous: RemoteEventState, next: RemoteEventState, resolutions: AttentionResolution[] = []) {
    if (!this.hydrated) {
      this.deferredReconciles.push({ target, previous, next, resolutions });
      if (this.deferredReconciles.length > 256) this.deferredReconciles.shift();
      return;
    }
    let changed = false;
    const settle = (key: string, status: AttentionResolution['status'], confirmed: boolean) => {
      const response = this.responses.get(key);
      if (!response || response.phase === 'resolved' || (response.phase === 'closed' && !confirmed)) return;
      this.attempts.delete(key);
      // Even confirmed prompt closure may come from another controller. Keep
      // the user's text rather than claiming that their exact answer was used.
      this.responses.set(key, { ...response, phase: confirmed ? 'resolved' : 'closed', error: null, outcome: status });
      changed = true;
    };
    for (const resolution of resolutions) {
      if (resolution.status === 'unknown') continue;
      for (const key of this.responses.keys()) {
        // Keys are constructed above and contain no credentials. Decode the
        // origin so a fresh client can settle an earlier client's saved work.
        let decoded: unknown;
        try { decoded = JSON.parse(key); } catch { continue; }
        if (!Array.isArray(decoded) || decoded.length !== 5) continue;
        const [baseUrl, machineId, kind, sessionId, identity] = decoded;
        if (baseUrl !== target.baseUrl || machineId !== target.machineId || kind !== resolution.kind || sessionId !== resolution.sessionId) continue;
        if (!Array.isArray(identity) || identity.length < 2) continue;
        const promptId = identity[0];
        if (promptId !== null && (typeof promptId !== 'string' || !promptId.trim())) continue;
        // Two-field review keys predate revisions. Never infer a revision for
        // that history or let it acknowledge a newer publication.
        const revision = kind === 'review' ? identity[2] : undefined;
        if (kind === 'review' && (identity.length > 3 || !Array.isArray(identity[1])
          || (revision != null && (typeof revision !== 'string' || !revision.trim())))) continue;
        if (!attentionResolutionMatches(resolution, promptId, revision ?? undefined)) continue;
        const confirmed = Boolean(resolution.promptId) && ['answered', 'accepted', 'rejected'].includes(resolution.status);
        settle(key, resolution.status, confirmed);
      }
    }
    for (const kind of ['question', 'review'] as const) {
      const before = kind === 'question' ? previous.questions : previous.reviews;
      const after = kind === 'question' ? next.questions : next.reviews;
      for (const [sessionId, prompt] of Object.entries(before)) {
        const key = attentionResponseKey(target, kind, prompt);
        if (!after[sessionId] || key === attentionResponseKey(target, kind, after[sessionId])) continue;
        settle(key, 'superseded', false);
      }
    }
    // Bound empty completed history without evicting saved or unconfirmed work.
    const completed = [...this.responses].filter(([, response]) => response.phase === 'resolved' && !response.text);
    for (const [key] of completed.slice(0, Math.max(0, completed.length - 100))) this.responses.delete(key);
    if (changed) this.changed();
  }

  private notify() {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }

  private changed() {
    this.dirty += 1;
    this.notify();
    if (this.persistence) {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => { void this.flush().catch(() => {}); }, SAVE_DELAY_MS);
    }
  }
}

export function attentionResponseMessage(response: AttentionResponse): string | null {
  if (response.phase === 'sending') return 'Sending to desktop…';
  if (response.phase === 'uncertain') return 'App closed during submission. The desktop may have received it. Check before responding again.';
  if (response.phase === 'waiting') return 'Sent. Waiting for desktop confirmation…';
  if (response.phase === 'error') return `${response.error} Your response is saved. Check the desktop before trying again.`;
  if (response.phase === 'closed') return 'The desktop no longer needs this response. Its execution was not confirmed; your response is saved.';
  if (response.phase === 'resolved') return 'The desktop has resolved this request. Your saved response is retained.';
  return null;
}
