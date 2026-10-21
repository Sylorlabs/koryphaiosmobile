import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { EMPTY_SNAPSHOT } from './emptySnapshot';
import { ComposerDraftStore } from './composerDrafts';
import { composerDraftStorage } from './conversationDraftStorage';
import { ProcessInputDraftStore } from './processInputDrafts';
import { processDraftStorage } from './processDraftStorage';
import { PendingActionStore } from './pendingActions';
import { AttentionResponseStore, attentionResponseKey, type AttentionKind } from './attentionResponses';
import { attentionResponseStorage } from './attentionResponseStorage';
import type { AttentionResolution } from './remoteAttention';
import { isRemoteAuthError, RemoteClient } from './remoteClient';
import { EMPTY_REMOTE_EVENT_STATE, RemoteEventClient } from './remoteEvents';
import { LinkedRemoteEventClient } from './linkedRemoteEvents';
import { createLinkedRemoteTransport } from './linkedRemoteTransport';
import { useLinkedDevices } from './LinkedDeviceProvider';
import { clearPairing, loadPairing, savePairing } from './securePairing';
import { changesSelection, ControlRequestScope, recordCommand, runCommandLifecycle, type CommandStatus } from './commandLifecycle';
import type {
  CommandResult,
  ControlSnapshot,
  MobileCommand,
  PairingTarget,
  RemoteEventState,
} from '../types/control';

export type SessionModelChoice = {
  selection: string;
  reasoningLevel: string;
  fastMode: boolean;
};

type ControlContextValue = {
  snapshot: ControlSnapshot;
  composerDrafts: ComposerDraftStore;
  processInputDrafts: ProcessInputDraftStore;
  pendingActions: PendingActionStore;
  attentionResponses: AttentionResponseStore;
  pairing: PairingTarget | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  commandStatuses: CommandStatus[];
  dismissCommandStatus: (id: string) => void;
  live: RemoteEventState;
  attentionSessionIds: string[];
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  dismissedAgentIds: Set<string>;
  dismissAgent: (id: string) => void;
  modelChoices: Record<string, SessionModelChoice>;
  setModelChoice: (sessionId: string, patch: Partial<SessionModelChoice>) => void;
  refresh: () => Promise<void>;
  sendCommand: (name: string, payload?: Record<string, unknown>) => Promise<CommandResult>;
  inspect: <T = unknown>(name: string, payload?: Record<string, unknown>) => Promise<T>;
  pair: (baseUrl: string) => Promise<void>;
  disconnect: () => Promise<void>;
  answerQuestion: (sessionId: string, selection: string, text: string | undefined, responseKey: string) => Promise<void>;
  resolveReview: (sessionId: string, accepted: boolean, responseKey: string) => Promise<void>;
};

const ControlContext = createContext<ControlContextValue | null>(null);

function commandId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ControlProvider({ children }: { children: React.ReactNode }) {
  const [composerDrafts] = useState(() => new ComposerDraftStore(composerDraftStorage));
  const [processInputDrafts, setProcessInputDrafts] = useState(() => new ProcessInputDraftStore(processDraftStorage));
  // React preserves useState across Fast Refresh even when the store's class
  // shape changes. Upgrade it during render so Activity never sees partial state.
  if (!ProcessInputDraftStore.hasCurrentActivityShape(processInputDrafts)) {
    setProcessInputDrafts(ProcessInputDraftStore.recoverLegacySnapshot(processInputDrafts.snapshot(), processDraftStorage));
  }
  const [pendingActions] = useState(() => new PendingActionStore());
  const [attentionResponses] = useState(() => new AttentionResponseStore(attentionResponseStorage));
  const { links, activeHostId, ready: linkedReady, rpc: linkedRpc, subscribeEvents, selectHost } = useLinkedDevices();
  const [snapshot, setSnapshot] = useState<ControlSnapshot>(EMPTY_SNAPSHOT);
  const [pairing, setPairing] = useState<PairingTarget | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('kory-manager');
  const [dismissedAgentIds, setDismissedAgentIds] = useState<Set<string>>(() => new Set());
  const [modelChoices, setModelChoices] = useState<Record<string, SessionModelChoice>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandStatuses, setCommandStatuses] = useState<CommandStatus[]>([]);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const foregroundRef = useRef(foreground);
  const [live, setLive] = useState<RemoteEventState>(EMPTY_REMOTE_EVENT_STATE);
  const eventClientRef = useRef<RemoteEventClient | LinkedRemoteEventClient | null>(null);
  const authRefreshRef = useRef<{ scope: ControlRequestScope; promise: Promise<PairingTarget> } | null>(null);
  const activeLink = useMemo(() => links.find((link) => link.peer.id === activeHostId) ?? null, [links, activeHostId]);
  const linkedTarget = useMemo<PairingTarget | null>(() => activeLink ? ({ baseUrl: 'linked://' + activeLink.peer.id, token: '', machineId: activeLink.peer.id, machineName: activeLink.peer.name }) : null, [activeLink]);
  const controlPairing = linkedTarget ?? pairing;
  const scopeKey = controlPairing ? `${controlPairing.baseUrl}|${controlPairing.machineId}` : '';
  const requestScope = useMemo(() => new ControlRequestScope(scopeKey), [scopeKey]);
  const currentScope = useRef<ControlRequestScope | null>(requestScope);
  const questionKey = attentionResponseKey(controlPairing, 'question', live.questions[snapshot.activeSessionId]);
  const reviewKey = attentionResponseKey(controlPairing, 'review', live.reviews[snapshot.activeSessionId]);
  const attentionContext = useMemo(() => ({
    owner: requestScope, sessionId: snapshot.activeSessionId, projectId: snapshot.activeProjectId,
    questionKey, reviewKey,
  }), [requestScope, snapshot.activeSessionId, snapshot.activeProjectId, questionKey, reviewKey]);
  const currentAttentionContext = useRef(attentionContext);
  useLayoutEffect(() => { currentAttentionContext.current = attentionContext; }, [attentionContext]);
  const targetRef = useRef(controlPairing);
  const selectionRef = useRef({ sessionId: '', projectId: '' });
  const refreshFlight = useRef<{
    scope: ControlRequestScope;
    ticket: ReturnType<ControlRequestScope['beginSnapshot']>;
    promise: Promise<void>;
  } | null>(null);
  const [renderedScope, setRenderedScope] = useState(scopeKey);
  if (renderedScope !== scopeKey) {
    setRenderedScope(scopeKey);
    setSnapshot(EMPTY_SNAPSHOT);
    setLive(EMPTY_REMOTE_EVENT_STATE);
    setCommandStatuses([]);
    setRefreshing(false);
    setError(null);
    setSelectedAgentId('kory-manager');
    setDismissedAgentIds(new Set());
    setModelChoices({});
  }
  useLayoutEffect(() => {
    if (currentScope.current !== requestScope) selectionRef.current = { sessionId: '', projectId: '' };
    currentScope.current = requestScope;
    targetRef.current = controlPairing;
  }, [requestScope, controlPairing]);
  const effectiveLoading = loading || !linkedReady;
  const makeClient = useCallback((target: PairingTarget, defaultSessionId = '') => new RemoteClient(target, target.baseUrl.startsWith('linked://') ? createLinkedRemoteTransport({ hostId: target.machineId, defaultSessionId, rpc: linkedRpc }) : undefined), [linkedRpc]);

  const applySnapshot = useCallback((next: ControlSnapshot) => {
    selectionRef.current = { sessionId: next.activeSessionId, projectId: next.activeProjectId };
    setSnapshot(next);
    setSelectedAgentId((selected) => next.agents.some((agent) => agent.id === selected)
      ? selected
      : next.agents.find((agent) => agent.id === 'kory-manager')?.id ?? next.agents[0]?.id ?? 'kory-manager');
  }, []);

  const renewPairing = useCallback(async (current: PairingTarget, owner: ControlRequestScope): Promise<PairingTarget> => {
    if (currentScope.current !== owner) throw new Error('The selected machine changed.');
    if (authRefreshRef.current?.scope === owner) return authRefreshRef.current.promise;
    const renewal = RemoteClient.pair(current.baseUrl, 'Koryphaios Mobile')
      .then(async (next) => {
        if (currentScope.current !== owner) throw new Error('The selected machine changed.');
        await savePairing(next);
        if (currentScope.current !== owner) throw new Error('The selected machine changed.');
        setPairing(next);
        return next;
      })
      .finally(() => {
        if (authRefreshRef.current?.promise === renewal) authRefreshRef.current = null;
      });
    authRefreshRef.current = { scope: owner, promise: renewal };
    return renewal;
  }, []);

  const readSnapshot = useCallback(async (initialTarget: PairingTarget, sessionId: string, owner: ControlRequestScope) => {
    try {
      return await makeClient(initialTarget, sessionId).snapshot(sessionId);
    } catch (caught) {
      if (initialTarget.baseUrl.startsWith('linked://') || !isRemoteAuthError(caught)) throw caught;
      const renewed = await renewPairing(initialTarget, owner);
      return makeClient(renewed, sessionId).snapshot(sessionId);
    }
  }, [makeClient, renewPairing]);

  const refresh = useCallback((): Promise<void> => {
    const target = targetRef.current;
    const owner = requestScope;
    if (!target || currentScope.current !== owner) return Promise.resolve();
    if (refreshFlight.current?.scope === owner && owner.acceptsSnapshot(refreshFlight.current.ticket)) {
      return refreshFlight.current.promise;
    }
    const ticket = owner.beginSnapshot();
    const sessionId = selectionRef.current.sessionId;
    setRefreshing(true);
    let promise!: Promise<void>;
    promise = (async () => {
      try {
        const next = await readSnapshot(target, sessionId, owner);
        if (currentScope.current !== owner || !owner.acceptsSnapshot(ticket)) return;
        applySnapshot(next);
        setError(null);
      } catch (caught) {
        if (currentScope.current !== owner || !owner.acceptsSnapshot(ticket)) return;
        setError(caught instanceof Error ? caught.message : 'Could not reach remote Koryphaios');
        setSnapshot((previous) => ({ ...previous, machine: { ...previous.machine, status: 'offline' } }));
      } finally {
        if (refreshFlight.current?.promise === promise) {
          refreshFlight.current = null;
          if (currentScope.current === owner) setRefreshing(false);
        }
      }
    })();
    refreshFlight.current = { scope: owner, ticket, promise };
    return promise;
  }, [applySnapshot, readSnapshot, requestScope]);

  useEffect(() => {
    return () => {
      if (currentScope.current === requestScope) currentScope.current = null;
    };
  }, [requestScope]);

  useEffect(() => {
    let mounted = true;
    void loadPairing()
      .then((saved) => { if (mounted) setPairing(saved); })
      .catch(() => { if (mounted) setError('Saved pairing could not be loaded. Pair the machine again.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!scopeKey || !foreground) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const runRefresh = async () => {
      await refresh();
      if (!cancelled) timer = setTimeout(() => void runRefresh(), 3500);
    };
    timer = setTimeout(() => void runRefresh(), 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scopeKey, foreground, refresh]);

  // Revalidate remote state when iOS resumes the app. Mobile controllers are
  // frequently suspended while the user switches apps or locks the device;
  // stale connection state is worse than a short refresh.
  useEffect(() => {
    let wasBackgrounded = AppState.currentState === 'background';

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const isActive = nextState === 'active';

      if (nextState === 'inactive' || nextState === 'background') {
        void attentionResponses.flush().catch(() => {});
        void processInputDrafts.flush().catch(() => {});
        void composerDrafts.flush().catch(() => {});
      }
      if (nextState === 'background') {
        wasBackgrounded = true;
        foregroundRef.current = false;
        setForeground(false);
        eventClientRef.current?.suspend();
      }
      if (isActive) {
        foregroundRef.current = true;
        setForeground(true);
      }
      if (wasBackgrounded && isActive && targetRef.current) {
        wasBackgrounded = false;
        void refresh();
        eventClientRef.current?.resume();
      }
    });

    return () => subscription.remove();
  }, [refresh, attentionResponses, processInputDrafts, composerDrafts]);

  useEffect(() => {
    eventClientRef.current?.dispose();
    eventClientRef.current = null;
    if (!controlPairing) return;
    const owner = requestScope;
    let previousLive = EMPTY_REMOTE_EVENT_STATE;
    const receive = (next: RemoteEventState, resolutions?: AttentionResolution[]) => {
      if (eventClientRef.current !== client || currentScope.current !== owner) return;
      attentionResponses.reconcile(controlPairing, previousLive, next, resolutions);
      previousLive = next;
      setLive(next);
    };
    const client = controlPairing.baseUrl.startsWith('linked://') && activeLink
      ? new LinkedRemoteEventClient(activeLink.peer.id, linkedRpc, subscribeEvents, receive)
      : new RemoteEventClient(controlPairing, receive);
    eventClientRef.current = client;
    // Keep the same ordered event client across iOS background/foreground.
    // Recreating it discards the in-progress text stream and its replay cursor.
    // AppState handles suspend/resume while the selected host stays the same.
    if (foregroundRef.current) client.connect(selectionRef.current.sessionId);
    else {
      client.suspend();
      client.setActiveSession(selectionRef.current.sessionId);
    }
    return () => {
      if (eventClientRef.current === client) eventClientRef.current = null;
      client.dispose();
    };
  }, [activeLink, controlPairing, linkedRpc, subscribeEvents, requestScope, attentionResponses]);

  useEffect(() => {
    eventClientRef.current?.setActiveSession(snapshot.activeSessionId);
  }, [controlPairing, snapshot.activeSessionId]);

  const sendCommand = useCallback(
    (name: string, payload?: Record<string, unknown>): Promise<CommandResult> => {
      const command: MobileCommand = { id: commandId(), name, payload };
      const owner = requestScope;
      const target = targetRef.current;
      const selection = { ...selectionRef.current };
      const selectsDestination = changesSelection(name);
      const selectionVersion = owner.beginCommand(selectsDestination);
      const promise = runCommandLifecycle({
        id: command.id,
        name,
        execute: async () => {
          if (!target || currentScope.current !== owner) throw new Error('Pair a remote machine first');
          // Commands can contain several mutations. Replaying the entire command
          // after an auth/transport failure could duplicate an earlier mutation.
          return makeClient(target, selection.sessionId).command(command, selection.sessionId, selection.projectId);
        },
        reconcile: async (result) => {
          if (!target || currentScope.current !== owner || !owner.acceptsSelection(selectionVersion)) return false;
          // A background edit may have started while navigation was pending.
          // Only navigation selects a destination. Sending requires an existing
          // chat; other commands reconcile the current visible chat.
          if (selectsDestination) {
            selectionRef.current = {
              sessionId: result.sessionId ??
                (name === 'session.select' || name === 'project.select' ? String(payload?.sessionId ?? '') : selection.sessionId),
              projectId: typeof payload?.projectId === 'string' ? payload.projectId : selectionRef.current.projectId,
            };
          }
          const sessionId = selectionRef.current.sessionId;
          const ticket = owner.beginSnapshot();
          const next = await readSnapshot(target, sessionId, owner);
          if (currentScope.current !== owner || !owner.acceptsSnapshot(ticket)) return false;
          applySnapshot(next);
          setError(null);
          return true;
        },
        publish: (status) => {
          if (currentScope.current !== owner) return;
          setCommandStatuses((previous) => recordCommand(previous, status));
        },
      });
      // Keep fire-and-forget controls observable without swallowing rejection
      // for callers that await the returned promise to preserve their drafts.
      void promise.catch((caught) => {
        if (currentScope.current === owner) setError(caught instanceof Error ? caught.message : 'Remote request not confirmed');
      });
      return promise;
    },
    [applySnapshot, makeClient, readSnapshot, requestScope],
  );

  const dismissCommandStatus = useCallback((id: string) => {
    setCommandStatuses((previous) => previous.filter((item) => item.id !== id || item.state === 'running'));
  }, []);

  const inspect = useCallback(
    async <T = unknown,>(name: string, payload?: Record<string, unknown>): Promise<T> => {
      if (!controlPairing) throw new Error('Pair a remote machine first');
      const owner = requestScope;
      const version = owner.selectionVersion();
      const sessionId = snapshot.activeSessionId;
      const projectId = snapshot.activeProjectId;
      const assertCurrent = () => {
        if (currentScope.current !== owner) throw new Error('The selected machine changed.');
        if (!owner.acceptsSelection(version) ||
            selectionRef.current.sessionId !== sessionId ||
            selectionRef.current.projectId !== projectId) {
          throw new Error('The selected chat or project changed.');
        }
      };
      assertCurrent();
      try {
        const result = await makeClient(controlPairing, sessionId).inspect<T>(name, payload, sessionId, projectId);
        assertCurrent();
        return result;
      } catch (caught) {
        assertCurrent();
        if (controlPairing.baseUrl.startsWith('linked://') || !isRemoteAuthError(caught) || !pairing) throw caught;
        const target = await renewPairing(pairing, owner);
        assertCurrent();
        const result = await makeClient(target, sessionId).inspect<T>(name, payload, sessionId, projectId);
        assertCurrent();
        return result;
      }
    },
    [controlPairing, makeClient, pairing, renewPairing, requestScope, snapshot.activeProjectId, snapshot.activeSessionId],
  );

  const pair = useCallback(async (baseUrl: string) => {
    setLoading(true);
    setError(null);
    try {
      await selectHost('');
      const target = await RemoteClient.pair(baseUrl, 'Koryphaios Mobile');
      await savePairing(target);
      const next = await new RemoteClient(target).snapshot();
      setPairing(target);
      setSnapshot(next);
      setSelectedAgentId(next.agents.find((agent) => agent.id === 'kory-manager')?.id ?? next.agents[0]?.id ?? 'kory-manager');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Pairing failed';
      setError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, [selectHost]);

  const disconnect = useCallback(async () => {
    requestScope.dispose();
    currentScope.current = null;
    // Invalidate pending Activity callbacks before awaiting revoke/storage I/O.
    processInputDrafts.invalidateConnection();
    if (activeLink) {
      await selectHost('');
      setSnapshot(EMPTY_SNAPSHOT);
      setLive(EMPTY_REMOTE_EVENT_STATE);
      setError(null);
      return;
    }
    if (pairing) {
      try {
        await new RemoteClient(pairing).revoke();
      } catch {
        // Local disconnect still succeeds if the host is currently unreachable.
      }
    }
    await clearPairing();
    setPairing(null);
    setSnapshot(EMPTY_SNAPSHOT);
    setLive(EMPTY_REMOTE_EVENT_STATE);
    setSelectedAgentId('kory-manager');
    setDismissedAgentIds(new Set());
    setModelChoices({});
    setError(null);
  }, [activeLink, pairing, processInputDrafts, requestScope, selectHost]);

  const setModelChoice = useCallback((sessionId: string, patch: Partial<SessionModelChoice>) => {
    if (!sessionId) return;
    setModelChoices((current) => ({
      ...current,
      [sessionId]: {
        selection: patch.selection ?? current[sessionId]?.selection ?? '',
        reasoningLevel: patch.reasoningLevel ?? current[sessionId]?.reasoningLevel ?? '',
        fastMode: patch.fastMode ?? current[sessionId]?.fastMode ?? false,
      },
    }));
  }, []);

  const dismissAgent = useCallback((id: string) => {
    if (!id) return;
    setDismissedAgentIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setSelectedAgentId((current) => {
      if (current !== id) return current;
      return (
        snapshot.agents.find((agent) => agent.id === 'kory-manager')?.id ??
        snapshot.agents.find((agent) => !agent.parentId && agent.id !== id)?.id ??
        'kory-manager'
      );
    });
  }, [snapshot.agents]);

  const submitAttention = useCallback(async (
    kind: AttentionKind,
    sessionId: string,
    responseKey: string,
    choice: string,
    dispatch: (client: RemoteEventClient | LinkedRemoteEventClient) => void | Promise<void>,
  ): Promise<void> => {
    // Captured callbacks cannot revive after host/chat/prompt A → B → A.
    if (currentAttentionContext.current !== attentionContext || currentScope.current !== attentionContext.owner
      || sessionId !== attentionContext.sessionId || !responseKey
      || responseKey !== (kind === 'question' ? attentionContext.questionKey : attentionContext.reviewKey)) return;
    const attempt = attentionResponses.begin(responseKey, choice);
    if (!attempt) return;
    try {
      await attentionResponses.flush();
      if (!attentionResponses.isCurrent(attempt)
        || currentAttentionContext.current !== attentionContext || currentScope.current !== attentionContext.owner) {
        throw new Error('The request changed before it could be sent.');
      }
      const client = eventClientRef.current;
      if (!client) throw new Error('Live controls are disconnected. Reconnect before responding.');
      await dispatch(client);
      // A successful socket write is submission, not host acknowledgement.
      attentionResponses.submitted(attempt);
    } catch (caught) {
      attentionResponses.failed(attempt, caught instanceof Error ? caught.message : 'Could not confirm the response.');
    }
  }, [attentionContext, attentionResponses]);

  const answerQuestion = useCallback((sessionId: string, selection: string, text: string | undefined, responseKey: string) =>
    submitAttention('question', sessionId, responseKey, selection, (client) => client.answerQuestion(sessionId, selection, text, live.questions[sessionId])),
  [submitAttention, live.questions]);

  const resolveReview = useCallback((sessionId: string, accepted: boolean, responseKey: string) =>
    submitAttention('review', sessionId, responseKey, accepted ? 'Keep changes' : 'Reject changes', (client) => client.resolveReview(sessionId, accepted, live.reviews[sessionId])),
  [submitAttention, live.reviews]);

  const attentionSessionIds = useMemo(
    () => [...new Set([...Object.keys(live.questions), ...Object.keys(live.reviews)])],
    [live.questions, live.reviews],
  );

  const value = useMemo<ControlContextValue>(
    () => ({
      snapshot,
      composerDrafts,
      processInputDrafts,
      pendingActions,
      attentionResponses,
      pairing: controlPairing,
      loading: effectiveLoading,
      refreshing,
      error,
      commandStatuses,
      dismissCommandStatus,
      live,
      attentionSessionIds,
      selectedAgentId,
      setSelectedAgentId,
      dismissedAgentIds,
      dismissAgent,
      modelChoices,
      setModelChoice,
      refresh,
      sendCommand,
      inspect,
      pair,
      disconnect,
      answerQuestion,
      resolveReview,
    }),
    [snapshot, composerDrafts, processInputDrafts, pendingActions, attentionResponses, controlPairing, effectiveLoading, refreshing, error, commandStatuses, dismissCommandStatus, live, attentionSessionIds, selectedAgentId, dismissedAgentIds, dismissAgent, modelChoices, setModelChoice, refresh, sendCommand, inspect, pair, disconnect, answerQuestion, resolveReview],
  );

  return <ControlContext.Provider value={value}>{children}</ControlContext.Provider>;
}

export function useControl(): ControlContextValue {
  const value = useContext(ControlContext);
  if (!value) throw new Error('useControl must be used inside ControlProvider');
  return value;
}
