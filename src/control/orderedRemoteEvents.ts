/** Mirror the desktop's per-session durable ordering protocol for mobile.
 * A dropped chunk is replayed from the last *applied* cursor, never from a
 * newer event that arrived out of order. Pending chunks are bounded. */
export type OrderedRemoteEnvelope = {
  sessionId?: string;
  epoch?: number;
  sequence?: number;
};

type Cursor = { epoch: number; sequence: number };
type Replay = Cursor & { sessionId: string };
type SessionPending<T> = { epoch: number; events: Map<number, T>; replayRequested: boolean };

export class OrderedRemoteEvents<T extends OrderedRemoteEnvelope> {
  private readonly cursors = new Map<string, Cursor>();
  private readonly pending = new Map<string, SessionPending<T>>();

  /** A fresh linked watch starts at the desktop snapshot's durable cursor.
   * Existing cursors always win: they represent output we already applied. */
  seedCursor(sessionId: string, epoch: number, sequence: number): boolean {
    if (
      !sessionId || this.cursors.has(sessionId) || !Number.isSafeInteger(epoch) || epoch < 1 ||
      !Number.isSafeInteger(sequence) || sequence < 0
    ) return false;
    this.cursors.set(sessionId, { epoch, sequence });
    return true;
  }

  /** A host may have rewritten a timeline while the linked device was offline. */
  advanceEpoch(sessionId: string, epoch: number): boolean {
    const current = this.cursors.get(sessionId);
    if (!current || !Number.isSafeInteger(epoch) || epoch <= current.epoch) return false;
    this.cursors.set(sessionId, { epoch, sequence: 0 });
    this.pending.delete(sessionId);
    return true;
  }

  ingest(event: T): { events: T[]; replayFrom?: Replay; resetSession?: string } {
    const sessionId = event.sessionId;
    // Older notification frames can be unordered, but a frame claiming any
    // durable cursor must have a complete, valid one. Treating a malformed
    // durable frame as an unordered notification bypasses epoch/replay guards.
    if (event.epoch === undefined && event.sequence === undefined) {
      return { events: [event] };
    }
    if (
      !sessionId || !Number.isSafeInteger(event.epoch) || !Number.isSafeInteger(event.sequence) ||
      Number(event.epoch) < 1 || Number(event.sequence) < 1
    ) return { events: [] };

    const epoch = Number(event.epoch);
    const sequence = Number(event.sequence);
    let cursor = this.cursors.get(sessionId);
    let resetSession: string | undefined;
    if (cursor && epoch < cursor.epoch) return { events: [] };
    if (!cursor || epoch > cursor.epoch) {
      resetSession = cursor ? sessionId : undefined;
      cursor = { epoch, sequence: 0 };
      this.cursors.set(sessionId, cursor);
      this.pending.delete(sessionId);
    }
    if (sequence <= cursor.sequence) return { events: [] };

    let pending = this.pending.get(sessionId);
    if (!pending || pending.epoch !== epoch) {
      pending = { epoch, events: new Map(), replayRequested: false };
      this.pending.set(sessionId, pending);
    }
    if (pending.events.has(sequence)) return { events: [] };
    // A stalled or malicious stream must not retain memory indefinitely.
    // Reset the gap request so a later event can trigger recovery again.
    if (pending.events.size >= 4_096) {
      pending.events.clear();
      pending.replayRequested = false;
    }
    pending.events.set(sequence, event);

    const ready: T[] = [];
    while (pending.events.has(cursor.sequence + 1)) {
      const next = cursor.sequence + 1;
      ready.push(pending.events.get(next)!);
      pending.events.delete(next);
      cursor.sequence = next;
    }
    if (!pending.events.size) {
      pending.replayRequested = false;
      return { events: ready, resetSession };
    }
    if (pending.replayRequested) return { events: ready, resetSession };
    pending.replayRequested = true;
    return {
      events: ready,
      resetSession,
      replayFrom: { sessionId, epoch, sequence: cursor.sequence },
    };
  }

  getCursor(sessionId: string): Cursor | undefined {
    const cursor = this.cursors.get(sessionId);
    return cursor && { ...cursor };
  }

  getGap(sessionId: string): Replay | undefined {
    const cursor = this.cursors.get(sessionId);
    const pending = this.pending.get(sessionId);
    if (!cursor || !pending || pending.epoch !== cursor.epoch || !pending.events.size) return;
    return { sessionId, ...cursor };
  }

  /** On reconnect, replay replaces the partial tail. Keep last applied data. */
  clearPending(): void { this.pending.clear(); }
}
