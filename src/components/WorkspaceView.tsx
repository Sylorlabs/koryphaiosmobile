import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  GitBranch,
  ListChecks,
  Plus,
  Send,
  Target,
  X,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { attentionResponseKey } from '../control/attentionResponses';
import { useAttentionResponse } from '../control/useAttentionResponse';
import { breakpoints, colors, radii, spacing, type as typography } from '../theme/tokens';
import type { Agent, FeedEntry, RemoteChangeReview, RemoteQuestion } from '../types/control';
import { AgentDetailView } from './AgentDetailView';
import { MobileWorkspaceView } from './MobileWorkspaceView';
import { ActionButton, AgentGlyph, Eyebrow, ProgressBar, StatusDot } from './ui';
import {
  GoalSteeringBar,
  WorkspaceControlPanel,
  type WorkspaceControlKind,
} from './WorkspaceControls';

function SessionList() {
  const { snapshot, sendCommand, attentionSessionIds } = useControl();
  const project = snapshot.projects.find((item) => item.id === snapshot.activeProjectId);
  const projectSessions = snapshot.sessions.filter(
    (session) => session.projectId === snapshot.activeProjectId,
  );
  const selectProject = (projectId: string) => {
    const sessionId = snapshot.sessions.find((session) => session.projectId === projectId)?.id;
    void sendCommand('project.select', { projectId, sessionId });
  };
  return (
    <View style={styles.sessionPane}>
      <View style={styles.projectHeader}>
        <Eyebrow>Project</Eyebrow>
        <Text numberOfLines={1} style={styles.projectName}>{project?.name ?? 'Workspace'}</Text>
        {project?.branch ? (
          <View style={styles.branchRow}>
            <GitBranch size={12} color={colors.textMuted} />
            <Text numberOfLines={1} style={styles.branchText}>{project.branch}</Text>
          </View>
        ) : null}
        {snapshot.projects.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.projectStrip}
          >
            {snapshot.projects.map((item) => {
              const active = item.id === snapshot.activeProjectId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => selectProject(item.id)}
                  style={({ pressed }) => [
                    styles.projectChip,
                    active && styles.projectChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.projectChipText, active && styles.projectChipTextActive]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
      <View style={styles.sessionHeadingRow}>
        <Eyebrow>Chats</Eyebrow>
        <Pressable
          onPress={() => void sendCommand('session.create', { projectId: snapshot.activeProjectId })}
          style={({ pressed }) => [styles.miniAdd, pressed && styles.pressed]}
          accessibilityLabel="New chat"
        >
          <Plus size={15} color={colors.textMuted} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.sessionList}>
        {projectSessions.map((session) => {
          const active = session.id === snapshot.activeSessionId;
          const needsAttention = attentionSessionIds.includes(session.id);
          return (
            <Pressable
              key={session.id}
              onPress={() => void sendCommand('session.select', { sessionId: session.id })}
              style={({ pressed }) => [styles.sessionRow, active && styles.sessionRowActive, pressed && styles.pressed]}
            >
              <View style={styles.sessionCopy}>
                <Text numberOfLines={2} style={[styles.sessionTitle, active && styles.sessionTitleActive]}>{session.title}</Text>
                <Text style={styles.sessionTime}>{session.updatedAt}</Text>
              </View>
              {needsAttention ? <View style={styles.attentionBadge}><Text style={styles.attentionText}>!</Text></View> : null}
              {session.unread ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>{session.unread}</Text></View> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function MobileNavigator({ onDone }: { onDone: () => void }) {
  const { snapshot, sendCommand, attentionSessionIds } = useControl();
  const projectSessions = snapshot.sessions.filter(
    (session) => session.projectId === snapshot.activeProjectId,
  );
  const selectProject = (projectId: string) => {
    const sessionId = snapshot.sessions.find((session) => session.projectId === projectId)?.id;
    void sendCommand('project.select', { projectId, sessionId });
  };
  const selectSession = (sessionId: string) => {
    onDone();
    void sendCommand('session.select', { sessionId });
  };

  return (
    <View style={styles.mobileNavigator}>
      <View style={styles.mobileNavigatorHeader}>
        <View>
          <Eyebrow>Remote workspace</Eyebrow>
          <Text style={styles.mobileNavigatorTitle}>Projects and chats</Text>
        </View>
        <Pressable
          accessibilityLabel="New chat"
          onPress={() =>
            void sendCommand('session.create', { projectId: snapshot.activeProjectId })
          }
          style={({ pressed }) => [styles.miniAdd, styles.mobileNewChat, pressed && styles.pressed]}
        >
          <Plus size={16} color={colors.accent} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mobileProjectStrip}
      >
        {snapshot.projects.map((project) => {
          const active = project.id === snapshot.activeProjectId;
          return (
            <Pressable
              key={project.id}
              onPress={() => selectProject(project.id)}
              style={({ pressed }) => [
                styles.mobileProjectChip,
                active && styles.mobileProjectChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.mobileProjectText, active && styles.mobileProjectTextActive]}
              >
                {project.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView
        style={styles.mobileChatScroll}
        contentContainerStyle={styles.mobileChatList}
        nestedScrollEnabled
      >
        {projectSessions.map((session) => {
          const active = session.id === snapshot.activeSessionId;
          const needsAttention = attentionSessionIds.includes(session.id);
          return (
            <Pressable
              key={session.id}
              onPress={() => selectSession(session.id)}
              style={({ pressed }) => [
                styles.mobileChatRow,
                active && styles.mobileChatRowActive,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.sessionCopy}>
                <Text
                  numberOfLines={1}
                  style={[styles.sessionTitle, active && styles.sessionTitleActive]}
                >
                  {session.title}
                </Text>
                <Text style={styles.sessionTime}>{session.updatedAt}</Text>
              </View>
              {needsAttention ? <View style={styles.attentionBadge}><Text style={styles.attentionText}>!</Text></View> : active ? <StatusDot status="online" size={6} /> : null}
            </Pressable>
          );
        })}
        {!projectSessions.length ? (
          <Text style={styles.mobileNavigatorEmpty}>No chats in this project yet.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function FeedCard({ entry, agents }: { entry: FeedEntry; agents: Agent[] }) {
  const agent = entry.agentId ? agents.find((candidate) => candidate.id === entry.agentId) : undefined;
  const isUser = entry.kind === 'user';
  const isTool = entry.kind === 'tool';
  return (
    <View style={[styles.feedCard, isUser && styles.feedCardUser, isTool && styles.feedCardTool]}>
      <View style={styles.feedMetaRow}>
        {agent ? <AgentGlyph agent={agent} size={26} /> : null}
        <Text style={styles.feedAuthor}>{entry.author}</Text>
        {entry.meta ? <Text style={styles.feedMeta}>{entry.meta}</Text> : null}
        <Text style={styles.feedTime}>{entry.createdAt}</Text>
      </View>
      <Text style={styles.feedBody}>{entry.body}</Text>
    </View>
  );
}

function CompactAgentStrip() {
  const { snapshot, selectedAgentId, setSelectedAgentId } = useControl();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentStrip}>
      {snapshot.agents.map((agent) => {
        const active = selectedAgentId === agent.id;
        return (
          <Pressable
            key={agent.id}
            onPress={() => setSelectedAgentId(agent.id)}
            style={({ pressed }) => [styles.agentChip, active && styles.agentChipActive, pressed && styles.pressed]}
          >
            <AgentGlyph agent={agent} size={28} />
            <View style={styles.agentChipCopy}>
              <Text numberOfLines={1} style={[styles.agentChipName, active && styles.agentChipNameActive]}>{agent.name}</Text>
              <Text numberOfLines={1} style={styles.agentChipState}>{agent.status}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function QuestionPrompt({ question }: { question: RemoteQuestion }) {
  const { answerQuestion } = useControl();
  const response = useAttentionResponse('question', question);
  const { text: other, setText: setOther } = response;
  const submitOther = () => {
    const text = other.trim();
    if (!text) return;
    void answerQuestion(question.sessionId, text, text, response.key);
  };

  return (
    <View style={styles.actionPrompt}>
      <View style={styles.actionPromptHeader}>
        <CircleHelp size={17} color={colors.accent} />
        <Text style={styles.actionPromptEyebrow}>Koryphaios needs your input</Text>
      </View>
      <Text style={styles.actionPromptTitle}>{question.question}</Text>
      {question.options.length ? (
        <View style={styles.questionOptions}>
          {question.options.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              disabled={response.busy}
              onPress={() => { void answerQuestion(question.sessionId, option, undefined, response.key); }}
              style={({ pressed }) => [styles.questionOption, response.busy && styles.sendDisabled, pressed && styles.pressed]}
            >
              <Text style={styles.questionOptionText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {question.allowOther ? (
        <View style={styles.otherAnswerRow}>
          <TextInput
            value={other}
            onChangeText={setOther}
            accessibilityLabel="Your answer"
            editable={!response.busy}
            placeholder="Type another answer…"
            placeholderTextColor={colors.textMuted}
            style={styles.otherAnswerInput}
            onSubmitEditing={submitOther}
          />
          <Pressable
            accessibilityLabel="Send answer"
            accessibilityRole="button"
            disabled={!other.trim() || response.busy}
            onPress={submitOther}
            style={({ pressed }) => [
              styles.otherAnswerSend,
              (!other.trim() || response.busy) && styles.sendDisabled,
              pressed && other.trim() ? styles.pressed : null,
            ]}
          >
            <Send size={15} color={colors.onAccent} />
          </Pressable>
        </View>
      ) : null}
      {response.message ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole={response.error ? 'alert' : undefined}
          style={[styles.actionPromptHint, response.error && { color: colors.error }]}>
          {response.message}
        </Text>
      ) : null}
      {question.allowKeepChatting ? (
        <Text style={styles.actionPromptHint}>You can keep chatting while this answer is pending.</Text>
      ) : null}
    </View>
  );
}

function ChangeReviewPrompt({ review }: { review: RemoteChangeReview }) {
  const { resolveReview } = useControl();
  const response = useAttentionResponse('review', review);
  const visibleChanges = review.changes.slice(0, 6);
  return (
    <View style={styles.actionPrompt}>
      <View style={styles.actionPromptHeader}>
        <GitBranch size={17} color={colors.accent} />
        <Text style={styles.actionPromptEyebrow}>Review remote changes</Text>
      </View>
      <Text style={styles.actionPromptTitle}>
        Koryphaios finished a change set and is waiting for your decision.
      </Text>
      <View style={styles.changeList}>
        {visibleChanges.map((change) => (
          <View key={`${change.operation}:${change.path}`} style={styles.changeRow}>
            <Text numberOfLines={1} style={styles.changePath}>{change.path}</Text>
            <Text style={styles.changeOperation}>{change.operation}</Text>
            <Text style={styles.changeCount}>+{change.linesAdded} −{change.linesDeleted}</Text>
          </View>
        ))}
        {review.changes.length > visibleChanges.length ? (
          <Text style={styles.actionPromptHint}>+ {review.changes.length - visibleChanges.length} more files</Text>
        ) : null}
      </View>
      {response.message ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole={response.error ? 'alert' : undefined}
          style={[styles.actionPromptHint, response.error && { color: colors.error }]}>
          {response.message}
        </Text>
      ) : null}
      <View style={styles.reviewActions}>
        <ActionButton
          label="Keep changes"
          icon={Check}
          primary
          disabled={response.busy}
          onPress={() => { void resolveReview(review.sessionId, true, response.key); }}
          style={styles.reviewAction}
        />
        <ActionButton
          label="Reject"
          icon={X}
          danger
          disabled={response.busy}
          onPress={() => { void resolveReview(review.sessionId, false, response.key); }}
          style={styles.reviewAction}
        />
      </View>
    </View>
  );
}

function Composer({
  activeControl,
  onControl,
}: {
  activeControl: WorkspaceControlKind | null;
  onControl: (kind: WorkspaceControlKind) => void;
}) {
  return (
    <View style={styles.composerWrap}>
      <View style={styles.composerToolRow}>
        {[
          { kind: 'goals' as const, label: 'Goals', icon: Target },
          { kind: 'checklists' as const, label: 'Checklists', icon: ListChecks },
          { kind: 'git' as const, label: 'Git', icon: GitBranch },
        ].map(({ kind, label, icon: Icon }) => {
          const active = activeControl === kind;
          return (
            <Pressable
              key={kind}
              accessibilityLabel={`Open ${label}`}
              onPress={() => onControl(kind)}
              style={({ pressed }) => [
                styles.composerTool,
                active && styles.composerToolActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon size={14} color={active ? colors.accent : colors.textMuted} strokeWidth={1.9} />
              <Text style={[styles.composerToolText, active && styles.composerToolTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <MobileWorkspaceView composerOnly />
    </View>
  );
}

function WideWorkspaceView() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { snapshot, selectedAgentId, live, pairing } = useControl();
  const scrollRef = useRef<ScrollView>(null);
  const feedAtEnd = useRef(true);
  useLayoutEffect(() => {
    feedAtEnd.current = true;
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [pairing?.baseUrl, pairing?.machineId, snapshot.activeProjectId, snapshot.activeSessionId]);
  const [mobileNavigatorOpen, setMobileNavigatorOpen] = useState(false);
  const [activeControl, setActiveControl] = useState<WorkspaceControlKind | null>(null);
  const selectedAgent = useMemo(
    () => snapshot.agents.find((agent) => agent.id === selectedAgentId) ?? snapshot.agents[0],
    [snapshot.agents, selectedAgentId],
  );
  const showSessions = width >= breakpoints.wide;
  const showInspector = width >= breakpoints.threeColumn;
  const activeSession = snapshot.sessions.find((session) => session.id === snapshot.activeSessionId);
  const activeQuestion = live.questions[snapshot.activeSessionId];
  const activeReview = live.reviews[snapshot.activeSessionId];
  const contextRatio = snapshot.context.limit > 0 ? snapshot.context.used / snapshot.context.limit : 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={styles.columns}>
        {showSessions ? <SessionList /> : null}

        <View style={styles.feedPane}>
          <View style={styles.feedHeader}>
            <View style={styles.feedHeaderCopy}>
              <Text numberOfLines={1} style={styles.feedTitle}>{activeSession?.title ?? 'Workspace'}</Text>
              {pairing && live.connection !== 'connected' ? (
                <View style={styles.realtimeRow}>
                  <StatusDot status="connecting" size={7} />
                  <Text style={styles.realtimeText}>Reconnecting</Text>
                </View>
              ) : null}
            </View>
            {!showSessions ? (
              <Pressable
                accessibilityLabel={mobileNavigatorOpen ? 'Close chats' : 'Open projects and chats'}
                onPress={() => setMobileNavigatorOpen((open) => !open)}
                style={({ pressed }) => [styles.mobileNavigatorToggle, pressed && styles.pressed]}
              >
                {mobileNavigatorOpen ? (
                  <ChevronDown size={19} color={colors.accent} />
                ) : (
                  <ChevronRight size={19} color={colors.textMuted} />
                )}
              </Pressable>
            ) : null}
          </View>

          {!showSessions && mobileNavigatorOpen ? (
            <MobileNavigator onDone={() => setMobileNavigatorOpen(false)} />
          ) : null}

          {!showInspector ? <CompactAgentStrip /> : null}

          <ScrollView
            ref={scrollRef}
            accessibilityLabel="Conversation messages"
            contentContainerStyle={styles.feedList}
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }) => {
              const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
              feedAtEnd.current = contentSize.height - layoutMeasurement.height - contentOffset.y <= 48;
            }}
            onContentSizeChange={() => {
              if (feedAtEnd.current) scrollRef.current?.scrollToEnd({ animated: false });
            }}
          >
            {snapshot.feed.map((entry) => <FeedCard key={entry.id} entry={entry} agents={snapshot.agents} />)}
          </ScrollView>

          <View style={styles.contextBar}>
            <View style={styles.contextCopyRow}>
              <Text style={styles.contextLabel}>Context</Text>
              <Text style={styles.contextValue}>{Math.round(contextRatio * 100)}%</Text>
              <Text style={styles.contextMeta}>{snapshot.context.cached.toLocaleString()} cached</Text>
            </View>
            <ProgressBar value={contextRatio} height={3} />
          </View>
          {activeQuestion ? (
            <QuestionPrompt
              key={activeQuestion.questionId ?? activeQuestion.question}
              question={activeQuestion}
            />
          ) : null}
          {activeReview ? (
            <ChangeReviewPrompt
              key={attentionResponseKey(pairing, 'review', activeReview)}
              review={activeReview}
            />
          ) : null}
          <GoalSteeringBar onOpen={() => setActiveControl('goals')} />
          {activeControl ? (
            <WorkspaceControlPanel
              kind={activeControl}
              onClose={() => setActiveControl(null)}
            />
          ) : null}
          <Composer
            activeControl={activeControl}
            onControl={(kind) => setActiveControl((current) => (current === kind ? null : kind))}
          />
        </View>

        {showInspector && selectedAgent ? (
          <ScrollView style={styles.inspectorPane} contentContainerStyle={styles.inspectorContent}>
            <AgentDetailView agent={selectedAgent} embedded />
          </ScrollView>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

export function WorkspaceView() {
  const { width, height } = useWindowDimensions();
  if (Platform.OS === 'web' && width >= breakpoints.threeColumn && height >= breakpoints.medium) {
    return <WideWorkspaceView />;
  }
  return <MobileWorkspaceView />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  columns: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
  },
  sessionPane: {
    width: 224,
    backgroundColor: colors.surface1,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
  },
  projectHeader: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.md,
  },
  projectStrip: {
    gap: spacing.xxs,
    paddingTop: spacing.sm,
  },
  projectChip: {
    maxWidth: 150,
    minHeight: 28,
    borderRadius: radii.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.surface2,
  },
  projectChipActive: { backgroundColor: colors.accentSoft },
  projectChipText: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  projectChipTextActive: { color: colors.accent },
  projectName: {
    marginTop: spacing.xxs,
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '700',
  },
  branchRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    gap: spacing.xxs,
    alignItems: 'center',
  },
  branchText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontFamily: 'monospace',
  },
  sessionHeadingRow: {
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniAdd: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionList: {
    gap: spacing.xxs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
  },
  sessionRow: {
    minHeight: 58,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionRowActive: {
    backgroundColor: colors.surface3,
  },
  sessionCopy: {
    minWidth: 0,
    flex: 1,
  },
  sessionTitle: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 17,
    fontWeight: '600',
  },
  sessionTitleActive: {
    color: colors.textPrimary,
  },
  sessionTime: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 10,
  },
  unreadBadge: {
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '800',
  },
  attentionBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  attentionText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
  },
  feedPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface1,
  },
  feedHeader: {
    minHeight: 54,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
  },
  mobileNavigatorToggle: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileNavigator: {
    maxHeight: 310,
    backgroundColor: colors.surface2,
    paddingTop: spacing.sm,
  },
  mobileNavigatorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  mobileNavigatorTitle: {
    marginTop: 2,
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '700',
  },
  mobileNewChat: { backgroundColor: colors.accentSoft },
  mobileProjectStrip: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  mobileProjectChip: {
    maxWidth: 180,
    minHeight: 34,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface3,
  },
  mobileProjectChipActive: { backgroundColor: colors.accentSoft },
  mobileProjectText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '600',
  },
  mobileProjectTextActive: { color: colors.accent },
  mobileChatScroll: { maxHeight: 190 },
  mobileChatList: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
    gap: 2,
  },
  mobileChatRow: {
    minHeight: 48,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  mobileChatRowActive: { backgroundColor: colors.surface3 },
  mobileNavigatorEmpty: {
    color: colors.textMuted,
    fontSize: typography.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  feedHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  feedTitle: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '700',
  },
  realtimeRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  realtimeText: {
    color: colors.textMuted,
    fontSize: 10,
  },
  agentStrip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    backgroundColor: colors.surface1,
  },
  agentChip: {
    minWidth: 132,
    maxWidth: 190,
    height: 46,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface2,
  },
  agentChipActive: {
    backgroundColor: colors.accentSoft,
  },
  agentChipCopy: {
    minWidth: 0,
    flex: 1,
  },
  agentChipName: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  agentChipNameActive: {
    color: colors.textPrimary,
  },
  agentChipState: {
    marginTop: 1,
    color: colors.textMuted,
    fontSize: 9,
    textTransform: 'capitalize',
  },
  feedList: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  feedCard: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    padding: spacing.md,
  },
  feedCardUser: {
    backgroundColor: colors.accentSofter,
  },
  feedCardTool: {
    backgroundColor: colors.surface3,
  },
  feedMetaRow: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  feedAuthor: {
    color: colors.textPrimary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  feedMeta: {
    color: colors.textMuted,
    fontSize: 10,
  },
  feedTime: {
    marginLeft: 'auto',
    color: colors.textMuted,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  feedBody: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.base,
    lineHeight: 21,
  },
  contextBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface2,
    gap: 6,
  },
  contextCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  contextLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  contextValue: {
    color: colors.textSecondary,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  contextMeta: {
    marginLeft: 'auto',
    color: colors.textMuted,
    fontSize: 10,
  },
  actionPrompt: {
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.accentSofter,
    gap: spacing.xs,
  },
  actionPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionPromptEyebrow: {
    color: colors.accent,
    fontSize: typography.xs,
    fontWeight: '800',
  },
  actionPromptTitle: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    lineHeight: 19,
    fontWeight: '700',
  },
  actionPromptHint: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
  },
  questionOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  questionOption: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    paddingHorizontal: spacing.sm,
  },
  questionOptionText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  otherAnswerRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    paddingLeft: spacing.sm,
    paddingRight: 4,
  },
  otherAnswerInput: {
    flex: 1,
    minHeight: 38,
    color: colors.textPrimary,
    fontSize: typography.sm,
  },
  otherAnswerSend: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeList: {
    gap: 3,
  },
  changeRow: {
    minHeight: 29,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  changePath: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontFamily: 'monospace',
  },
  changeOperation: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'capitalize',
  },
  changeCount: {
    color: colors.textMuted,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  reviewActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  reviewAction: {
    flex: 1,
  },
  composerWrap: {
    backgroundColor: colors.surface1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  composerToolRow: {
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginBottom: spacing.xs,
  },
  composerTool: {
    minHeight: 28,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  composerToolActive: {
    backgroundColor: colors.accentSoft,
  },
  composerToolText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  composerToolTextActive: {
    color: colors.accent,
  },
  composer: {
    width: '100%',
    maxWidth: 780,
    minHeight: 54,
    maxHeight: 150,
    alignSelf: 'center',
    borderRadius: radii.xl,
    backgroundColor: colors.surface3,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    marginBottom: 2,
  },
  composerInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 126,
    color: colors.textPrimary,
    fontSize: typography.base,
    lineHeight: 20,
    paddingVertical: 9,
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  composerIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendDisabled: {
    opacity: 0.32,
  },
  inspectorPane: {
    width: 316,
    backgroundColor: colors.surface1,
  },
  inspectorContent: {
    paddingBottom: spacing.huge,
  },
  pressed: {
    opacity: 0.7,
  },
});
