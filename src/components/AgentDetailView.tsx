import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Bot, CircleStop, Send, X } from 'lucide-react-native';
import { router } from 'expo-router';

import { useControl } from '../control/ControlProvider';
import { agentMessageDrafts } from '../control/agentMessageDrafts';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type { Agent, AgentThreadEntry, ModelCatalogEntry } from '../types/control';
import { ActionButton, Eyebrow, ProgressBar, SectionTitle, StatusDot } from './ui';

export function AgentDetailView({ agent, embedded = false }: { agent: Agent; embedded?: boolean }) {
  const { snapshot, pairing } = useControl();
  const draftKey = JSON.stringify([
    pairing?.baseUrl ?? '',
    pairing?.machineId ?? snapshot.machine.id,
    snapshot.activeProjectId,
    snapshot.activeSessionId,
    agent.id,
  ]);
  return <AgentDetailBody key={draftKey} agent={agent} embedded={embedded} draftKey={draftKey} />;
}

function AgentDetailBody({ agent, embedded, draftKey }: { agent: Agent; embedded: boolean; draftKey: string }) {
  const {
    snapshot,
    inspect,
    sendCommand,
    setSelectedAgentId,
    dismissedAgentIds,
    dismissAgent,
    modelChoices,
  } = useControl();
  const children = snapshot.agents.filter(
    (candidate) => candidate.parentId === agent.id && !dismissedAgentIds.has(candidate.id),
  );
  const isRunning = agent.status === 'running';
  const subscribeDraft = useCallback(
    (listener: () => void) => agentMessageDrafts.subscribe(draftKey, listener), [draftKey],
  );
  const message = useSyncExternalStore(
    subscribeDraft,
    useCallback(() => agentMessageDrafts.read(draftKey), [draftKey]),
  );
  const sending = useSyncExternalStore(
    subscribeDraft,
    useCallback(() => agentMessageDrafts.isSending(draftKey), [draftKey]),
  );
  const pendingBody = useSyncExternalStore(
    subscribeDraft,
    useCallback(() => agentMessageDrafts.pendingBody(draftKey), [draftKey]),
  );
  const pendingPhase = useSyncExternalStore(
    subscribeDraft,
    useCallback(() => agentMessageDrafts.pendingPhase(draftKey), [draftKey]),
  );
  const deliveryError = useSyncExternalStore(
    subscribeDraft,
    useCallback(() => agentMessageDrafts.sendFailure(draftKey), [draftKey]),
  );
  const savedMessages = useSyncExternalStore(
    subscribeDraft,
    useCallback(() => agentMessageDrafts.recoveries(draftKey), [draftKey]),
  );
  const draftsReady = useSyncExternalStore(
    subscribeDraft, agentMessageDrafts.isReady.bind(agentMessageDrafts),
  );
  const draftRecoveryError = useSyncExternalStore(
    subscribeDraft, agentMessageDrafts.getRecoveryError.bind(agentMessageDrafts),
  );
  const draftSaveError = useSyncExternalStore(
    subscribeDraft, agentMessageDrafts.getPersistenceError.bind(agentMessageDrafts),
  );
  const [sendError, setSendError] = useState('');
  const [sendNotice, setSendNotice] = useState('');
  const [closing, setClosing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const controlInFlight = useRef(false);
  const [controlError, setControlError] = useState('');
  const mounted = useRef(true);
  const [thread, setThread] = useState<AgentThreadEntry[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');
  const managerComposer =
    agent.id === 'kory-manager' ||
    agent.id === 'manager' ||
    agent.role.toLowerCase() === 'manager';
  const modelChoiceKey = managerComposer
    ? snapshot.activeSessionId
    : `${snapshot.activeSessionId}:agent:${agent.id}`;
  const modelChoice = modelChoices[modelChoiceKey];
  const inferredSelection = useMemo(() => {
    const targetModel = agent.model.trim().toLowerCase();
    const targetProvider = agent.provider.trim().toLowerCase();
    const candidates = snapshot.modelCatalog.filter((model: ModelCatalogEntry) =>
      [model.id, model.name, model.selection].some(
        (value) => value.trim().toLowerCase() === targetModel,
      ),
    );
    return (
      candidates.find((model) =>
        [model.provider, model.providerLabel].some(
          (value) => value.trim().toLowerCase() === targetProvider,
        ),
      )?.selection ??
      candidates[0]?.selection ??
      ''
    );
  }, [agent.model, agent.provider, snapshot.modelCatalog]);
  const selectedModel = modelChoice?.selection || inferredSelection;
  const selectedModelEntry = snapshot.modelCatalog.find(
    (model) => model.selection === selectedModel,
  );
  const selectedReasoning = modelChoice?.reasoningLevel ?? '';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadThread = useCallback(async () => {
    if (!agent.parentId || !snapshot.activeSessionId) return;
    setThreadLoading(true);
    setThreadError('');
    try {
      setThread(await inspect<AgentThreadEntry[]>('agent.thread', {
        sessionId: snapshot.activeSessionId,
        agentId: agent.id,
      }));
    } catch (caught) {
      setThreadError(caught instanceof Error ? caught.message : 'Could not load this agent transcript');
    } finally {
      setThreadLoading(false);
    }
  }, [agent.id, agent.parentId, inspect, snapshot.activeSessionId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadThread(), 0);
    return () => clearTimeout(timer);
  }, [agent.currentTask, agent.status, loadThread]);

  const sendMessage = async () => {
    if (!agentMessageDrafts.isReady() || agentMessageDrafts.getPersistenceError() ||
      agentMessageDrafts.isSending(draftKey)) return;
    const body = agentMessageDrafts.read(draftKey).trim();
    if (!body) return;
    if (!snapshot.activeSessionId) {
      setSendError('Open a chat on this machine before messaging an agent.');
      return;
    }
    if (AppState.currentState !== 'active') {
      setSendError('Return to the app before sending this message.');
      return;
    }
    const attempt = agentMessageDrafts.beginSend(draftKey);
    if (!attempt) return;
    setSendError('');
    setSendNotice('');
    try {
      // Save the original text before moving it into a pending delivery record.
      await agentMessageDrafts.flush();
      if (!agentMessageDrafts.canPrepare(attempt)) return;
      if (!mounted.current || AppState.currentState !== 'active') {
        agentMessageDrafts.cancel(attempt, 'Selection or app state changed. Message was not sent.');
        return;
      }
      if (!agentMessageDrafts.markSending(attempt)) return;
      try {
        // The pending delivery must survive a process kill before remote dispatch.
        await agentMessageDrafts.flush();
      } catch {
        agentMessageDrafts.abortBeforeDispatch(attempt, 'Could not save the pending message.');
        void agentMessageDrafts.flush().catch(() => {});
        return;
      }
      if (!agentMessageDrafts.canDispatch(attempt) ||
        !mounted.current || AppState.currentState !== 'active') {
        agentMessageDrafts.abortBeforeDispatch(attempt, 'Selection or app state changed.');
        void agentMessageDrafts.flush().catch(() => {});
        return;
      }
      try {
        const result = await sendCommand('agent.message', {
          agentId: agent.id,
          body,
          ...(selectedModel ? { model: selectedModel } : {}),
          ...(selectedReasoning ? { reasoningLevel: selectedReasoning } : {}),
        });
        if (!result?.accepted) throw new Error('The machine did not acknowledge this message.');
        agentMessageDrafts.finishSend(attempt);
        void agentMessageDrafts.flush().catch(() => {});
        if (mounted.current) setSendNotice('Message accepted by the machine.');
        if (mounted.current) await loadThread();
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Delivery could not be confirmed.';
        agentMessageDrafts.finishSend(attempt, reason);
        void agentMessageDrafts.flush().catch(() => {});
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not save the message.';
      agentMessageDrafts.cancel(attempt, `${reason} Your draft is still here. Retry saving before sending.`);
    }
  };

  const stopAgent = async () => {
    if (controlInFlight.current) return;
    controlInFlight.current = true;
    setStopping(true);
    setControlError('');
    try {
      const result = await sendCommand('agent.control', { agentId: agent.id, action: 'stop' });
      if (!result?.accepted) throw new Error('The machine did not confirm the stop request.');
    } catch (error) {
      if (mounted.current) setControlError(error instanceof Error ? error.message : 'Unable to confirm stop. Refresh the agent before trying again.');
    } finally {
      controlInFlight.current = false;
      if (mounted.current) setStopping(false);
    }
  };

  const closeSubagent = async () => {
    if (!agent.parentId || controlInFlight.current) return;
    controlInFlight.current = true;
    setClosing(true);
    setControlError('');
    try {
      if (isRunning) {
        const result = await sendCommand('agent.control', { agentId: agent.id, action: 'stop' });
        if (!result?.accepted) throw new Error('The machine did not confirm the stop request.');
      }
      dismissAgent(agent.id);
      if (!embedded) router.back();
    } catch (error) {
      if (mounted.current) setControlError(error instanceof Error ? error.message : 'Unable to close this agent.');
    } finally {
      controlInFlight.current = false;
      if (mounted.current) setClosing(false);
    }
  };

  const content = (
    <View style={[styles.content, embedded && styles.contentEmbedded]}>
      <View style={styles.hero}>
        <View style={styles.statusWrap}>
          <StatusDot status={agent.status} size={10} />
        </View>
        <View style={styles.heroCopy}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>{agent.name}</Text>
            <Text style={styles.role}>{agent.status}</Text>
          </View>
          <Text numberOfLines={1} style={styles.role}>
            {[agent.role, agent.provider, agent.model].filter(Boolean).join(' · ')}
          </Text>
          <Text numberOfLines={2} style={styles.task}>{agent.currentTask ?? 'No active task'}</Text>
        </View>
      </View>

      {isRunning || agent.parentId ? (
        <View style={styles.actionRow}>
          {isRunning ? (
            <ActionButton
              label="Stop"
              icon={CircleStop}
              danger
              loading={stopping}
              disabled={closing}
              onPress={() => void stopAgent()}
              style={styles.flexAction}
            />
          ) : null}
          {agent.parentId ? (
            <ActionButton
              label="Close"
              icon={X}
              loading={closing}
              disabled={stopping}
              onPress={() => void closeSubagent()}
              style={styles.flexAction}
            />
          ) : null}
        </View>
      ) : null}
      {controlError ? <Text accessibilityRole="alert" style={styles.threadError}>{controlError}</Text> : null}

      <View style={styles.messageBlock}>
        <TextInput
          value={message}
          editable={draftsReady}
          onChangeText={(value) => {
            agentMessageDrafts.write(draftKey, value);
            if (sendError) setSendError('');
            if (sendNotice) setSendNotice('');
          }}
          multiline
          accessibilityLabel={`Message ${agent.name}`}
          placeholder={agent.id === 'kory-manager' ? 'Message Kory…' : `Message ${agent.name}…`}
          placeholderTextColor={colors.textMuted}
          style={styles.messageInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Send message to ${agent.name}`}
          accessibilityState={{ disabled: !message.trim() || sending || !draftsReady || !!draftSaveError, busy: sending }}
          disabled={!message.trim() || sending || !draftsReady || !!draftSaveError}
          onPress={() => void sendMessage()}
          style={({ pressed }) => [styles.messageSend, (!message.trim() || sending || !draftsReady || !!draftSaveError) && styles.messageSendDisabled, pressed && message.trim() && !sending ? styles.pressed : null]}
        >
          <Send size={16} color={colors.onAccent} />
        </Pressable>
      </View>
      {sending ? (
        <View style={styles.sendStatus}>
          <Text accessibilityRole="text" style={styles.sendStatusText}>
            {pendingPhase === 'preflight' ? 'Saving message before sending…' : 'Waiting for machine acknowledgement…'}
          </Text>
          {pendingBody ? <Text numberOfLines={2} style={styles.sendStatusPreview}>{pendingBody}</Text> : null}
        </View>
      ) : sendNotice ? <Text accessibilityRole="text" style={styles.sendStatusText}>{sendNotice}</Text> : null}
      {!draftsReady ? (
        <View style={styles.recoveryNotice}>
          <Text accessibilityRole="alert" style={styles.threadError}>
            {draftRecoveryError ? `Saved agent messages could not be loaded: ${draftRecoveryError}` : 'Loading saved agent messages…'}
          </Text>
          {draftRecoveryError ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Retry loading agent messages"
              onPress={() => agentMessageDrafts.retryLoad()} style={styles.recoveryAction}>
              <Text style={styles.recoveryActionText}>Retry recovery</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {draftSaveError ? (
        <View style={styles.recoveryNotice}>
          <Text accessibilityRole="alert" style={styles.threadError}>
            {`Agent drafts could not be saved: ${draftSaveError}`}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry saving agent messages"
            onPress={() => void agentMessageDrafts.flush().catch(() => {})} style={styles.recoveryAction}>
            <Text style={styles.recoveryActionText}>Retry save</Text>
          </Pressable>
        </View>
      ) : null}
      {sendError || deliveryError ? (
        <Text accessibilityRole="alert" style={styles.threadError}>{sendError || deliveryError}</Text>
      ) : null}
      {savedMessages.map((saved) => (
        <View key={saved.id} style={styles.recoveryNotice}>
          <Text accessibilityRole="alert" style={styles.recoveryText}>{saved.message}</Text>
          <Text numberOfLines={3} selectable style={styles.recoveryPreview}>{saved.body}</Text>
          <View style={styles.recoveryButtons}>
            <Pressable accessibilityRole="button"
              accessibilityLabel={`Restore recovered agent message ${saved.id}`}
              onPress={() => agentMessageDrafts.restore(draftKey, saved.id)} style={styles.recoveryAction}>
              <Text style={styles.recoveryActionText}>Restore draft</Text>
            </Pressable>
            <Pressable accessibilityRole="button"
              accessibilityLabel={`Dismiss recovered agent message ${saved.id}`}
              onPress={() => agentMessageDrafts.discardRecovery(draftKey, saved.id)} style={styles.recoveryAction}>
              <Text style={styles.recoveryActionText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {agent.parentId ? (
        <View style={styles.block}>
          <SectionTitle
            title="Transcript"
            detail={threadLoading ? 'Loading' : thread.length ? `${thread.length}` : undefined}
          />
          {threadError ? <Text style={styles.threadError}>{threadError}</Text> : null}
          <View style={styles.threadList}>
            {thread.map((entry) => {
              const author = entry.role === 'manager'
                ? 'Kory'
                : entry.role === 'user'
                  ? 'You'
                  : agent.name;
              return (
                <View
                  key={entry.id}
                  style={[
                    styles.threadEntry,
                    entry.role === 'user' && styles.threadEntryUser,
                  ]}
                >
                  <Text style={styles.threadAuthor}>{author}</Text>
                  <Text selectable style={styles.threadBody}>{entry.content}</Text>
                </View>
              );
            })}
            {!thread.length && !threadLoading && !threadError ? (
              <Text style={styles.threadEmpty}>No messages in this agent thread yet.</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {typeof agent.progress === 'number' ? (
        <View style={styles.block}>
          <View style={styles.progressHeader}>
            <Eyebrow>Current task</Eyebrow>
            <Text style={styles.progressValue}>{Math.round(agent.progress * 100)}%</Text>
          </View>
          <ProgressBar value={agent.progress} />
        </View>
      ) : null}

      <View style={styles.block}>
        <SectionTitle title="Model" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose model for ${agent.name}`}
          onPress={() =>
            router.push(
              managerComposer
                ? '/model'
                : `/model?agentId=${encodeURIComponent(agent.id)}`,
            )
          }
          style={({ pressed }) => [styles.modelCard, pressed && styles.pressed]}
        >
          <Text style={styles.modelName}>{selectedModelEntry?.name || agent.model}</Text>
          <Text style={styles.modelProvider}>
            {[
              selectedModelEntry?.providerLabel || agent.provider,
              selectedReasoning,
            ].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.block}>
        <SectionTitle
          title="Subagents"
          detail={children.length ? `${children.length}` : undefined}
        />
        <View style={styles.children}>
          {children.length ? (
            children.map((child) => (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                accessibilityLabel={`Open agent ${child.name}, ${child.status}`}
                onPress={() => {
                  setSelectedAgentId(child.id);
                  if (!embedded) router.push(`/agent/${child.id}`);
                }}
                style={({ pressed }) => [styles.childRow, pressed && styles.pressed]}
              >
                <StatusDot status={child.status} size={8} />
                <View style={styles.childCopy}>
                  <Text style={styles.childName}>{child.name}</Text>
                  <Text numberOfLines={1} style={styles.childTask}>
                    {child.currentTask || [child.provider, child.model].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={styles.childState}>{child.status}</Text>
              </Pressable>
            ))
          ) : (
            <View style={styles.emptyChildren}>
              <Bot size={20} color={colors.textMuted} />
              <Text style={styles.emptyChildrenText}>No subagents yet</Text>
            </View>
          )}
        </View>
      </View>

      {agent.contextUsed && agent.contextLimit ? (
        <View style={styles.block}>
          <SectionTitle title="Context" detail={`${agent.contextUsed.toLocaleString()} of ${agent.contextLimit.toLocaleString()} tokens`} />
          <ProgressBar value={agent.contextUsed / agent.contextLimit} height={5} />
        </View>
      ) : null}
    </View>
  );

  if (embedded) return content;
  return <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>;
}

const styles = StyleSheet.create({
  scrollContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.huge,
  },
  content: {
    gap: spacing.xl,
  },
  contentEmbedded: {
    padding: spacing.md,
  },
  hero: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  statusWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: '800',
  },
  role: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'capitalize',
  },
  task: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  flexAction: {
    flex: 1,
  },
  messageBlock: {
    minHeight: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  messageInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    color: colors.textPrimary,
    fontSize: typography.sm,
    lineHeight: 19,
    paddingHorizontal: spacing.xs,
    paddingVertical: 9,
  },
  messageSend: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageSendDisabled: { opacity: 0.35 },
  sendStatus: {
    borderRadius: radii.md,
    backgroundColor: colors.surface2,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  sendStatusText: { color: colors.textSecondary, fontSize: typography.sm },
  sendStatusPreview: { color: colors.textPrimary, fontSize: typography.sm },
  recoveryNotice: {
    borderRadius: radii.md,
    backgroundColor: colors.surface2,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  recoveryText: { color: colors.textSecondary, fontSize: typography.xs },
  recoveryPreview: { color: colors.textPrimary, fontSize: typography.sm },
  recoveryButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  recoveryAction: {
    minHeight: 44,
    minWidth: 100,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
  },
  recoveryActionText: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' },
  block: {
    gap: spacing.sm,
  },
  threadList: { gap: spacing.xs },
  threadEntry: {
    alignSelf: 'flex-start',
    maxWidth: '94%',
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  threadEntryUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accentSofter,
  },
  threadAuthor: {
    marginBottom: 3,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  threadBody: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 19,
  },
  threadEmpty: { color: colors.textMuted, fontSize: typography.xs },
  threadError: { color: colors.error, fontSize: typography.xs },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressValue: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontVariant: ['tabular-nums'],
  },
  modelCard: {
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  modelName: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' },
  modelProvider: { marginTop: 2, color: colors.textMuted, fontSize: typography.xs },
  children: {
    gap: spacing.xxs,
  },
  childRow: {
    minHeight: 44,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  childCopy: {
    minWidth: 0,
    flex: 1,
  },
  childName: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  childTask: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  childState: {
    color: colors.textMuted,
    fontSize: typography.xs,
    textTransform: 'capitalize',
  },
  emptyChildren: {
    minHeight: 62,
    borderRadius: radii.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  emptyChildrenText: {
    color: colors.textMuted,
    fontSize: typography.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
