import type { RemoteChangeReview, RemoteEventState, RemoteQuestion } from '../types/control';

/** The rendered prompt object is a local lease. Replacements (even A → B → A)
 * invalidate it before React commits the next screen. IDs also travel to the host. */
export function requireCurrentAttentionPrompt<T extends RemoteQuestion | RemoteChangeReview>(
  sessionId: string, expected: T | undefined, current: T | undefined,
): T {
  if (!expected || expected.sessionId !== sessionId || current !== expected) {
    throw new Error('This request changed. Review the current request before responding.');
  }
  return expected;
}

export type AttentionKind = 'question' | 'review';
export type AttentionResolution = {
  kind: AttentionKind;
  sessionId: string;
  promptId?: string;
  reviewRevision?: string;
  status: 'answered' | 'cancelled' | 'superseded' | 'accepted' | 'rejected' | 'terminalized' | 'not_pending' | 'unknown';
};

const STATUSES = {
  question: new Set(['answered', 'cancelled', 'superseded', 'not_pending']),
  review: new Set(['accepted', 'rejected', 'terminalized', 'not_pending']),
};

/** Resolution evidence travels with the update, never with a connection reset. */
export function readAttentionResolution(kind: AttentionKind, sessionId: string, raw: unknown): AttentionResolution {
  const payload = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const idField = kind === 'question' ? 'questionId' : 'reviewId';
  const id = payload[idField];
  const revision = kind === 'review' ? payload.reviewRevision : undefined;
  const hasId = Object.prototype.hasOwnProperty.call(payload, idField);
  const hasRevision = kind === 'review' && Object.prototype.hasOwnProperty.call(payload, 'reviewRevision');
  const validId = typeof id === 'string' && id.trim().length > 0;
  const validRevision = typeof revision === 'string' && revision.trim().length > 0;
  // Omitted identity can mean authoritative absence. Malformed identity cannot.
  const malformed = (hasId && !validId) || (hasRevision && (!validRevision || !validId));
  const status = !malformed && typeof payload.status === 'string' && STATUSES[kind].has(payload.status)
    ? payload.status as AttentionResolution['status'] : 'unknown';
  return { kind, sessionId, promptId: validId ? id : undefined, reviewRevision: validRevision ? revision : undefined, status };
}

/** Reuse the same matching rule for the live prompt and retained response locks.
 * Legacy identified reviews match only other revision-less reviews. */
export function attentionResolutionMatches(
  resolution: AttentionResolution, promptId: string | null | undefined, reviewRevision?: string,
): boolean {
  if (resolution.status === 'unknown') return false;
  if (!resolution.promptId) {
    return !resolution.reviewRevision && (resolution.status === 'not_pending' || !promptId);
  }
  return resolution.promptId === promptId
    && (resolution.kind !== 'review' || resolution.reviewRevision === reviewRevision);
}

/** A delayed resolution for prompt A must not remove replacement prompt B.
 * ID-less not_pending is the host's authoritative subscription snapshot; other
 * ID-less events cannot safely resolve an identified prompt. */
export function applyAttentionResolution(state: RemoteEventState, resolution: AttentionResolution): RemoteEventState {
  const { kind, sessionId, status } = resolution;
  if (status === 'unknown') return state;
  const current = kind === 'question' ? state.questions[sessionId] : state.reviews[sessionId];
  if (!current) return state;
  const currentId = 'question' in current ? current.questionId : current.reviewId;
  const currentRevision = 'question' in current ? undefined : current.reviewRevision;
  if (!attentionResolutionMatches(resolution, currentId, currentRevision)) return state;
  if (kind === 'question') {
    const questions = { ...state.questions };
    delete questions[sessionId];
    return { ...state, questions };
  }
  const reviews = { ...state.reviews };
  delete reviews[sessionId];
  return { ...state, reviews };
}
