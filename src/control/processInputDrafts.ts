/** Unsent process stdin is scoped to a host/process and encrypted on native devices. */
export type ProcessInputDraft = { text: string; revision: number };
export type ProcessLauncherDraft = { command: string; name: string; owner: string; revision: number };
export type ActivityOperationFeedback = { error: boolean; message: string };
export interface ProcessDraftPersistence {
  durable: boolean;
  load(): Promise<string | null>;
  save(contents: string): Promise<void>;
}
export type ProcessActivityState = {
  generation: number;
  drafts: Record<string, ProcessInputDraft>;
  pendingInputs: string[];
  pendingControls: string[];
  inputFeedback: Record<string, ActivityOperationFeedback>;
  controlFeedback: Record<string, ActivityOperationFeedback>;
  launcher: ProcessLauncherDraft;
  pendingStarts: string[];
  pendingCleanups: string[];
  startFeedback: Record<string, ActivityOperationFeedback>;
  cleanupFeedback: Record<string, ActivityOperationFeedback>;
};

const emptyLauncher = (): ProcessLauncherDraft => ({ command: '', name: '', owner: '', revision: 0 });
const SAVE_DELAY_MS = 180;
const MAX_SAVED_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 1000;

type SavedProcessDrafts = {
  drafts: Map<string, ProcessInputDraft>;
  launcher: ProcessLauncherDraft;
  pendingInputs: string[];
  pendingControls: string[];
  pendingStarts: string[];
  pendingCleanups: string[];
  inputFeedback: Map<string, ActivityOperationFeedback>;
  controlFeedback: Map<string, ActivityOperationFeedback>;
  startFeedback: Map<string, ActivityOperationFeedback>;
  cleanupFeedback: Map<string, ActivityOperationFeedback>;
};

function validKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parts: unknown = JSON.parse(value);
    return Array.isArray(parts) && parts.length === 2 &&
      parts.every((part) => typeof part === 'string' && part.length > 0);
  } catch { return false; }
}

function decode(raw: string): SavedProcessDrafts {
  if (new TextEncoder().encode(raw).length > MAX_SAVED_BYTES) throw new Error('Saved process drafts exceed 2 MB');
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 ||
    !('drafts' in data) || !Array.isArray(data.drafts) || data.drafts.length > MAX_ENTRIES ||
    !('launcher' in data) || !data.launcher || typeof data.launcher !== 'object') {
    throw new Error('Unsupported saved process draft snapshot');
  }
  const value = data as Record<string, unknown>;
  const launch = value.launcher as Record<string, unknown>;
  if (typeof launch.command !== 'string' || typeof launch.name !== 'string' ||
    typeof launch.owner !== 'string' || !Number.isSafeInteger(launch.revision) ||
    (launch.command.trim() && !launch.owner)) throw new Error('Invalid saved process launcher');

  const drafts = new Map<string, ProcessInputDraft>();
  for (const item of data.drafts) {
    if (!Array.isArray(item) || item.length !== 2 || !validKey(item[0]) ||
      !item[1] || typeof item[1] !== 'object' || typeof item[1].text !== 'string' ||
      !Number.isSafeInteger(item[1].revision) || item[1].revision < 0) {
      throw new Error('Invalid saved process input draft');
    }
    drafts.set(item[0], { text: item[1].text, revision: item[1].revision });
  }

  const pending = (name: string, validator: (key: unknown) => boolean): string[] => {
    const entries = value[name];
    if (!Array.isArray(entries) || entries.length > MAX_ENTRIES || !entries.every(validator)) {
      throw new Error(`Invalid saved process ${name}`);
    }
    return entries;
  };
  const feedback = (name: string, validator: (key: unknown) => boolean): Map<string, ActivityOperationFeedback> => {
    const entries = value[name];
    if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) throw new Error(`Invalid saved process ${name}`);
    const result = new Map<string, ActivityOperationFeedback>();
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2 || !validator(entry[0]) ||
        !entry[1] || typeof entry[1].message !== 'string' || typeof entry[1].error !== 'boolean') {
        throw new Error(`Invalid saved process ${name}`);
      }
      result.set(entry[0], { message: entry[1].message, error: entry[1].error });
    }
    return result;
  };
  const host = (entry: unknown) => typeof entry === 'string' && entry.length > 0;
  return {
    drafts, launcher: launch as ProcessLauncherDraft,
    pendingInputs: pending('pendingInputs', validKey),
    pendingControls: pending('pendingControls', validKey),
    pendingStarts: pending('pendingStarts', host),
    pendingCleanups: pending('pendingCleanups', host),
    inputFeedback: feedback('inputFeedback', validKey),
    controlFeedback: feedback('controlFeedback', validKey),
    startFeedback: feedback('startFeedback', host),
    cleanupFeedback: feedback('cleanupFeedback', host),
  };
}

export function processInputDraftKey(hostId: string, processId: string): string {
  return JSON.stringify([hostId, processId]);
}

export class ProcessInputDraftStore {
  private drafts = new Map<string, ProcessInputDraft>();
  private pendingInputs = new Set<string>();
  private pendingControls = new Set<string>();
  private inputFeedback = new Map<string, ActivityOperationFeedback>();
  private controlFeedback = new Map<string, ActivityOperationFeedback>();
  private launcher = emptyLauncher();
  private pendingStarts = new Set<string>();
  private pendingCleanups = new Set<string>();
  private startFeedback = new Map<string, ActivityOperationFeedback>();
  private cleanupFeedback = new Map<string, ActivityOperationFeedback>();
  private generation = 0;
  private listeners = new Set<() => void>();
  private dirty = 0;
  private saved = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private writeFlight: Promise<void> = Promise.resolve();
  private ready: Promise<void> = Promise.resolve();
  private hydrated = true;
  private recoveryError: string | null = null;
  private persistenceError: string | null = null;
  private currentSnapshot: ProcessActivityState = {
    generation: 0, drafts: {}, pendingInputs: [], pendingControls: [], inputFeedback: {}, controlFeedback: {}, launcher: emptyLauncher(),
    pendingStarts: [], pendingCleanups: [], startFeedback: {}, cleanupFeedback: {},
  };

  constructor(private persistence?: ProcessDraftPersistence) {
    if (persistence) this.retryRecovery();
  }

  private retryRecovery(): void {
    this.hydrated = false;
    this.recoveryError = null;
    this.ready = (async () => {
      try {
        const raw = await this.persistence!.load();
        if (raw !== null) {
          const stored = decode(raw);
          // On Fast Refresh, edits in the live instance take priority over the older file.
          this.drafts = new Map([...stored.drafts, ...this.drafts]);
          if (!this.launcher.command && !this.launcher.name) this.launcher = stored.launcher;
          this.inputFeedback = new Map([...stored.inputFeedback, ...this.inputFeedback]);
          this.controlFeedback = new Map([...stored.controlFeedback, ...this.controlFeedback]);
          this.startFeedback = new Map([...stored.startFeedback, ...this.startFeedback]);
          this.cleanupFeedback = new Map([...stored.cleanupFeedback, ...this.cleanupFeedback]);
          for (const key of [...stored.pendingInputs, ...this.pendingInputs]) this.inputFeedback.set(key, {
            error: true, message: 'Input status is unknown after reopening. Check the host before sending again.',
          });
          for (const key of [...stored.pendingControls, ...this.pendingControls]) this.controlFeedback.set(key, {
            error: true, message: 'Process control status is unknown after reopening. Check the host before retrying.',
          });
          for (const host of [...stored.pendingStarts, ...this.pendingStarts]) this.startFeedback.set(host, {
            error: true, message: 'Command status is unknown after reopening. Check the host before running it again.',
          });
          for (const host of [...stored.pendingCleanups, ...this.pendingCleanups]) this.cleanupFeedback.set(host, {
            error: true, message: 'Cleanup status is unknown after reopening. Check the host before trying again.',
          });
        }
        this.pendingInputs.clear();
        this.pendingControls.clear();
        this.pendingStarts.clear();
        this.pendingCleanups.clear();
        this.hydrated = true;
        // Persist resolved uncertainty markers; this never dispatches a remote mutation.
        if (raw !== null || this.drafts.size || this.launcher.command) this.changed();
        else this.publish();
      } catch (caught) {
        this.recoveryError = caught instanceof Error ? caught.message : 'Could not restore saved process drafts';
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
    if (!this.hydrated) throw new Error(this.recoveryError ?? 'Process draft recovery is incomplete');
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.persistence) return;
    const flight = this.writeFlight.catch(() => {}).then(async () => {
      // Edits can arrive during native file I/O. Flush must include those edits
      // before returning to callers that are about to dispatch a command.
      while (this.saved !== this.dirty) {
        const revision = this.dirty;
        const contents = JSON.stringify({
          version: 1, drafts: [...this.drafts], launcher: this.launcher,
          pendingInputs: [...this.pendingInputs], pendingControls: [...this.pendingControls],
          pendingStarts: [...this.pendingStarts], pendingCleanups: [...this.pendingCleanups],
          inputFeedback: [...this.inputFeedback], controlFeedback: [...this.controlFeedback],
          startFeedback: [...this.startFeedback], cleanupFeedback: [...this.cleanupFeedback],
        });
        if (new TextEncoder().encode(contents).length > MAX_SAVED_BYTES) {
          throw new Error('Saved process drafts exceed 2 MB. Reduce the draft before sending.');
        }
        await this.persistence!.save(contents);
        this.saved = revision;
      }
      if (this.persistenceError) { this.persistenceError = null; this.publish(); }
    });
    this.writeFlight = flight;
    try { await flight; }
    catch (caught) {
      this.persistenceError = caught instanceof Error ? caught.message : 'Could not save process drafts';
      this.publish();
      throw caught;
    }
  }

  /** Fast Refresh can preserve a provider instance created before Activity gained
   * launcher/start/cleanup state. Detect that instance before rendering children. */
  static hasCurrentActivityShape(store: ProcessInputDraftStore): boolean {
    const state = store.snapshot();
    return !!state?.launcher && !!state.inputFeedback && !!state.controlFeedback &&
      Array.isArray(state.pendingStarts) &&
      Array.isArray(state.pendingCleanups) && !!state.startFeedback &&
      !!state.cleanupFeedback && typeof store.beginStart === 'function' &&
      typeof store.beginCleanup === 'function' &&
      typeof store.editLauncherCommand === 'function' &&
      typeof store.reportInput === 'function' && typeof store.reportControl === 'function' &&
      typeof store.whenReady === 'function' && typeof store.flush === 'function' &&
      typeof store.invalidateConnection === 'function';
  }

  /** Replace an older in-memory instance without silently losing unsent text.
   * In-flight mutations become uncertain; they must be checked on the host. */
  static recoverLegacySnapshot(previous: Partial<ProcessActivityState>, persistence?: ProcessDraftPersistence): ProcessInputDraftStore {
    const restored = new ProcessInputDraftStore();
    restored.generation = (previous.generation ?? 0) + 1;
    for (const [key, draft] of Object.entries(previous.drafts ?? {})) {
      if (typeof draft?.text === 'string') restored.drafts.set(key, { ...draft });
    }
    if (previous.launcher && typeof previous.launcher.command === 'string') {
      restored.launcher = { ...previous.launcher };
    }
    restored.inputFeedback = new Map(Object.entries(previous.inputFeedback ?? {}));
    restored.controlFeedback = new Map(Object.entries(previous.controlFeedback ?? {}));
    restored.startFeedback = new Map(Object.entries(previous.startFeedback ?? {}));
    restored.cleanupFeedback = new Map(Object.entries(previous.cleanupFeedback ?? {}));
    for (const key of previous.pendingInputs ?? []) {
      restored.inputFeedback.set(key, {
        error: true,
        message: 'Input status is unknown after reloading. Check the host before sending again.',
      });
    }
    for (const key of previous.pendingControls ?? []) {
      restored.controlFeedback.set(key, {
        error: true,
        message: 'Process control status is unknown after reloading. Check the host before retrying.',
      });
    }
    for (const host of previous.pendingStarts ?? []) {
      restored.startFeedback.set(host, {
        error: true,
        message: 'Command status is unknown after reloading. Check the host before running it again.',
      });
    }
    for (const host of previous.pendingCleanups ?? []) {
      restored.cleanupFeedback.set(host, {
        error: true,
        message: 'Cleanup status is unknown after reloading. Check the host before trying again.',
      });
    }
    restored.publish();
    if (persistence) {
      restored.persistence = persistence;
      restored.retryRecovery();
    }
    return restored;
  }

  snapshot = () => this.currentSnapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish() {
    this.currentSnapshot = {
      generation: this.generation,
      drafts: Object.fromEntries(this.drafts),
      pendingInputs: [...this.pendingInputs],
      pendingControls: [...this.pendingControls],
      inputFeedback: Object.fromEntries(this.inputFeedback),
      controlFeedback: Object.fromEntries(this.controlFeedback),
      launcher: this.launcher,
      pendingStarts: [...this.pendingStarts],
      pendingCleanups: [...this.pendingCleanups],
      startFeedback: Object.fromEntries(this.startFeedback),
      cleanupFeedback: Object.fromEntries(this.cleanupFeedback),
    };
    for (const listener of this.listeners) listener();
  }

  private changed(): void {
    this.dirty += 1;
    this.publish();
    if (this.persistence) {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => { void this.flush().catch(() => {}); }, SAVE_DELAY_MS);
    }
  }

  /** Keep locks across Activity remounts, but invalidate them on explicit disconnect. */
  getGeneration(): number { return this.generation; }
  isCurrent(generation: number): boolean { return generation === this.generation; }
  /** Disconnect invalidates remote continuations without deleting unsent work.
   * An interrupted request may have reached the host, so preserve uncertainty. */
  invalidateConnection(): void {
    this.generation += 1;
    for (const key of this.pendingInputs) this.inputFeedback.set(key, {
      error: true, message: 'Input status is unknown after disconnect. Check the host before sending again.',
    });
    for (const key of this.pendingControls) this.controlFeedback.set(key, {
      error: true, message: 'Process control status is unknown after disconnect. Check the host before retrying.',
    });
    for (const host of this.pendingStarts) this.startFeedback.set(host, {
      error: true, message: 'Command status is unknown after disconnect. Check the host before running it again.',
    });
    for (const host of this.pendingCleanups) this.cleanupFeedback.set(host, {
      error: true, message: 'Cleanup status is unknown after disconnect. Check the host before trying again.',
    });
    this.pendingInputs.clear();
    this.pendingControls.clear();
    this.pendingStarts.clear();
    this.pendingCleanups.clear();
    this.changed();
  }
  beginInput(key: string): number | null { return this.begin(this.pendingInputs, key, this.inputFeedback); }
  finishInput(key: string, generation: number): void {
    if (this.isCurrent(generation)) this.finish(this.pendingInputs, key);
  }
  beginControl(key: string): number | null { return this.begin(this.pendingControls, key, this.controlFeedback); }
  finishControl(key: string, generation: number): void {
    if (this.isCurrent(generation)) this.finish(this.pendingControls, key);
  }
  beginStart(host: string): number | null { return this.begin(this.pendingStarts, host, this.startFeedback); }
  finishStart(host: string, generation: number): void {
    if (this.isCurrent(generation)) this.finish(this.pendingStarts, host);
  }
  beginCleanup(host: string): number | null { return this.begin(this.pendingCleanups, host, this.cleanupFeedback); }
  finishCleanup(host: string, generation: number): void {
    if (this.isCurrent(generation)) this.finish(this.pendingCleanups, host);
  }

  private begin(pending: Set<string>, key: string, feedback?: Map<string, ActivityOperationFeedback>): number | null {
    if (!this.hydrated || pending.has(key)) return null;
    pending.add(key);
    feedback?.delete(key);
    this.changed();
    return this.generation;
  }

  private finish(pending: Set<string>, key: string): void {
    if (pending.delete(key)) this.changed();
  }

  edit(key: string, text: string): void {
    if (!this.hydrated) return;
    const previous = this.drafts.get(key);
    this.drafts.set(key, { text, revision: (previous?.revision ?? 0) + 1 });
    this.inputFeedback.delete(key);
    this.changed();
  }

  /** A late acknowledgment must never erase a newer edit at the same destination. */
  confirm(key: string, submitted: ProcessInputDraft, generation: number): void {
    if (!this.isCurrent(generation)) return;
    const current = this.drafts.get(key);
    if (current?.revision === submitted.revision && current.text === submitted.text) {
      this.drafts.delete(key);
      this.changed();
    }
  }

  /** The launcher has one explicitly owned draft. Switching machines never retargets it. */
  editLauncherCommand(host: string, command: string): void {
    if (!this.hydrated) return;
    const owner = !this.launcher.command.trim() || !command.trim() ? host : this.launcher.owner;
    this.launcher = { ...this.launcher, command, owner, revision: this.launcher.revision + 1 };
    this.startFeedback.delete(host);
    this.changed();
  }

  editLauncherName(name: string): void {
    if (!this.hydrated) return;
    this.launcher = { ...this.launcher, name, revision: this.launcher.revision + 1 };
    this.startFeedback.delete(this.launcher.owner);
    this.changed();
  }

  moveLauncher(host: string): void {
    if (!this.hydrated) return;
    this.launcher = { ...this.launcher, owner: host, revision: this.launcher.revision + 1 };
    this.changed();
  }

  /** Late accepted starts clear only the draft actually submitted. */
  confirmLauncherStart(submitted: ProcessLauncherDraft, generation: number): boolean {
    if (!this.isCurrent(generation)) return false;
    const draft = this.launcher;
    if (draft.revision !== submitted.revision || draft.owner !== submitted.owner ||
      draft.command !== submitted.command || draft.name !== submitted.name) return false;
    this.launcher = emptyLauncher();
    this.changed();
    return true;
  }

  reportStart(host: string, generation: number, feedback: ActivityOperationFeedback): void {
    if (!this.isCurrent(generation)) return;
    this.startFeedback.set(host, feedback);
    this.changed();
  }

  reportInput(key: string, generation: number, feedback: ActivityOperationFeedback): void {
    if (!this.isCurrent(generation)) return;
    this.inputFeedback.set(key, feedback);
    this.changed();
  }

  reportControl(key: string, generation: number, feedback: ActivityOperationFeedback): void {
    if (!this.isCurrent(generation)) return;
    this.controlFeedback.set(key, feedback);
    this.changed();
  }

  reportCleanup(host: string, generation: number, feedback: ActivityOperationFeedback): void {
    if (!this.isCurrent(generation)) return;
    this.cleanupFeedback.set(host, feedback);
    this.changed();
  }

  clear(): void {
    if (!this.hydrated) return;
    // A previous in-flight response must not affect the next pairing, even if
    // the host/process ID, input and draft revision are identical.
    this.generation += 1;
    this.drafts.clear();
    this.pendingInputs.clear();
    this.pendingControls.clear();
    this.inputFeedback.clear();
    this.controlFeedback.clear();
    this.launcher = emptyLauncher();
    this.pendingStarts.clear();
    this.pendingCleanups.clear();
    this.startFeedback.clear();
    this.cleanupFeedback.clear();
    this.changed();
  }
}
