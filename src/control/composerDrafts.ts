import type { MessageAttachment } from '../types/control';
import type { ConversationDraftPersistence } from './conversationDraftStorage';

export type ComposerDestination = {
  baseUrl: string;
  machineId: string;
  sessionId: string;
  projectId: string;
};

export type SavedComposerDraft = {
  id: number;
  body: string;
  attachments: MessageAttachment[];
  message: string;
  localRecording?: { uri: string; name: string; mimeType: string };
};

type ComposerDraft = {
  body: string;
  attachments: MessageAttachment[];
  revision: number;
  saved: SavedComposerDraft[];
};

export type ComposerLease = {
  key: string;
  destination: ComposerDestination;
};

export type ComposerAttempt = {
  id: number;
  lease: ComposerLease;
  revision: number;
  body: string;
  attachments: MessageAttachment[];
  phase: 'preflight' | 'consent' | 'sending';
};

const EMPTY_DRAFT: ComposerDraft = { body: '', attachments: [], revision: 0, saved: [] };
export const MAX_COMPOSER_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 48 * 1024 * 1024;
const MAX_DESTINATIONS = 250;
const MAX_RECOVERIES = 100;
const SAVE_DELAY_MS = 250;

/** Check actual encoded content as well as metadata, including recovered drafts. */
export function assertComposerAttachments(attachments: MessageAttachment[]): void {
  let total = 0;
  for (const file of attachments) {
    const offset = file.data.startsWith('data:') ? file.data.indexOf(',') + 1 : 0;
    const padding = file.data.endsWith('==') ? 2 : file.data.endsWith('=') ? 1 : 0;
    const encodedBytes = Math.max(0, Math.floor((file.data.length - offset) * 0.75) - padding);
    if (file.size !== undefined && (!Number.isFinite(file.size) || file.size < 0)) {
      throw new Error('An attachment has an invalid size. Remove it and select it again.');
    }
    total += Math.max(file.size ?? 0, encodedBytes);
    if (total > MAX_COMPOSER_ATTACHMENT_BYTES) throw new Error('Attachments exceed the 15 MB limit.');
  }
}

export function composerDestinationKey(destination: ComposerDestination): string {
  return JSON.stringify([
    destination.baseUrl, destination.machineId, destination.projectId, destination.sessionId,
  ]);
}

type PendingComposerSnapshot = { id: number; body: string; attachments: MessageAttachment[] };

function validDestinationKey(key: unknown): key is string {
  if (typeof key !== 'string' || key.length > 4096) return false;
  try {
    const parts: unknown = JSON.parse(key);
    return Array.isArray(parts) && parts.length === 4 &&
      parts.every((part) => typeof part === 'string' && part.length <= 1024);
  } catch { return false; }
}

function validAttachments(data: unknown): data is MessageAttachment[] {
  if (!Array.isArray(data) || data.length > 100) return false;
  try {
    for (const item of data) {
      if (!item || (item.type !== 'image' && item.type !== 'file') ||
        typeof item.data !== 'string' || typeof item.name !== 'string' ||
        (item.mimeType !== undefined && typeof item.mimeType !== 'string') ||
        (item.size !== undefined && (typeof item.size !== 'number' || !Number.isFinite(item.size)))) return false;
    }
    assertComposerAttachments(data);
    return true;
  } catch { return false; }
}

function savedDraft(value: unknown): value is SavedComposerDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<SavedComposerDraft>;
  return Number.isSafeInteger(draft.id) && Number(draft.id) > 0 &&
    typeof draft.body === 'string' && typeof draft.message === 'string' &&
    validAttachments(draft.attachments) && (!draft.localRecording ||
      (typeof draft.localRecording.uri === 'string' && typeof draft.localRecording.name === 'string' &&
        typeof draft.localRecording.mimeType === 'string'));
}

function decode(raw: string): {
  drafts: Map<string, ComposerDraft>; pending: Map<string, PendingComposerSnapshot>; nextId: number;
} {
  if (new TextEncoder().encode(raw).length > MAX_SNAPSHOT_BYTES) throw new Error('Saved conversations exceed the 48 MB limit');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid saved composer snapshot');
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.drafts) || record.drafts.length > MAX_DESTINATIONS ||
    !Array.isArray(record.pending) || record.pending.length > MAX_DESTINATIONS ||
    !Number.isSafeInteger(record.nextId) || Number(record.nextId) < 1) {
    throw new Error('Unsupported saved composer snapshot');
  }
  const drafts = new Map<string, ComposerDraft>();
  const pending = new Map<string, PendingComposerSnapshot>();
  for (const entry of record.drafts) {
    if (!Array.isArray(entry) || entry.length !== 2 || !validDestinationKey(entry[0]) ||
      !entry[1] || typeof entry[1] !== 'object') throw new Error('Invalid saved composer destination');
    const draft = entry[1] as Partial<ComposerDraft>;
    if (typeof draft.body !== 'string' || !validAttachments(draft.attachments) ||
      !Number.isSafeInteger(draft.revision) || Number(draft.revision) < 0 ||
      !Array.isArray(draft.saved) || draft.saved.length > MAX_RECOVERIES ||
      !draft.saved.every(savedDraft) || drafts.has(entry[0])) throw new Error('Invalid saved composer draft');
    drafts.set(entry[0], draft as ComposerDraft);
  }
  for (const entry of record.pending) {
    if (!Array.isArray(entry) || entry.length !== 2 || !validDestinationKey(entry[0]) ||
      !entry[1] || !Number.isSafeInteger(entry[1].id) || entry[1].id < 1 ||
      typeof entry[1].body !== 'string' || !validAttachments(entry[1].attachments) ||
      pending.has(entry[0])) throw new Error('Invalid saved pending message');
    pending.set(entry[0], entry[1] as PendingComposerSnapshot);
  }
  return { drafts, pending, nextId: Number(record.nextId) };
}

/** Host/chat-scoped drafts and uncertain sends; native persistence is encrypted. */
export class ComposerDraftStore {
  private drafts = new Map<string, ComposerDraft>();
  private attempts = new Map<string, ComposerAttempt>();
  private active: ComposerLease | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
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

  private retryRecovery() {
    this.hydrated = false;
    this.recoveryError = null;
    this.ready = (async () => {
      try {
        const raw = await this.persistence!.load();
        if (raw !== null) {
          const result = decode(raw);
          this.nextId = Math.max(this.nextId, result.nextId);
          this.drafts = new Map([...result.drafts, ...this.drafts]);
          for (const [key, attempt] of result.pending) {
            const current = this.read(key);
            this.drafts.set(key, { ...current, saved: [
              ...current.saved,
              { id: attempt.id, body: attempt.body, attachments: attempt.attachments,
                message: 'Previous send status is unknown after reopening. Check this chat before restoring or resending.' },
            ] });
            this.nextId = Math.max(this.nextId, attempt.id + 1);
          }
        }
        this.hydrated = true;
        if (raw !== null) this.changed();
        else this.publish();
      } catch (caught) {
        this.recoveryError = caught instanceof Error ? caught.message : 'Could not recover saved messages';
        this.publish();
      }
    })();
    this.publish();
  }

  whenReady(): Promise<void> { return this.ready; }
  isReady(): boolean { return this.hydrated; }
  isDurable(): boolean { return this.persistence?.durable ?? false; }
  getRecoveryError(): string | null { return this.recoveryError; }
  getPersistenceError(): string | null { return this.persistenceError; }
  retryLoad(): void { if (!this.hydrated && this.recoveryError) this.retryRecovery(); }

  async flush(): Promise<void> {
    await this.ready;
    if (!this.hydrated) throw new Error(this.recoveryError ?? 'Saved messages have not been restored');
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
              id: attempt.id, body: attempt.body, attachments: attempt.attachments,
            }]),
        });
        if (new TextEncoder().encode(raw).length > MAX_SNAPSHOT_BYTES) {
          throw new Error('Saved messages exceed 48 MB. Remove old attachments or recoveries before sending.');
        }
        await this.persistence!.save(raw);
        this.saved = revision;
      }
      if (this.persistenceError) { this.persistenceError = null; this.publish(); }
    });
    this.writeFlight = flight;
    try { await flight; }
    catch (caught) {
      this.persistenceError = caught instanceof Error ? caught.message : 'Could not save message drafts';
      this.publish();
      throw caught;
    }
  }

  private changed() {
    this.dirty++;
    this.publish();
    if (this.persistence && this.hydrated) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush().catch(() => {}), SAVE_DELAY_MS);
    }
  }

  getVersion = () => this.version;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  read(key: string): ComposerDraft { return this.drafts.get(key) ?? EMPTY_DRAFT; }
  busy(key: string): boolean { return this.attempts.has(key); }
  isActive(lease: ComposerLease): boolean { return this.active === lease; }

  activate(destination: ComposerDestination): ComposerLease {
    if (this.active) this.deactivate(this.active);
    // Identity, not key equality, rejects a delayed A→B→A continuation.
    const lease = { key: composerDestinationKey(destination), destination: { ...destination } };
    this.active = lease;
    return lease;
  }

  deactivate(lease: ComposerLease) {
    if (this.active !== lease) return;
    this.active = null;
    const attempt = this.attempts.get(lease.key);
    if (attempt?.lease === lease) this.cancel(attempt);
  }

  private publish() {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }

  private edit(key: string, patch: Partial<ComposerDraft>) {
    const current = this.read(key);
    this.drafts.set(key, { ...current, ...patch, revision: current.revision + 1 });
    const attempt = this.attempts.get(key);
    // Editing cancels preflight/consent, but cannot cancel a mutation already sent.
    if (attempt && attempt.phase !== 'sending') this.attempts.delete(key);
    this.changed();
  }

  setBody(key: string, value: string | ((current: string) => string)) {
    const current = this.read(key);
    const body = typeof value === 'function' ? value(current.body) : value;
    if (body !== current.body) this.edit(key, { body });
  }

  setAttachments(key: string, update: (current: MessageAttachment[]) => MessageAttachment[]) {
    const attachments = update(this.read(key).attachments);
    assertComposerAttachments(attachments);
    this.edit(key, { attachments: attachments.map((file) => ({ ...file })) });
  }

  begin(lease: ComposerLease): ComposerAttempt | null {
    const draft = this.read(lease.key);
    if (!this.hydrated || !this.isActive(lease) || this.busy(lease.key) || !lease.destination.machineId ||
      !lease.destination.sessionId || (!draft.body.trim() && !draft.attachments.length)) return null;
    assertComposerAttachments(draft.attachments);
    const attempt: ComposerAttempt = {
      id: this.nextId++, lease, revision: draft.revision, body: draft.body,
      attachments: draft.attachments.map((file) => ({ ...file })), phase: 'preflight',
    };
    this.attempts.set(lease.key, attempt);
    this.publish();
    return attempt;
  }

  canContinue(attempt: ComposerAttempt): boolean {
    return this.isActive(attempt.lease) && this.attempts.get(attempt.lease.key) === attempt &&
      attempt.phase !== 'sending' && this.read(attempt.lease.key).revision === attempt.revision;
  }

  waitForConsent(attempt: ComposerAttempt): boolean {
    if (!this.canContinue(attempt) || attempt.phase !== 'preflight') return false;
    attempt.phase = 'consent';
    this.publish();
    return true;
  }

  resumeConsent(attempt: ComposerAttempt): boolean {
    if (!this.canContinue(attempt) || attempt.phase !== 'consent') return false;
    // Claim synchronously before preference storage or any other await.
    attempt.phase = 'preflight';
    this.publish();
    return true;
  }

  consume(attempt: ComposerAttempt): boolean {
    if (!this.canContinue(attempt) || attempt.phase !== 'preflight') return false;
    attempt.phase = 'sending';
    this.edit(attempt.lease.key, { body: '', attachments: [] });
    return true;
  }

  /** A failed save or navigation before dispatch must keep the outgoing text recoverable. */
  abortBeforeDispatch(attempt: ComposerAttempt, reason: string): void {
    if (this.attempts.get(attempt.lease.key) !== attempt || attempt.phase !== 'sending') return;
    this.attempts.delete(attempt.lease.key);
    const current = this.read(attempt.lease.key);
    this.drafts.set(attempt.lease.key, { ...current, saved: [...current.saved, {
      id: attempt.id, body: attempt.body, attachments: attempt.attachments,
      message: `Message was not sent. ${reason}`,
    }] });
    this.changed();
  }

  canDispatch(attempt: ComposerAttempt): boolean {
    return this.isActive(attempt.lease) && this.attempts.get(attempt.lease.key) === attempt &&
      attempt.phase === 'sending';
  }

  cancel(attempt: ComposerAttempt) {
    if (this.attempts.get(attempt.lease.key) !== attempt || attempt.phase === 'sending') return;
    this.attempts.delete(attempt.lease.key);
    this.publish();
  }

  finish(attempt: ComposerAttempt, error?: string) {
    if (this.attempts.get(attempt.lease.key) !== attempt || attempt.phase !== 'sending') return;
    this.attempts.delete(attempt.lease.key);
    if (error) {
      const current = this.read(attempt.lease.key);
      this.drafts.set(attempt.lease.key, {
        ...current,
        saved: [...current.saved, {
          id: attempt.id, body: attempt.body, attachments: attempt.attachments,
          message: `Send not confirmed. Check this chat before resending. ${error}`,
        }],
      });
    }
    this.changed();
  }

  saveRecovery(key: string, draft: Omit<SavedComposerDraft, 'id'>): number {
    assertComposerAttachments(draft.attachments);
    const id = this.nextId++;
    const current = this.read(key);
    // Recovery must not replace newer typing or invalidate an unrelated send.
    this.drafts.set(key, {
      ...current,
      saved: [...current.saved, {
        ...draft, id, attachments: draft.attachments.map((file) => ({ ...file })),
        ...(draft.localRecording ? { localRecording: { ...draft.localRecording } } : {}),
      }],
    });
    this.changed();
    return id;
  }

  restore(key: string, id: number) {
    const current = this.read(key);
    const saved = current.saved.find((draft) => draft.id === id);
    if (!saved) return;
    if (saved.localRecording) throw new Error('Export this recording before starting a shorter dictation.');
    assertComposerAttachments(saved.attachments);
    const remaining = current.saved.filter((draft) => draft.id !== id);
    // Swap rather than merge unrelated messages or overwrite newer typing.
    if (current.body || current.attachments.length) remaining.push({
      id: this.nextId++, body: current.body, attachments: current.attachments,
      message: 'Your other draft is saved here.',
    });
    this.edit(key, { body: saved.body, attachments: saved.attachments, saved: remaining });
  }

  discardSaved(key: string, id: number) {
    const current = this.read(key);
    this.drafts.set(key, { ...current, saved: current.saved.filter((draft) => draft.id !== id) });
    this.changed();
  }
}
