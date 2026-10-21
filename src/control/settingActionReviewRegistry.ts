/** A remote action can execute even if its reply is lost. Never resend it
 * until the user has checked the host and explicitly removed this lock. */
export interface SettingActionReview {
  label: string;
}

export interface SettingActionReviewPersistence {
  load(key: string): Promise<SettingActionReview | null>;
  save(key: string, value: SettingActionReview): Promise<void>;
  clear(key: string): Promise<void>;
}

export class SettingActionReviewRegistry {
  private readonly locks = new Map<string, SettingActionReview>();
  private readonly loads = new Map<string, Promise<SettingActionReview | null>>();

  constructor(private readonly storage: SettingActionReviewPersistence) {}

  get(key: string): SettingActionReview | null {
    return this.locks.get(key) ?? null;
  }

  async load(key: string): Promise<SettingActionReview | null> {
    const existing = this.get(key);
    if (existing) return existing;
    const inFlight = this.loads.get(key);
    if (inFlight) return inFlight;
    const read = this.storage.load(key).then((saved) => {
      // A new action may have reserved this key while the read was pending.
      if (saved && !this.locks.has(key)) this.locks.set(key, saved);
      return this.get(key);
    }).finally(() => { this.loads.delete(key); });
    this.loads.set(key, read);
    return read;
  }

  reserve(key: string, label: string): SettingActionReview | null {
    if (this.locks.has(key)) return null;
    const record = { label };
    this.locks.set(key, record);
    return record;
  }

  async persist(key: string, record: SettingActionReview): Promise<void> {
    if (this.get(key) !== record) throw new Error('Action review lock changed while saving.');
    // Callers MUST await this before making a network request. On failure,
    // retain the memory lock and fail closed.
    await this.storage.save(key, record);
  }

  async release(key: string, record: SettingActionReview): Promise<boolean> {
    if (this.get(key) !== record) return false;
    // Keep the memory lock until durable deletion succeeds. A failed delete
    // must not let the action run again after a process restart.
    await this.storage.clear(key);
    if (this.get(key) !== record) return false;
    this.locks.delete(key);
    return true;
  }
}
