import { useSyncExternalStore } from 'react';
import { useControl } from './ControlProvider';
import { attentionResponseKey, attentionResponseMessage, type AttentionKind } from './attentionResponses';
import type { RemoteChangeReview, RemoteQuestion } from '../types/control';

export function useAttentionResponse(kind: AttentionKind, prompt: RemoteQuestion | RemoteChangeReview | undefined) {
  const { pairing, attentionResponses } = useControl();
  const key = attentionResponseKey(pairing, kind, prompt);
  useSyncExternalStore(attentionResponses.subscribe, attentionResponses.getVersion, attentionResponses.getVersion);
  const response = attentionResponses.read(key);
  return {
    key,
    text: response.text,
    setText: (text: string) => attentionResponses.setText(key, text),
    busy: attentionResponses.busy(key),
    error: response.error,
    message: !attentionResponses.isReady()
      ? (attentionResponses.getRecoveryError() ?? 'Restoring saved responses…')
      : (attentionResponses.getPersistenceError() ?? attentionResponseMessage(response)),
  };
}
