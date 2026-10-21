export type PendingAction = {
  readonly key: string;
  readonly label: string;
};

/** In-flight controls survive screen/menu remounts, but never trigger a replay. */
export class PendingActionStore {
  private pending = new Map<string, PendingAction>();
  private listeners = new Set<() => void>();
  private version = 0;

  getVersion = () => this.version;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  get(key: string): PendingAction | undefined { return this.pending.get(key); }

  begin(key: string, label: string): PendingAction | null {
    if (this.pending.has(key)) return null;
    const action = { key, label };
    this.pending.set(key, action);
    this.publish();
    return action;
  }

  finish(action: PendingAction) {
    if (this.pending.get(action.key) !== action) return;
    this.pending.delete(action.key);
    this.publish();
  }

  private publish() {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }
}
