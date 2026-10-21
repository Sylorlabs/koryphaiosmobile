import { agentMessageDraftStorage, type ConversationDraftPersistence } from './conversationDraftStorage';

type AgentRecovery = { id: number; body: string; message: string };
type AgentDraft = { body: string; revision: number; recoveries: AgentRecovery[] };
export type AgentMessageAttempt = {
  id: number;
  key: string;
  revision: number;
  body: string;
  phase: 'preflight' | 'sending';
};

const EMPTY: AgentDraft = { body: '', revision: 0, recoveries: [] };
const MAX_DESTINATIONS = 250;
const MAX_RECOVERIES = 50;
const MAX_TEXT = 100_000;
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
const SAVE_DELAY_MS = 250;

function validKey(key: unknown): key is string {
  if (typeof key !== 'string' || key.length > 4096) return false;
  try {
    const parts: unknown = JSON.parse(key);
    return Array.isArray(parts) && parts.length === 5 &&
      parts.every((part) => typeof part === 'string' && part.length <= 1024);
  } catch { return false; }
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT;
}

function validRecovery(value: unknown): value is AgentRecovery {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<AgentRecovery>;
  return Number.isSafeInteger(item.id) && Number(item.id) > 0 &&
    validText(item.body) && validText(item.message);
}

function decode(raw: string): {
  drafts: Map<string, AgentDraft>;
  pending: Map<string, AgentRecovery>;
  nextId: number;
} {
  if (new TextEncoder().encode(raw).length > MAX_SNAPSHOT_BYTES) {
    throw new Error('Saved agent messages exceed the 4 MB limit');
  }
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid saved agent messages');
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.drafts) ||
    snapshot.drafts.length > MAX_DESTINATIONS || !Array.isArray(snapshot.pending) ||
    snapshot.pending.length > MAX_DESTINATIONS ||
    !Number.isSafeInteger(snapshot.nextId) || Number(snapshot.nextId) < 1) {
    throw new Error('Unsupported saved agent message format');
  }
  const drafts = new Map<string, AgentDraft>();
  const pending = new Map<string, AgentRecovery>();
  for (const entry of snapshot.drafts) {
    if (!Array.isArray(entry) || entry.length !== 2 || !validKey(entry[0]) ||
      !entry[1] || typeof entry[1] !== 'object' || drafts.has(entry[0])) {
      throw new Error('Invalid saved agent destination');
    }
    const draft = entry[1] as Partial<AgentDraft>;
    if (!validText(draft.body) || !Number.isSafeInteger(draft.revision) ||
      Number(draft.revision) < 0 || !Array.isArray(draft.recoveries) ||
      draft.recoveries.length > MAX_RECOVERIES || !draft.recoveries.every(validRecovery)) {
      throw new Error('Invalid saved agent draft');
    }
    drafts.set(entry[0], draft as AgentDraft);
  }
  for (const entry of snapshot.pending) {
    if (!Array.isArray(entry) || entry.length !== 2 || !validKey(entry[0]) ||
      !validRecovery(entry[1]) || pending.has(entry[0])) {
      throw new Error('Invalid pending agent message');
    }
    pending.set(entry[0], entry[1]);
  }
  return { drafts, pending, nextId: Number(snapshot.nextId) };
}

/** Agent-scoped encrypted drafts; an interrupted send is restored as an explicit recovery. */
export class AgentMessageDraftStore {
  private drafts = new Map<string, AgentDraft>();
  private attempts = new Map<string, AgentMessageAttempt>();
  private listeners = new Map<string, Set<() => void>>();
  private failures = new Map<string, string>();
  private nextId = 1;
  private dirty = 0;
  private saved = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writeFlight: Promise<void> = Promise.resolve();
  private ready: Promise<void> = Promise.resolve();
  private hydrated = true;
  private recoveryError: string | null = null;
  private persistenceError: string | null = null;

  constructor(private persistence?: ConversationDraftPersistence) {
    if (persistence) this.retryRecovery();
  }

  private publish(): void {
    for (const subscribers of this.listeners.values()) {
      for (const listener of subscribers) listener();
    }
  }

  private changed(): void {
    this.dirty++;
    this.publish();
    if (this.persistence && this.hydrated) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush().catch(() => {}), SAVE_DELAY_MS);
    }
  }

  private appendRecovery(key: string, recovery: AgentRecovery): void {
    const current = this.drafts.get(key) ?? EMPTY;
    if (current.recoveries.some((item) => item.id === recovery.id)) return;
    this.drafts.set(key, {
      ...current, recoveries: [...current.recoveries, recovery].slice(-MAX_RECOVERIES),
    });
  }

  private retryRecovery(): void {
    this.hydrated = false;
    this.recoveryError = null;
    this.ready = (async () => {
      try {
        const raw = await this.persistence!.load();
        if (raw !== null) {
          const restored = decode(raw);
          // Do not overwrite text entered while a slow recovery was in progress.
          this.drafts = new Map([...restored.drafts, ...this.drafts]);
          this.nextId = Math.max(this.nextId, restored.nextId);
          for (const [key, pending] of restored.pending) {
            this.appendRecovery(key, {
              ...pending,
              message: 'Previous delivery status is unknown. Check the agent transcript before restoring or resending.',
            });
            this.nextId = Math.max(this.nextId, pending.id + 1);
          }
        }
        this.hydrated = true;
        this.changed(); // Persist pending-send recovery without replaying a remote command.
      } catch (caught) {
        this.recoveryError = caught instanceof Error ? caught.message : 'Saved agent messages could not be loaded';
        this.publish();
      }
    })();
    this.publish();
  }

  isReady(): boolean { return this.hydrated; }
  isDurable(): boolean { return this.persistence?.durable ?? false; }
  whenReady(): Promise<void> { return this.ready; }
  getRecoveryError(): string | null { return this.recoveryError; }
  getPersistenceError(): string | null { return this.persistenceError; }
  retryLoad(): void { if (!this.hydrated && this.recoveryError) this.retryRecovery(); }

  async flush(): Promise<void> {
    await this.ready;
    if (!this.hydrated) throw new Error(this.recoveryError ?? 'Agent messages have not been restored');
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.persistence) return;
    const flight = this.writeFlight.catch(() => {}).then(async () => {
      while (this.saved !== this.dirty) {
        const revision = this.dirty;
        const raw = JSON.stringify({
          version: 1, nextId: this.nextId, drafts: [...this.drafts],
          pending: [...this.attempts].filter(([, attempt]) => attempt.phase === 'sending')
            .map(([key, attempt]) => [key, {
              id: attempt.id, body: attempt.body,
              message: 'Previous delivery status is unknown.',
            }]),
        });
        if (new TextEncoder().encode(raw).length > MAX_SNAPSHOT_BYTES) {
          throw new Error('Saved agent messages exceed 4 MB. Remove old recovered messages.');
        }
        await this.persistence!.save(raw);
        this.saved = revision;
      }
      if (this.persistenceError) { this.persistenceError = null; this.publish(); }
    });
    this.writeFlight = flight;
    try { await flight; }
    catch (caught) {
      this.persistenceError = caught instanceof Error ? caught.message : 'Could not save agent drafts';
      this.publish();
      throw caught;
    }
  }

  subscribe = (key: string, listener: () => void): (() => void) => {
    const subscribers = this.listeners.get(key) ?? new Set<() => void>();
    subscribers.add(listener);
    this.listeners.set(key, subscribers);
    return () => {
      subscribers.delete(listener);
      if (!subscribers.size) this.listeners.delete(key);
    };
  };

  read = (key: string): string => (this.drafts.get(key) ?? EMPTY).body;
  revision = (key: string): number => (this.drafts.get(key) ?? EMPTY).revision;
  recoveries = (key: string): AgentRecovery[] => (this.drafts.get(key) ?? EMPTY).recoveries;
  isSending = (key: string): boolean => this.attempts.has(key);
  pendingBody = (key: string): string => this.attempts.get(key)?.body ?? '';
  pendingPhase = (key: string): AgentMessageAttempt['phase'] | null => this.attempts.get(key)?.phase ?? null;
  sendFailure = (key: string): string => this.failures.get(key) ?? '';

  write = (key: string, value: string): void => {
    if (!validKey(key)) throw new Error('Invalid agent message destination');
    if (!validText(value)) throw new Error('Agent messages cannot exceed 100,000 characters');
    if (!this.drafts.has(key) && this.drafts.size >= MAX_DESTINATIONS) {
      throw new Error('Too many saved agent destinations; resolve old drafts before adding more');
    }
    const current = this.drafts.get(key) ?? EMPTY;
    if (current.body === value) return;
    this.drafts.set(key, { ...current, body: value, revision: current.revision + 1 });
    const attempt = this.attempts.get(key);
    if (attempt?.phase === 'preflight') this.attempts.delete(key);
    this.failures.delete(key);
    this.changed();
  };

  beginSend(key: string): AgentMessageAttempt | null {
    if (!this.hydrated || this.persistenceError || this.attempts.has(key) ||
      !validKey(key) || !this.read(key).trim()) return null;
    const attempt: AgentMessageAttempt = {
      id: this.nextId++, key, body: this.read(key), revision: this.revision(key), phase: 'preflight',
    };
    this.attempts.set(key, attempt);
    this.failures.delete(key);
    this.changed();
    return attempt;
  }

  canPrepare(attempt: AgentMessageAttempt): boolean {
    return this.attempts.get(attempt.key) === attempt && attempt.phase === 'preflight' &&
      this.revision(attempt.key) === attempt.revision;
  }

  markSending(attempt: AgentMessageAttempt): boolean {
    if (!this.canPrepare(attempt)) return false;
    attempt.phase = 'sending';
    const current = this.drafts.get(attempt.key) ?? EMPTY;
    this.drafts.set(attempt.key, { ...current, body: '', revision: current.revision + 1 });
    this.changed();
    return true;
  }

  canDispatch(attempt: AgentMessageAttempt): boolean {
    return this.attempts.get(attempt.key) === attempt && attempt.phase === 'sending';
  }

  cancel(attempt: AgentMessageAttempt, failure = ''): void {
    if (!this.canPrepare(attempt)) return;
    this.attempts.delete(attempt.key);
    if (failure) this.failures.set(attempt.key, failure);
    this.changed();
  }

  abortBeforeDispatch(attempt: AgentMessageAttempt, reason: string): void {
    if (!this.canDispatch(attempt)) return;
    this.attempts.delete(attempt.key);
    this.appendRecovery(attempt.key, {
      id: attempt.id, body: attempt.body, message: `Message was not sent. ${reason}`,
    });
    this.failures.set(attempt.key, 'Message was not sent. Restore it below after resolving the problem.');
    this.changed();
  }

  finishSend(attempt: AgentMessageAttempt, failure = ''): void {
    if (!this.canDispatch(attempt)) return;
    this.attempts.delete(attempt.key);
    if (failure) {
      this.appendRecovery(attempt.key, {
        id: attempt.id, body: attempt.body,
        message: `Send not confirmed: ${failure}. Check the agent transcript before resending.`,
      });
      this.failures.set(attempt.key, failure);
    } else {
      this.failures.delete(attempt.key);
    }
    this.changed();
  }

  /** Restoration never sends remotely and preserves newer typing as a separate recovery. */
  restore(key: string, id: number): void {
    if (this.isSending(key)) return;
    const current = this.drafts.get(key) ?? EMPTY;
    const saved = current.recoveries.find((item) => item.id === id);
    if (!saved) return;
    const recoveries = current.recoveries.filter((item) => item.id !== id);
    if (current.body) recoveries.push({
      id: this.nextId++, body: current.body, message: 'Your newer draft was kept separately.',
    });
    this.drafts.set(key, {
      body: saved.body, revision: current.revision + 1, recoveries: recoveries.slice(-MAX_RECOVERIES),
    });
    this.failures.delete(key);
    this.changed();
  }

  discardRecovery(key: string, id: number): void {
    const current = this.drafts.get(key) ?? EMPTY;
    if (!current.recoveries.some((item) => item.id === id)) return;
    this.drafts.set(key, { ...current, recoveries: current.recoveries.filter((item) => item.id !== id) });
    this.changed();
  }
}

export const agentMessageDrafts = new AgentMessageDraftStore(agentMessageDraftStorage);
