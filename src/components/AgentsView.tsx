import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Check, ChevronDown, ChevronRight, MessagesSquare, X } from 'lucide-react-native';
import { router } from 'expo-router';

import { useControl } from '../control/ControlProvider';
import { SettingActionReviewRegistry } from '../control/settingActionReviewRegistry';
import { settingActionReviewStorage } from '../control/settingActionReviewStorage';
import { breakpoints, colors, radii, spacing, type as typography } from '../theme/tokens';
import type { Agent, AgentMessage } from '../types/control';
import { AgentDetailView } from './AgentDetailView';
import { ProgressBar, StatusDot } from './ui';

const AGENT_MESSAGE_STATUSES = new Set<AgentMessage['status']>([
  'queued', 'pending_approval', 'delivered', 'answered', 'declined', 'failed',
]);

// One registry per app process: a screen may unmount while the Keychain save
// for an approval is still pending. A newly mounted screen must immediately
// see the in-memory reservation even before that asynchronous write settles.
const agentMessageReviewRegistry = new SettingActionReviewRegistry(settingActionReviewStorage);

function AgentRow({ agent, active, onPress }: { agent: Agent; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open agent ${agent.name}, ${agent.status}`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.agentRow, active && styles.agentRowActive, pressed && styles.pressed]}
    >
      <StatusDot status={agent.status} size={9} />
      <View style={styles.agentRowCopy}>
        <View style={styles.agentNameRow}>
          <Text numberOfLines={1} style={styles.agentName}>{agent.name}</Text>
          <Text numberOfLines={1} style={styles.agentRole}>{agent.role}</Text>
        </View>
        <Text numberOfLines={1} style={styles.agentTask}>
          {agent.currentTask || [agent.provider, agent.model].filter(Boolean).join(' · ')}
        </Text>
        {typeof agent.progress === 'number' ? <ProgressBar value={agent.progress} height={3} /> : null}
      </View>
      {agent.unread ? <View style={styles.unread}><Text style={styles.unreadText}>{agent.unread}</Text></View> : null}
      <ChevronRight size={17} color={colors.textMuted} />
    </Pressable>
  );
}

function AgentMessagesPanel() {
  const { snapshot, pairing, inspect, sendCommand } = useControl();
  const scope = JSON.stringify([
    pairing?.baseUrl ?? '', pairing?.machineId ?? snapshot.machine.id,
    snapshot.activeProjectId, snapshot.activeSessionId,
  ]);
  const currentScope = useRef(scope);
  const loadSequence = useRef(0);
  const inFlightDecision = useRef(false);
  const reviewRegistry = agentMessageReviewRegistry;
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ scope: string; items: AgentMessage[] }>({ scope, items: [] });
  const messages = loaded.scope === scope ? loaded.items : [];
  const [deciding, setDeciding] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [decisionReviews, setDecisionReviews] = useState<Record<string, 'ready' | 'locked' | 'error'>>({});
  const [reviewedPending, setReviewedPending] = useState('');
  const reviewKey = useCallback((messageId: string) => JSON.stringify(['agent-mail-decision', scope, messageId]), [scope]);
  const setReviewState = useCallback((messageId: string, state: 'ready' | 'locked' | 'error') => {
    if (currentScope.current !== scope) return;
    setDecisionReviews((previous) => previous[messageId] === state
      ? previous : { ...previous, [messageId]: state });
  }, [scope]);

  useEffect(() => {
    currentScope.current = scope;
    return () => { currentScope.current = ''; };
  }, [scope]);

  const load = useCallback(async (requireReadback = false): Promise<AgentMessage[] | null> => {
    const sequence = ++loadSequence.current;
    const current = () => currentScope.current === scope && loadSequence.current === sequence;
    if (!snapshot.activeSessionId) {
      setLoaded({ scope, items: [] });
      return [];
    }
    try {
      const items = await inspect<AgentMessage[]>('agent.messages', { sessionId: snapshot.activeSessionId });
      if (!Array.isArray(items) || items.some((message) =>
        !message || typeof message.id !== 'string' || !message.id ||
        !AGENT_MESSAGE_STATUSES.has(message.status))) {
        throw new Error('The desktop returned an invalid agent mailbox.');
      }
      if (current()) {
        // A response can be lost after the desktop approves a message. Read
        // the durable lock before enabling any approval, and only release it
        // after the actual message reports a non-pending desktop status.
        await Promise.all(items.map(async (message) => {
          try {
            const key = reviewKey(message.id);
            const saved = await reviewRegistry.load(key);
            if (!current()) return;
            if (saved && message.status !== 'pending_approval') {
              await reviewRegistry.release(key, saved);
            }
            if (current()) setReviewState(message.id, reviewRegistry.get(key) ? 'locked' : 'ready');
          } catch {
            if (current()) setReviewState(message.id, 'error');
          }
        }));
      }
      if (current()) {
        setLoaded({ scope, items });
      }
      if (requireReadback && !current()) throw new Error('The mailbox changed while verifying this decision.');
      return items;
    } catch (error) {
      if (requireReadback) throw error;
      // Keep the panel unobtrusive if an older host does not expose AgentMail yet.
      return null;
    }
  }, [inspect, scope, snapshot.activeSessionId, reviewKey, reviewRegistry, setReviewState]);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);

  const decide = async (messageId: string, approved: boolean) => {
    if (inFlightDecision.current) return;
    inFlightDecision.current = true;
    setDeciding(messageId);
    setDecisionError('');
    setReviewedPending('');
    try {
      const key = reviewKey(messageId);
      const saved = await reviewRegistry.load(key);
      if (saved) {
        setReviewState(messageId, 'locked');
        setDecisionError('This decision may already have reached the desktop. Check the desktop status before retrying.');
        return;
      }
      const reservation = reviewRegistry.reserve(key, `Agent message ${messageId}`);
      if (!reservation) return;
      setReviewState(messageId, 'locked');
      // This must complete before dispatch so remount, crash and delayed
      // acknowledgements cannot silently repeat an approval or rejection.
      await reviewRegistry.persist(key, reservation);
      // The list displayed on screen may be several seconds old. Confirm the
      // exact message still requires approval immediately before dispatch.
      const before = await load(true);
      if (before?.find((message) => message.id === messageId)?.status !== 'pending_approval') {
        throw new Error('The desktop no longer confirms this message is awaiting approval.');
      }
      if (currentScope.current !== scope) throw new Error('The selected desktop changed.');
      const result = await sendCommand('agent.message_decide', { messageId, approved });
      if (!result?.accepted) throw new Error('The machine did not confirm your decision.');
      const items = await load(true);
      const actual = items?.find((message) => message.id === messageId);
      if (!actual || actual.status === 'pending_approval') {
        setDecisionError('Desktop approval is not yet verified. Check the desktop before requesting another decision.');
      }
    } catch (error) {
      if (currentScope.current === scope) {
        setDecisionError(`${error instanceof Error ? error.message : 'Decision could not be confirmed.'} Check the desktop before retrying.`);
      }
    } finally {
      inFlightDecision.current = false;
      if (currentScope.current === scope) setDeciding('');
    }
  };

  const reviewDecision = async (messageId: string) => {
    if (inFlightDecision.current) return;
    inFlightDecision.current = true;
    setDeciding(messageId);
    setDecisionError('');
    setReviewedPending('');
    try {
      const items = await load(true);
      if (currentScope.current !== scope) return;
      const actual = items?.find((message) => message.id === messageId);
      if (!actual) {
        setDecisionError('The desktop did not return this message. Review it on the desktop before retrying.');
      } else if (actual.status === 'pending_approval') {
        setReviewedPending(messageId);
        setDecisionError('The desktop still shows this approval as pending. Check it there before allowing another decision.');
      } else {
        setDecisionError('');
      }
    } catch (error) {
      if (currentScope.current === scope) {
        setDecisionError(`${error instanceof Error ? error.message : 'Could not refresh desktop approval status.'} The decision remains locked.`);
      }
    } finally {
      inFlightDecision.current = false;
      if (currentScope.current === scope) setDeciding('');
    }
  };

  const allowRetry = async (messageId: string) => {
    if (inFlightDecision.current || reviewedPending !== messageId) return;
    inFlightDecision.current = true;
    setDeciding(messageId);
    try {
      // A fresh authoritative pending status plus a deliberate user action is
      // required. A late host reply is still possible, so never auto-unlock.
      const items = await load(true);
      if (currentScope.current !== scope) return;
      if (items?.find((message) => message.id === messageId)?.status !== 'pending_approval') {
        setDecisionError('Desktop status changed. Review the message again.');
        return;
      }
      const key = reviewKey(messageId);
      const record = await reviewRegistry.load(key);
      if (record) await reviewRegistry.release(key, record);
      setReviewState(messageId, 'ready');
      setDecisionError('');
    } catch (error) {
      if (currentScope.current === scope) {
        setDecisionError(`${error instanceof Error ? error.message : 'Unable to release saved review.'} The decision remains locked.`);
      }
    } finally {
      inFlightDecision.current = false;
      if (currentScope.current === scope) {
        setDeciding('');
        setReviewedPending('');
      }
    }
  };

  const pending = messages.filter((message) => message.status === 'pending_approval').length;
  if (!messages.length && !pending) return null;

  return (
    <View style={styles.mailPanel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agent messages"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.mailHeader, pressed && styles.pressed]}
      >
        {open
          ? <ChevronDown size={15} color={colors.textMuted} />
          : <ChevronRight size={15} color={colors.textMuted} />}
        <MessagesSquare size={16} color={pending ? colors.warning : colors.accent} />
        <Text style={styles.mailTitle}>Agent messages</Text>
        {pending ? <Text style={styles.mailPending}>{pending} approval{pending === 1 ? '' : 's'}</Text> : null}
        <Text style={styles.mailCount}>{messages.length}</Text>
      </Pressable>
      {deciding ? (
        <Text accessibilityLiveRegion="polite" style={styles.mailPendingNotice}>
          Checking the desktop before updating this message…
        </Text>
      ) : null}
      {decisionError ? <Text accessibilityRole="alert" style={styles.mailError}>{decisionError}</Text> : null}
      {open ? (
        <View style={styles.mailList}>
          {messages.map((message) => {
            const outgoing = message.fromSessionId === snapshot.activeSessionId;
            const party = outgoing ? message.toLabel : message.fromLabel;
            return (
              <View key={message.id} style={styles.mailEntry}>
                <View style={styles.mailMetaRow}>
                  <Text numberOfLines={1} style={styles.mailMeta}>{outgoing ? `To ${party}` : `From ${party}`}</Text>
                  <Text style={[styles.mailStatus, message.status === 'pending_approval' && styles.mailStatusPending]}>
                    {message.status.replace('_', ' ')}
                  </Text>
                </View>
                <Text style={styles.mailSubject}>{message.subject}</Text>
                <Text selectable style={styles.mailBody}>{message.body}</Text>
                {message.reply ? <Text selectable style={styles.mailReply}>Reply: {message.reply}</Text> : null}
                {message.status === 'pending_approval' ? (
                  <>
                  <View style={styles.mailActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Approve agent message ${message.subject}`}
                      accessibilityState={{ disabled: Boolean(deciding) || decisionReviews[message.id] !== 'ready', busy: deciding === message.id }}
                      disabled={Boolean(deciding) || decisionReviews[message.id] !== 'ready'}
                      onPress={() => void decide(message.id, true)}
                      style={({ pressed }) => [styles.mailDecision, pressed && styles.pressed]}
                    >
                      <Check size={13} color={colors.success} />
                      <Text style={[styles.mailDecisionText, { color: colors.success }]}>Approve</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Decline agent message ${message.subject}`}
                      accessibilityState={{ disabled: Boolean(deciding) || decisionReviews[message.id] !== 'ready', busy: deciding === message.id }}
                      disabled={Boolean(deciding) || decisionReviews[message.id] !== 'ready'}
                      onPress={() => void decide(message.id, false)}
                      style={({ pressed }) => [styles.mailDecision, pressed && styles.pressed]}
                    >
                      <X size={13} color={colors.error} />
                      <Text style={[styles.mailDecisionText, { color: colors.error }]}>Decline</Text>
                    </Pressable>
                  </View>
                  {decisionReviews[message.id] === 'locked' || decisionReviews[message.id] === 'error' ? (
                    <View style={styles.mailReview}>
                      <Text style={styles.mailError}>Check the desktop before making another decision. A previous request may have been applied.</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Review agent message ${message.subject} status`}
                        accessibilityState={{ disabled: Boolean(deciding), busy: deciding === message.id }}
                        disabled={Boolean(deciding)}
                        onPress={() => void reviewDecision(message.id)}
                        style={({ pressed }) => [styles.mailDecision, pressed && styles.pressed]}
                      ><Text style={styles.mailDecisionText}>Review status</Text></Pressable>
                      {reviewedPending === message.id ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Allow agent message ${message.subject} decision retry after desktop review`}
                          accessibilityState={{ disabled: Boolean(deciding), busy: deciding === message.id }}
                          disabled={Boolean(deciding)}
                          onPress={() => void allowRetry(message.id)}
                          style={({ pressed }) => [styles.mailDecision, pressed && styles.pressed]}
                        ><Text style={styles.mailDecisionText}>I checked desktop · Allow retry</Text></Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  </>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function AgentsView() {
  const { width, height } = useWindowDimensions();
  const { snapshot, pairing, selectedAgentId, setSelectedAgentId, dismissedAgentIds } = useControl();
  const mailScope = JSON.stringify([
    pairing?.baseUrl ?? '', pairing?.machineId ?? snapshot.machine.id,
    snapshot.activeProjectId, snapshot.activeSessionId,
  ]);
  const split = width >= breakpoints.threeColumn && height >= breakpoints.medium;
  const visibleAgents = snapshot.agents.filter((agent) => !dismissedAgentIds.has(agent.id));
  const selected = visibleAgents.find((agent) => agent.id === selectedAgentId) ?? visibleAgents[0];
  const roots = visibleAgents.filter((agent) => !agent.parentId);
  const subagents = visibleAgents.filter((agent) => agent.parentId);

  const openAgent = (id: string) => {
    setSelectedAgentId(id);
    if (!split) router.push(`/agent/${id}`);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.listPane, !split && styles.listPaneSingle, split && styles.listPaneSplit]}>
        <ScrollView contentContainerStyle={styles.agentList}>
          <AgentMessagesPanel key={mailScope} />
          {roots.map((agent) => (
            <AgentRow key={agent.id} agent={agent} active={agent.id === selectedAgentId} onPress={() => openAgent(agent.id)} />
          ))}

          {subagents.length ? <Text style={styles.subagentLabel}>Subagents</Text> : null}
          {subagents.map((agent) => (
            <View key={agent.id} style={styles.subagentWrap}>
              <View style={styles.subagentRowWrap}>
                <AgentRow agent={agent} active={agent.id === selectedAgentId} onPress={() => openAgent(agent.id)} />
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {split && selected ? (
        <View style={styles.detailPane}>
          <AgentDetailView agent={selected} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: colors.surface1,
  },
  listPane: {
    flex: 1,
    minWidth: 0,
  },
  listPaneSingle: {
    maxWidth: 760,
  },
  listPaneSplit: {
    width: 390,
    flex: 0,
  },
  agentList: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.huge,
    gap: spacing.xxs,
  },
  mailPanel: {
    marginBottom: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  mailHeader: {
    minHeight: 46,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  mailTitle: { flex: 1, color: colors.textPrimary, fontSize: typography.xs, fontWeight: '700' },
  mailPending: { color: colors.warning, fontSize: 10, fontWeight: '700' },
  mailCount: { color: colors.textMuted, fontSize: 10 },
  mailError: { color: colors.error, paddingHorizontal: spacing.sm, paddingBottom: spacing.xs, fontSize: typography.xs },
  mailPendingNotice: { color: colors.textSecondary, paddingHorizontal: spacing.sm, paddingBottom: spacing.xs, fontSize: typography.xs },
  mailReview: { gap: spacing.xs, paddingVertical: spacing.xs },
  mailList: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  mailEntry: {
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 4,
  },
  mailMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  mailMeta: { flex: 1, color: colors.textMuted, fontSize: 10 },
  mailStatus: { color: colors.textMuted, fontSize: 10, textTransform: 'capitalize' },
  mailStatusPending: { color: colors.warning },
  mailSubject: { color: colors.textPrimary, fontSize: typography.xs, fontWeight: '700' },
  mailBody: { color: colors.textSecondary, fontSize: typography.xs, lineHeight: 17 },
  mailReply: { color: colors.textPrimary, fontSize: typography.xs, lineHeight: 17 },
  mailActions: { flexDirection: 'row', gap: spacing.xs, marginTop: 4 },
  mailDecision: {
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface3,
  },
  mailDecisionText: { fontSize: 10, fontWeight: '700' },
  agentRow: {
    minHeight: 50,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  agentRowActive: {
    backgroundColor: colors.surface3,
  },
  agentRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  agentNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  agentName: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
    flexShrink: 1,
  },
  agentRole: {
    color: colors.textMuted,
    fontSize: 9,
    maxWidth: '42%',
  },
  agentTask: {
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '800',
  },
  subagentLabel: {
    marginTop: spacing.md,
    marginBottom: 2,
    marginLeft: spacing.sm,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  subagentWrap: {
    minHeight: 50,
    paddingLeft: spacing.xs,
  },
  subagentRowWrap: {
    flex: 1,
  },
  detailPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface0,
  },
  pressed: {
    opacity: 0.7,
  },
});
