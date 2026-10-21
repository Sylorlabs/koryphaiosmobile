import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Circle,
  CirclePause,
  CirclePlay,
  GitBranch,
  ListChecks,
  Merge,
  Plus,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Target,
  Trash2,
  X,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type {
  ChatGitDetails,
  ChatGitState,
  ChatPullRequest,
  GitInspection,
  GoalScope,
  RemoteChecklist,
  RemoteGoal,
} from '../types/control';
import { ActionButton, Eyebrow, ProgressBar } from './ui';
import { useReviewedWorkspaceCreate } from './useReviewedWorkspaceCreate';
import { useReviewedWorkspaceDelete } from './useReviewedWorkspaceDelete';

export type WorkspaceControlKind = 'goals' | 'checklists' | 'git';

const activeGoal = (goal: RemoteGoal) => !['completed', 'cancelled'].includes(goal.status);

function goalProgress(goal: RemoteGoal): number {
  if (!goal.checklist.length) return 0;
  return goal.checklist.filter((item) => item.status === 'completed').length / goal.checklist.length;
}

function scopeLabel(scope: GoalScope): string {
  return scope === 'session' ? 'Chat' : scope === 'project' ? 'Project' : 'Workspace';
}

function ScopePicker({ value, onChange }: { value: GoalScope; onChange: (scope: GoalScope) => void }) {
  return (
    <View style={styles.scopeRow}>
      {(['session', 'project', 'workspace'] as GoalScope[]).map((scope) => (
        <Pressable
          key={scope}
          accessibilityRole="button"
          accessibilityLabel={`${scopeLabel(scope)} scope`}
          accessibilityState={{ selected: value === scope }}
          onPress={() => onChange(scope)}
          style={({ pressed }) => [
            styles.scopeChip,
            value === scope && styles.scopeChipActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.scopeChipText, value === scope && styles.scopeChipTextActive]}>
            {scopeLabel(scope)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function GoalSteeringBar({ onOpen }: { onOpen: () => void }) {
  const { snapshot, sendCommand } = useControl();
  const goal = useMemo(() => {
    const candidates = snapshot.goals.filter(activeGoal);
    return (
      candidates.find((item) => item.execution?.sessionId === snapshot.activeSessionId) ??
      candidates.find((item) => item.scope === 'session' && item.sessionId === snapshot.activeSessionId) ??
      candidates.find((item) => item.scope === 'project' && item.projectPath === snapshot.activeProjectId) ??
      candidates.find((item) => item.scope === 'workspace')
    );
  }, [snapshot.activeProjectId, snapshot.activeSessionId, snapshot.goals]);

  if (!goal) return null;
  const progress = goalProgress(goal);
  const manager = snapshot.agents.find((agent) => agent.id === 'kory-manager') ?? snapshot.agents[0];
  const lifecycleAction =
    goal.status === 'running'
      ? 'pause'
      : goal.status === 'paused' || goal.status === 'blocked'
        ? 'resume'
        : 'drive';

  return (
    <View style={styles.goalBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open goal: ${goal.objective}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.goalBarMain, pressed && styles.pressed]}
      >
        <View style={styles.goalGlyph}>
          <Target size={16} color={colors.accent} strokeWidth={1.9} />
        </View>
        <View style={styles.goalBarCopy}>
          <View style={styles.goalBarMeta}>
            <Text style={styles.goalBarStatus}>{goal.status}</Text>
            <Text style={styles.goalBarProgress}>{Math.round(progress * 100)}%</Text>
          </View>
          <Text numberOfLines={1} style={styles.goalBarTitle}>{goal.objective}</Text>
          <ProgressBar value={progress} height={2} />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={lifecycleAction === 'pause' ? 'Pause goal' : lifecycleAction === 'resume' ? 'Resume goal' : 'Run goal'}
        onPress={() =>
          void sendCommand('goal.control', {
            goalId: goal.id,
            action: lifecycleAction,
            provider: manager?.provider,
            model: manager?.model,
          })
        }
        style={({ pressed }) => [styles.goalBarAction, pressed && styles.pressed]}
      >
        {lifecycleAction === 'pause' ? (
          <CirclePause size={18} color={colors.textSecondary} />
        ) : (
          <CirclePlay size={18} color={colors.accent} />
        )}
      </Pressable>
    </View>
  );
}

// Typed sub-item drafts belong to an exact machine/chat and item. Switching
// hosts must neither copy them onto a different item nor silently lose them.
const goalCheckDrafts = new Map<string, string>();
const checklistTitleDrafts = new Map<string, string>();
const checklistItemDrafts = new Map<string, string>();

function GoalsPanel({ contextKey }: { contextKey: string }) {
  const { snapshot, pairing, sendCommand } = useControl();
  const creation = useReviewedWorkspaceCreate({ kind: 'goal', snapshot, sendCommand });
  const deletion = useReviewedWorkspaceDelete({ kind: 'goal', snapshot, pairing, sendCommand });
  const [expandedId, setExpandedId] = useState('');
  const [, updateCheckDraft] = useState(0);
  const draftKey = (goalId: string) => `${contextKey}\u0000${goalId}`;
  const checkDraft = (goalId: string) => goalCheckDrafts.get(draftKey(goalId)) ?? '';
  const setCheckDraft = (goalId: string, value: string) => {
    goalCheckDrafts.set(draftKey(goalId), value);
    updateCheckDraft((revision) => revision + 1);
  };
  const manager = snapshot.agents.find((agent) => agent.id === 'kory-manager') ?? snapshot.agents[0];
  const visible = snapshot.goals
    .filter(
      (goal) =>
        goal.scope === 'workspace' ||
        (goal.scope === 'project' && goal.projectPath === snapshot.activeProjectId) ||
        (goal.scope === 'session' && goal.sessionId === snapshot.activeSessionId) ||
        goal.execution?.sessionId === snapshot.activeSessionId,
    )
    .sort((left, right) => Number(activeGoal(right)) - Number(activeGoal(left)) || right.priority - left.priority);

  const addCheck = (goal: RemoteGoal) => {
    const title = checkDraft(goal.id).trim();
    if (!title) return;
    setCheckDraft(goal.id, '');
    void sendCommand('goal.checklist.update', {
      goalId: goal.id,
      items: [
        ...goal.checklist.map((item, index) => ({
          id: item.id,
          title: item.title,
          order: index,
          dependsOn: item.dependsOn,
        })),
        { title, order: goal.checklist.length, dependsOn: [] },
      ],
    });
  };

  const removeCheck = (goal: RemoteGoal, itemId: string) =>
    void sendCommand('goal.checklist.update', {
      goalId: goal.id,
      items: goal.checklist
        .filter((item) => item.id !== itemId)
        .map((item, index) => ({
          id: item.id,
          title: item.title,
          order: index,
          dependsOn: item.dependsOn.filter((dependency) => dependency !== itemId),
        })),
    });

  return (
    <View style={styles.panelBody}>
      <View style={styles.createBlock}>
        <TextInput
          value={creation.draft}
          onChangeText={creation.onChangeDraft}
          placeholder="New goal objective"
          accessibilityLabel="New goal objective"
          placeholderTextColor={colors.textMuted}
          multiline
          style={styles.textInput}
        />
        <View style={styles.createFooter}>
          <ScopePicker value={creation.scope} onChange={creation.setScope} />
          <ActionButton label="Create" icon={Plus} primary loading={creation.busy} disabled={!creation.canCreate} onPress={() => void creation.create()} />
        </View>
        {creation.notice ? <Text accessibilityRole="text" style={styles.creationNotice}>{creation.notice}</Text> : null}
        {creation.canReview ? (
          <ActionButton
            label="Reviewed desktop — allow another"
            onPress={() => void creation.reviewedDesktop()}
          />
        ) : null}
      </View>
      {deletion.notice ? <Text accessibilityRole="text" style={styles.creationNotice}>{deletion.notice}</Text> : null}
      {deletion.canReview ? (
        <ActionButton label="Reviewed desktop — allow deletes" onPress={() => void deletion.reviewedDesktop()} />
      ) : null}

      {visible.map((goal) => {
        const expanded = expandedId === goal.id;
        const progress = goalProgress(goal);
        const lifecycleAction =
          goal.status === 'running'
            ? 'pause'
            : goal.status === 'paused' || goal.status === 'blocked'
              ? 'resume'
              : 'drive';
        const terminal = ['completed', 'cancelled'].includes(goal.status);
        return (
          <View key={goal.id} style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} goal: ${goal.objective}`}
              accessibilityState={{ expanded }}
              onPress={() => setExpandedId(expanded ? '' : goal.id)}
              style={styles.cardHeader}
            >
              <View style={styles.cardHeaderCopy}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaAccent}>{goal.status}</Text>
                  <Text style={styles.metaMuted}>{scopeLabel(goal.scope)}</Text>
                  <Text style={styles.metaMuted}>{Math.round(progress * 100)}%</Text>
                </View>
                <Text style={styles.cardTitle}>{goal.objective}</Text>
              </View>
              <Target size={17} color={expanded ? colors.accent : colors.textMuted} />
            </Pressable>
            <ProgressBar value={progress} height={2} />
            <View style={styles.actionRow}>
              {!terminal ? (
                <ActionButton
                  label={lifecycleAction === 'pause' ? 'Pause' : lifecycleAction === 'resume' ? 'Resume' : 'Run'}
                  icon={lifecycleAction === 'pause' ? CirclePause : CirclePlay}
                  onPress={() =>
                    void sendCommand('goal.control', {
                      goalId: goal.id,
                      action: lifecycleAction,
                      provider: manager?.provider,
                      model: manager?.model,
                    })
                  }
                />
              ) : null}
              {!terminal ? (
                <ActionButton
                  label="Stop"
                  danger
                  onPress={() => void sendCommand('goal.control', { goalId: goal.id, action: 'stop' })}
                />
              ) : null}
              <ActionButton
                label={deletion.armedId === goal.id ? 'Confirm delete' : 'Delete'}
                icon={Trash2}
                danger
                disabled={!deletion.canDelete}
                onPress={() => void deletion.deleteItem(goal.id, goal.objective)}
              />
            </View>

            {expanded ? (
              <View style={styles.detailBlock}>
                {goal.blocker ? <Text style={styles.errorText}>{goal.blocker}</Text> : null}
                {goal.checklist.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    {item.status === 'completed' ? (
                      <CheckCircle2 size={16} color={colors.success} />
                    ) : item.status === 'running' ? (
                      <CirclePlay size={16} color={colors.accent} />
                    ) : (
                      <Circle size={16} color={item.status === 'blocked' ? colors.error : colors.textMuted} />
                    )}
                    <Text style={styles.itemText}>{item.title}</Text>
                    {!terminal && item.status !== 'running' ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove goal check: ${item.title}`}
                        onPress={() => removeCheck(goal, item.id)}
                        style={styles.inlineIcon}
                      >
                        <Trash2 size={14} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {!terminal ? (
                  <View style={styles.inlineInputRow}>
                    <TextInput
                      value={checkDraft(goal.id)}
                      onChangeText={(value) => setCheckDraft(goal.id, value)}
                      placeholder="Add a check"
                      placeholderTextColor={colors.textMuted}
                      style={styles.inlineInput}
                    />
                    <ActionButton label="Add" icon={Plus} disabled={!checkDraft(goal.id).trim()} onPress={() => addCheck(goal)} />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {!visible.length ? <Text style={styles.empty}>No goals in this context.</Text> : null}
    </View>
  );
}

function ChecklistCard({ checklist, contextKey, deletion }: {
  checklist: RemoteChecklist;
  contextKey: string;
  deletion: ReturnType<typeof useReviewedWorkspaceDelete>;
}) {
  const { sendCommand } = useControl();
  const draftKey = `${contextKey}\u0000${checklist.id}`;
  const [title, setTitle] = useState(() => checklistTitleDrafts.get(draftKey) ?? checklist.title);
  const [draft, setDraft] = useState(() => checklistItemDrafts.get(draftKey) ?? '');
  const setScopedTitle = (value: string) => {
    checklistTitleDrafts.set(draftKey, value);
    setTitle(value);
  };
  const setScopedDraft = (value: string) => {
    checklistItemDrafts.set(draftKey, value);
    setDraft(value);
  };
  const done = checklist.items.filter((item) => item.status === 'done' || item.status === 'skipped').length;
  const progress = checklist.items.length ? done / checklist.items.length : 0;

  return (
    <View style={styles.card}>
      <View style={styles.inlineInputRow}>
        <TextInput value={title} onChangeText={setScopedTitle} style={styles.inlineInput} />
        <ActionButton
          label="Save"
          icon={Check}
          disabled={!title.trim() || title.trim() === checklist.title}
          onPress={() => void sendCommand('checklist.update', { checklistId: checklist.id, title: title.trim() })}
        />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaMuted}>{scopeLabel(checklist.scope)}</Text>
        <Text style={styles.metaMuted}>{done}/{checklist.items.length} done</Text>
        {checklist.archivedAt ? <Text style={styles.metaAccent}>archived</Text> : null}
      </View>
      <ProgressBar value={progress} height={2} />
      <View style={styles.detailBlock}>
        {checklist.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mark ${item.title} ${item.status === 'done' ? 'not done' : 'done'}`}
              onPress={() =>
                void sendCommand('checklist.item_status', {
                  checklistId: checklist.id,
                  itemId: item.id,
                  status: item.status === 'done' ? 'pending' : 'done',
                })
              }
              style={styles.inlineIcon}
            >
              {item.status === 'done' ? (
                <CheckCircle2 size={17} color={colors.success} />
              ) : (
                <Circle size={17} color={item.status === 'skipped' ? colors.textMuted : colors.textSecondary} />
              )}
            </Pressable>
            <Text style={[styles.itemText, item.status === 'skipped' && styles.itemSkipped]}>{item.title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.status === 'skipped' ? 'Unskip' : 'Skip'} ${item.title}`}
              onPress={() =>
                void sendCommand('checklist.item_status', {
                  checklistId: checklist.id,
                  itemId: item.id,
                  status: item.status === 'skipped' ? 'pending' : 'skipped',
                })
              }
              style={styles.inlineIcon}
            >
              <SkipForward size={14} color={colors.textMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove checklist item: ${item.title}`}
              onPress={() =>
                void sendCommand('checklist.replace_items', {
                  checklistId: checklist.id,
                  items: checklist.items
                    .filter((candidate) => candidate.id !== item.id)
                    .map((candidate, index) => ({
                      id: candidate.id,
                      title: candidate.title,
                      order: index,
                    })),
                })
              }
              style={styles.inlineIcon}
            >
              <Trash2 size={14} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
        {!checklist.archivedAt ? (
          <View style={styles.inlineInputRow}>
            <TextInput
              value={draft}
              onChangeText={setScopedDraft}
              placeholder="Add an item"
              placeholderTextColor={colors.textMuted}
              style={styles.inlineInput}
            />
            <ActionButton
              label="Add"
              icon={Plus}
              disabled={!draft.trim()}
              onPress={() => {
                const item = draft.trim();
                if (!item) return;
                setScopedDraft('');
                void sendCommand('checklist.add_items', { checklistId: checklist.id, items: [item] });
              }}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.actionRow}>
        <ActionButton
          label={checklist.archivedAt ? 'Restore' : 'Archive'}
          icon={checklist.archivedAt ? RotateCcw : Archive}
          onPress={() =>
            void sendCommand('checklist.update', {
              checklistId: checklist.id,
              archived: !checklist.archivedAt,
            })
          }
        />
        <ActionButton
          label={deletion.armedId === checklist.id ? 'Confirm delete' : 'Delete'}
          icon={Trash2}
          danger
          disabled={!deletion.canDelete}
          onPress={() => void deletion.deleteItem(checklist.id, checklist.title)}
        />
      </View>
    </View>
  );
}

function ChecklistsPanel({ contextKey }: { contextKey: string }) {
  const { snapshot, pairing, sendCommand } = useControl();
  const creation = useReviewedWorkspaceCreate({ kind: 'checklist', snapshot, sendCommand });
  const deletion = useReviewedWorkspaceDelete({ kind: 'checklist', snapshot, pairing, sendCommand });
  const visible = snapshot.checklists
    .filter(
      (checklist) =>
        checklist.scope === 'workspace' ||
        (checklist.scope === 'project' && checklist.projectPath === snapshot.activeProjectId) ||
        (checklist.scope === 'session' && checklist.sessionId === snapshot.activeSessionId),
    )
    .sort((left, right) => Number(Boolean(left.archivedAt)) - Number(Boolean(right.archivedAt)) || right.updatedAt - left.updatedAt);

  return (
    <View style={styles.panelBody}>
      <View style={styles.createBlock}>
        <TextInput
          value={creation.draft}
          onChangeText={creation.onChangeDraft}
          placeholder="Checklist title"
          accessibilityLabel="Checklist title"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
        />
        <View style={styles.createFooter}>
          <ScopePicker value={creation.scope} onChange={creation.setScope} />
          <ActionButton
            label="Create"
            icon={Plus}
            primary
            loading={creation.busy}
            disabled={!creation.canCreate}
            onPress={() => void creation.create()}
          />
        </View>
        {creation.notice ? <Text accessibilityRole="text" style={styles.creationNotice}>{creation.notice}</Text> : null}
        {creation.canReview ? (
          <ActionButton
            label="Reviewed desktop — allow another"
            onPress={() => void creation.reviewedDesktop()}
          />
        ) : null}
      </View>
      {deletion.notice ? <Text accessibilityRole="text" style={styles.creationNotice}>{deletion.notice}</Text> : null}
      {deletion.canReview ? (
        <ActionButton label="Reviewed desktop — allow deletes" onPress={() => void deletion.reviewedDesktop()} />
      ) : null}
      {visible.map((checklist) => <ChecklistCard key={checklist.id} checklist={checklist} contextKey={contextKey} deletion={deletion} />)}
      {!visible.length ? <Text style={styles.empty}>No checklists in this context.</Text> : null}
    </View>
  );
}

function ChatGitControl() {
  const { snapshot, inspect, sendCommand } = useControl();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ChatGitState | null>(null);
  const [tab, setTab] = useState<'branches' | 'history' | 'prs'>('branches');
  const [historySource, setHistorySource] = useState<'chat' | 'source'>('chat');
  const [newBranch, setNewBranch] = useState('');
  const [prs, setPrs] = useState<ChatPullRequest[]>([]);
  const [prNumber, setPrNumber] = useState('');
  const [loadedPr, setLoadedPr] = useState<ChatPullRequest | null>(null);
  const [detail, setDetail] = useState<ChatGitDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!snapshot.activeSessionId) return;
    setLoading(true);
    setError('');
    try {
      setData(await inspect<ChatGitState>('git.chat'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load chat Git');
    } finally {
      setLoading(false);
    }
  }, [inspect, snapshot.activeSessionId]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [open, refresh]);

  const loadPrs = async () => {
    setLoading(true);
    setError('');
    try {
      setPrs(await inspect<ChatPullRequest[]>('git.chat_prs'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load pull requests');
    } finally {
      setLoading(false);
    }
  };

  const loadPr = async () => {
    const number = Number(prNumber.replace(/^#/, ''));
    if (!Number.isSafeInteger(number) || number < 1) {
      setError('Enter a positive PR number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const value = await inspect<ChatPullRequest>('git.chat_pr', { number });
      setLoadedPr(value);
      setPrNumber(String(value.number));
      if (!newBranch.trim()) setNewBranch(`pr/${value.number}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this pull request');
    } finally {
      setLoading(false);
    }
  };

  const switchTarget = async (target: Record<string, unknown>) => {
    if (!data?.head) return;
    setLoading(true);
    setError('');
    try {
      await sendCommand('git.chat_switch', {
        target,
        expectedHead: data.head,
        expectedBranch: data.branch,
      });
      setDetail(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not switch chat revision');
    } finally {
      setLoading(false);
    }
  };

  const inspectCommit = async (hash: string, source: boolean) => {
    setLoading(true);
    setError('');
    try {
      setDetail(await inspect<ChatGitDetails>('git.chat_commit', { ref: hash, source }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load commit');
    } finally {
      setLoading(false);
    }
  };

  const branchNeeded = (source: boolean, kind: string) => source || kind !== 'branch';
  const blocked = Boolean(data?.dirty || data?.operationInProgress || loading);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Collapse chat revision controls' : 'Expand chat revision controls'}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.chatGitSummary, pressed && styles.pressed]}
      >
        <View style={styles.cardHeaderCopy}>
          <Eyebrow>Chat revision</Eyebrow>
          <Text numberOfLines={1} style={styles.itemText}>
            {data?.branch || snapshot.git.branch || 'Current checkout'}
          </Text>
          <Text numberOfLines={1} style={styles.gitFileMeta}>
            {data?.head ? data.head.slice(0, 10) : 'Open to inspect branches, history and PRs'}
          </Text>
        </View>
        <Text style={styles.metaAccent}>{open ? 'Close' : 'Open'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.detailBlock}>
          <View style={styles.scopeRow}>
            {(['branches', 'history', 'prs'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`${value === 'prs' ? 'Pull requests' : value === 'branches' ? 'Branches' : 'History'} tab`}
                accessibilityState={{ selected: tab === value }}
                onPress={() => {
                  setTab(value);
                  setDetail(null);
                  if (value === 'prs' && !prs.length) void loadPrs();
                }}
                style={({ pressed }) => [
                  styles.scopeChip,
                  tab === value && styles.scopeChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.scopeChipText, tab === value && styles.scopeChipTextActive]}>
                  {value === 'prs' ? 'PRs' : value[0].toUpperCase() + value.slice(1)}
                </Text>
              </Pressable>
            ))}
            <ActionButton label="Refresh" icon={RefreshCw} loading={loading} onPress={() => void refresh()} />
          </View>

          {data?.dirty ? <Text style={styles.warningTitle}>Commit or restore local changes before switching.</Text> : null}
          {data?.operationInProgress ? <Text style={styles.warningTitle}>Finish the current Git operation before switching.</Text> : null}
          {error ? <Text style={styles.panelError}>{error}</Text> : null}

          {tab !== 'branches' ? (
            <TextInput
              value={newBranch}
              onChangeText={setNewBranch}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={tab === 'prs' ? 'Branch name, e.g. pr/42' : 'New branch for selected revision'}
              placeholderTextColor={colors.textMuted}
              style={styles.inlineInput}
            />
          ) : null}

          {tab === 'branches' && data ? (
            <View style={styles.detailBlock}>
              {[...data.refs.map((ref) => ({ ...ref, source: false })), ...data.sourceRefs.map((ref) => ({ ...ref, source: true }))].map((ref) => {
                const needsBranch = branchNeeded(ref.source, ref.kind);
                const isCurrent = !ref.source && ref.name === data.branch;
                return (
                  <View key={`${ref.source ? 'source' : 'chat'}:${ref.ref}`} style={styles.gitFileRow}>
                    <View style={styles.gitFileCopy}>
                      <Text numberOfLines={1} style={styles.gitFilePath}>{ref.name}</Text>
                      <Text style={styles.gitFileMeta}>{ref.source ? 'source' : ref.kind}  {ref.hash.slice(0, 9)}</Text>
                    </View>
                    <ActionButton
                      label={isCurrent ? 'Current' : 'Use'}
                      disabled={blocked || isCurrent || (needsBranch && !newBranch.trim())}
                      onPress={() =>
                        void switchTarget({
                          kind: 'branch',
                          ref: ref.ref,
                          source: ref.source,
                          expectedHash: ref.hash,
                          ...(needsBranch ? { branch: newBranch.trim() } : {}),
                        })
                      }
                    />
                  </View>
                );
              })}
              {(data.sourceRefs.length > 0) ? (
                <TextInput
                  value={newBranch}
                  onChangeText={setNewBranch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="New branch when using source/tag/remote"
                  placeholderTextColor={colors.textMuted}
                  style={styles.inlineInput}
                />
              ) : null}
            </View>
          ) : null}

          {tab === 'history' && data ? (
            <View style={styles.detailBlock}>
              <View style={styles.scopeRow}>
                {(['chat', 'source'] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`${value === 'chat' ? 'Chat' : 'Source'} history`}
                    accessibilityState={{ selected: historySource === value }}
                    onPress={() => {
                      setHistorySource(value);
                      setDetail(null);
                    }}
                    style={({ pressed }) => [
                      styles.scopeChip,
                      historySource === value && styles.scopeChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.scopeChipText, historySource === value && styles.scopeChipTextActive]}>
                      {value === 'chat' ? 'Chat' : 'Source'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {(historySource === 'source' ? data.sourceCommits : data.commits).map((commit) => (
                <View key={commit.hash} style={styles.gitFileRow}>
                  <Pressable
                    onPress={() => void inspectCommit(commit.hash, historySource === 'source')}
                    style={({ pressed }) => [styles.gitFileCopy, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={1} style={styles.gitFilePath}>{commit.subject}</Text>
                    <Text style={styles.gitFileMeta}>{commit.hash.slice(0, 9)}  {commit.author}</Text>
                  </Pressable>
                  <ActionButton
                    label="Use"
                    disabled={blocked || !newBranch.trim()}
                    onPress={() =>
                      void switchTarget({
                        kind: 'commit',
                        ref: commit.hash,
                        source: historySource === 'source',
                        expectedHash: commit.hash,
                        branch: newBranch.trim(),
                      })
                    }
                  />
                </View>
              ))}
              {detail ? (
                <View style={styles.diffBlock}>
                  <Text style={styles.diffTitle}>{detail.subject}</Text>
                  <Text style={styles.gitFileMeta}>{detail.author}  {detail.date}</Text>
                  {detail.message ? <Text selectable style={styles.diffText}>{detail.message}</Text> : null}
                  {detail.stat ? <Text selectable style={styles.diffText}>{detail.stat}</Text> : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {tab === 'prs' ? (
            <View style={styles.detailBlock}>
              <View style={styles.inlineActionRow}>
                <TextInput
                  value={prNumber}
                  onChangeText={setPrNumber}
                  onSubmitEditing={() => void loadPr()}
                  keyboardType="number-pad"
                  placeholder="PR number"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.inlineInput, styles.flexInput]}
                />
                <ActionButton label="Load" loading={loading} onPress={() => void loadPr()} />
              </View>
              {loadedPr ? (
                <View style={styles.gitFileRow}>
                  <Pressable
                    onPress={() => void Linking.openURL(loadedPr.url)}
                    style={({ pressed }) => [styles.gitFileCopy, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={2} style={styles.gitLink}>#{loadedPr.number} {loadedPr.title}</Text>
                    <Text style={styles.gitFileMeta}>{loadedPr.state}  {loadedPr.headBranch} → {loadedPr.baseBranch}</Text>
                  </Pressable>
                  <ActionButton
                    label="Use"
                    disabled={blocked}
                    onPress={() =>
                      void switchTarget({
                        kind: 'pull-request',
                        number: loadedPr.number,
                        branch: newBranch.trim() || `pr/${loadedPr.number}`,
                        expectedHash: loadedPr.headCommit,
                      })
                    }
                  />
                </View>
              ) : null}
              {prs.map((pr) => (
                <View key={pr.number} style={styles.gitFileRow}>
                  <Pressable
                    onPress={() => void Linking.openURL(pr.url)}
                    style={({ pressed }) => [styles.gitFileCopy, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={1} style={styles.gitLink}>#{pr.number} {pr.title}</Text>
                    <Text style={styles.gitFileMeta}>{pr.state}  {pr.headBranch} → {pr.baseBranch}</Text>
                  </Pressable>
                  <ActionButton
                    label="Use"
                    disabled={blocked}
                    onPress={() =>
                      void switchTarget({
                        kind: 'pull-request',
                        number: pr.number,
                        branch: newBranch.trim() || `pr/${pr.number}`,
                        expectedHash: pr.headCommit,
                      })
                    }
                  />
                </View>
              ))}
              {!prs.length && !loading ? <Text style={styles.empty}>No pull requests found.</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const gitInputDrafts = new Map<string, { branchName: string; commitMessage: string; remoteUrl: string }>();

function GitPanel({ contextKey }: { contextKey: string }) {
  const { snapshot, sendCommand, inspect } = useControl();
  const savedInputs = gitInputDrafts.get(contextKey);
  const [commitMessage, setCommitMessage] = useState(savedInputs?.commitMessage ?? '');
  const [branchName, setBranchName] = useState(savedInputs?.branchName ?? '');
  const [remoteUrl, setRemoteUrl] = useState(savedInputs?.remoteUrl ?? snapshot.git.remote ?? '');
  const [inspection, setInspection] = useState<GitInspection | null>(null);
  const [inspecting, setInspecting] = useState('');
  const [armedRestore, setArmedRestore] = useState('');
  const [armedDiscard, setArmedDiscard] = useState('');
  const saveGitInput = (field: 'commitMessage' | 'branchName' | 'remoteUrl', value: string) => {
    const previous = gitInputDrafts.get(contextKey) ?? { commitMessage, branchName, remoteUrl };
    gitInputDrafts.set(contextKey, { ...previous, [field]: value });
    if (field === 'commitMessage') setCommitMessage(value);
    else if (field === 'branchName') setBranchName(value);
    else setRemoteUrl(value);
  };
  const stagedCount = snapshot.git.status.filter((file) => file.staged).length;
  const unstagedCount = snapshot.git.status.length - stagedCount;

  const inspectFile = async (file: string, staged: boolean) => {
    setInspecting(file);
    try {
      setInspection(await inspect<GitInspection>('git.inspect_file', { file, staged }));
    } finally {
      setInspecting('');
    }
  };

  if (!snapshot.git.isRepo) {
    return (
      <View style={styles.panelBody}>
        <Text style={styles.empty}>Git is not available for this chat workspace.</Text>
        <ActionButton
          label="Check again"
          icon={RefreshCw}
          onPress={() => void sendCommand('git.refresh')}
        />
      </View>
    );
  }

  return (
    <View style={styles.panelBody}>
      <ChatGitControl />
      <View style={styles.gitSummary}>
        <View style={styles.cardHeaderCopy}>
          <Eyebrow>Current branch</Eyebrow>
          <Text numberOfLines={1} style={styles.gitBranch}>{snapshot.git.branch || 'Detached HEAD'}</Text>
          <Text style={styles.metaMuted}>
            {snapshot.git.ahead} ahead  {snapshot.git.behind} behind  {snapshot.git.worktrees.availableSlots}/{snapshot.git.worktrees.maxAllowed} slots
          </Text>
        </View>
        {snapshot.git.writeReady ? (
          <View style={styles.actionRow}>
            <ActionButton label="Refresh" icon={RefreshCw} onPress={() => void sendCommand('git.refresh')} />
            <ActionButton label="Pull" icon={ArrowDown} disabled={!snapshot.git.remote} onPress={() => void sendCommand('git.action', { action: 'pull' })} />
            <ActionButton label="Push" icon={ArrowUp} disabled={!snapshot.git.remote} onPress={() => void sendCommand('git.action', { action: 'push' })} />
          </View>
        ) : null}
      </View>

      {!snapshot.git.writeReady ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Git controls need a current chat checkout</Text>
          <ActionButton
            label="New chat"
            icon={Plus}
            primary
            onPress={() => void sendCommand('session.create', { projectId: snapshot.activeProjectId })}
          />
        </View>
      ) : null}

      {snapshot.git.conflicts.length ? (
        <View style={styles.warningBlock}>
          <Text style={styles.warningTitle}>Merge conflicts</Text>
          {snapshot.git.conflicts.map((conflict) => <Text key={conflict} style={styles.metaMuted}>{conflict}</Text>)}
          <ActionButton
            label="Send to Kory"
            disabled={!snapshot.activeSessionId}
            onPress={() => {
              const fileList = snapshot.git.conflicts.join('\n- ');
              const body = `I encountered Git merge conflicts in the following files:\n- ${fileList}\n\nPlease help me resolve these conflicts. You can read the files to see the conflict markers.`;
              void sendCommand('session.send_message', { body });
            }}
          />
        </View>
      ) : null}

      <View style={styles.card}>
        <Eyebrow>Branches</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchStrip}>
          {snapshot.git.branches.map((branch) => (
            <View key={branch} style={[styles.branchChip, branch === snapshot.git.branch && styles.branchChipActive]}>
              <Text numberOfLines={1} style={[styles.branchChipText, branch === snapshot.git.branch && styles.branchChipTextActive]}>{branch}</Text>
              {snapshot.git.writeReady && branch !== snapshot.git.branch ? (
                <View style={styles.branchActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Switch to branch ${branch}`}
                    onPress={() => void sendCommand('git.action', { action: 'checkout', branch })}
                    style={styles.miniTextButton}
                  >
                    <Text style={styles.miniText}>Switch</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Merge branch ${branch} into ${snapshot.git.branch}`}
                    onPress={() => void sendCommand('git.action', { action: 'merge', branch })}
                    style={styles.miniTextButton}
                  >
                    <Merge size={12} color={colors.textMuted} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
        {snapshot.git.writeReady ? (
          <View style={styles.inlineInputRow}>
            <TextInput
              value={branchName}
              onChangeText={(value) => saveGitInput('branchName', value)}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="feature/new-branch"
              placeholderTextColor={colors.textMuted}
              style={styles.inlineInput}
            />
            <ActionButton
              label="Create"
              icon={GitBranch}
              disabled={!branchName.trim()}
              onPress={() => {
                const branch = branchName.trim();
                if (!branch) return;
                saveGitInput('branchName', '');
                void sendCommand('git.action', { action: 'create_branch', branch });
              }}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.metaRow}>
          <Eyebrow>Changes</Eyebrow>
          <Text style={styles.metaMuted}>{snapshot.git.status.length} files  {stagedCount} staged</Text>
        </View>
        {snapshot.git.writeReady && snapshot.git.status.length ? (
          <View style={styles.actionRow}>
            {unstagedCount ? (
              <ActionButton
                label="Stage all"
                onPress={() => void sendCommand('git.action', { action: 'stage', file: '.' })}
              />
            ) : null}
            {stagedCount ? (
              <ActionButton
                label="Unstage all"
                onPress={() => void sendCommand('git.action', { action: 'unstage', file: '.' })}
              />
            ) : null}
          </View>
        ) : null}
        {snapshot.git.status.map((file) => (
          <View key={`${file.staged ? 'staged' : 'work'}:${file.path}`} style={styles.gitFileRow}>
            <Pressable onPress={() => void inspectFile(file.path, file.staged)} style={styles.gitFileCopy}>
              <Text numberOfLines={1} style={styles.gitFilePath}>{file.path}</Text>
              <Text style={styles.gitFileMeta}>
                {file.staged ? 'staged' : file.status}
                {file.additions !== undefined || file.deletions !== undefined
                  ? `  +${file.additions ?? 0} -${file.deletions ?? 0}`
                  : ''}
                {inspecting === file.path ? '  loading' : ''}
              </Text>
            </Pressable>
            {snapshot.git.writeReady ? (
              <ActionButton
                label={file.staged ? 'Unstage' : 'Stage'}
                onPress={() => void sendCommand('git.action', { action: file.staged ? 'unstage' : 'stage', file: file.path })}
              />
            ) : null}
            {snapshot.git.writeReady && !file.staged && file.status !== 'untracked' ? (
              <ActionButton
                label={armedRestore === file.path ? 'Confirm' : 'Restore'}
                danger
                onPress={() => {
                  if (armedRestore !== file.path) return setArmedRestore(file.path);
                  setArmedRestore('');
                  void sendCommand('git.action', { action: 'restore', file: file.path });
                }}
              />
            ) : null}
          </View>
        ))}
        {!snapshot.git.status.length ? <Text style={styles.empty}>Working tree is clean.</Text> : null}
        {inspection ? (
          <View style={styles.diffBlock}>
            <View style={styles.metaRow}>
              <Text numberOfLines={1} style={styles.diffTitle}>{inspection.file}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close diff for ${inspection.file}`}
                onPress={() => setInspection(null)}
                style={styles.inlineIcon}
              >
                <X size={14} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView horizontal nestedScrollEnabled>
              <Text selectable style={styles.diffText}>{inspection.diff || inspection.content || 'No textual diff available.'}</Text>
            </ScrollView>
          </View>
        ) : null}
        {snapshot.git.writeReady ? (
          <View style={styles.inlineInputRow}>
            <TextInput
              value={commitMessage}
              onChangeText={(value) => saveGitInput('commitMessage', value)}
              placeholder="Commit message"
              placeholderTextColor={colors.textMuted}
              style={styles.inlineInput}
            />
            <ActionButton
              label="Commit"
              primary
              disabled={!commitMessage.trim() || stagedCount === 0}
              onPress={() => {
                const message = commitMessage.trim();
                if (!message) return;
                saveGitInput('commitMessage', '');
                void sendCommand('git.action', { action: 'commit', message });
              }}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Eyebrow>Remote</Eyebrow>
        {snapshot.git.writeReady ? (
          <View style={styles.inlineInputRow}>
            <TextInput
              value={remoteUrl}
              onChangeText={(value) => saveGitInput('remoteUrl', value)}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://github.com/owner/repo.git"
              placeholderTextColor={colors.textMuted}
              style={styles.inlineInput}
            />
            <ActionButton
              label="Save"
              disabled={!remoteUrl.trim() || remoteUrl.trim() === (snapshot.git.remote ?? '')}
              onPress={() => void sendCommand('git.action', { action: 'remote', url: remoteUrl.trim() })}
            />
          </View>
        ) : (
          <Text numberOfLines={2} style={styles.gitFilePath}>{snapshot.git.remote || 'No remote'}</Text>
        )}
      </View>

      {snapshot.git.writeReady && (snapshot.git.worktrees.active.length || snapshot.git.worktrees.pendingResolutions.length) ? (
        <View style={styles.card}>
          <Eyebrow>Agent worktrees</Eyebrow>
          {snapshot.git.worktrees.active.map((worktree) => (
            <View key={worktree.id} style={styles.worktreeRow}>
              <View style={styles.cardHeaderCopy}>
                <Text style={styles.itemText}>{worktree.taskName}</Text>
                <Text numberOfLines={1} style={styles.gitFileMeta}>{worktree.branchName}</Text>
              </View>
              <Text style={styles.metaAccent}>active</Text>
            </View>
          ))}
          {snapshot.git.worktrees.pendingResolutions.map((resolution) => (
            <View key={resolution.taskId} style={styles.worktreeResolution}>
              <Text style={styles.itemText}>{resolution.taskName}</Text>
              <Text style={styles.gitFileMeta}>{resolution.reason}  {resolution.branchName}</Text>
              {resolution.conflicts.map((conflict) => <Text key={conflict.path} style={styles.metaMuted}>{conflict.path}</Text>)}
              <View style={styles.actionRow}>
                <ActionButton label="Retry merge" onPress={() => void sendCommand('git.action', { action: 'resolve_worktree', taskId: resolution.taskId })} />
                <ActionButton
                  label={armedDiscard === resolution.taskId ? 'Confirm discard' : 'Discard'}
                  danger
                  onPress={() => {
                    if (armedDiscard !== resolution.taskId) return setArmedDiscard(resolution.taskId);
                    setArmedDiscard('');
                    void sendCommand('git.action', { action: 'discard_worktree', taskId: resolution.taskId });
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function WorkspaceControlPanel({
  kind,
  onClose,
  fullscreen = false,
}: {
  kind: WorkspaceControlKind;
  onClose: () => void;
  fullscreen?: boolean;
}) {
  const { error, snapshot } = useControl();
  // All destructive two-step confirmations and remote edit state belong to
  // one exact machine/project/chat, even when IDs or paths collide.
  const contextKey = `${snapshot.machine.id}\u0000${snapshot.activeProjectId}\u0000${snapshot.activeSessionId}`;
  const config =
    kind === 'goals'
      ? { title: 'Goal Mode', detail: 'Steer durable work across chats.', icon: Target }
      : kind === 'checklists'
        ? { title: 'Checklists', detail: 'Keep shared execution lists in sync.', icon: ListChecks }
        : { title: 'Git', detail: 'Control the active chat workspace.', icon: GitBranch };
  const Icon = config.icon;
  return (
    <View style={[styles.panel, fullscreen && styles.panelFullscreen]}>
      <View style={styles.panelHeader}>
        <View style={styles.panelIcon}><Icon size={17} color={colors.accent} /></View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.panelTitle}>{config.title}</Text>
          <Text style={styles.panelDetail}>{config.detail}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${config.title}`} onPress={onClose} style={styles.closeButton}>
          <X size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      {error ? <Text style={styles.panelError}>{error}</Text> : null}
      <ScrollView
        style={[styles.panelScroll, fullscreen && styles.panelScrollFullscreen]}
        contentContainerStyle={styles.panelScrollContent}
        nestedScrollEnabled
      >
        {kind === 'goals'
          ? <GoalsPanel key={contextKey} contextKey={contextKey} />
          : kind === 'checklists'
            ? <ChecklistsPanel key={contextKey} contextKey={contextKey} />
            : <GitPanel key={contextKey} contextKey={contextKey} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  goalBar: {
    minHeight: 56,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalBarMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: spacing.sm },
  goalGlyph: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  goalBarCopy: { flex: 1, minWidth: 0, gap: 4 },
  goalBarMeta: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  goalBarStatus: { color: colors.accent, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  goalBarProgress: { color: colors.textMuted, fontSize: 10 },
  goalBarTitle: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '600' },
  goalBarAction: { width: 48, height: 48, marginRight: 4, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  panel: { maxHeight: 470, marginHorizontal: spacing.md, marginTop: spacing.xs, borderRadius: radii.xl, backgroundColor: colors.surface2, overflow: 'hidden' },
  panelFullscreen: { flex: 1, maxHeight: undefined, marginHorizontal: 0, marginTop: 0, borderRadius: 0, backgroundColor: colors.surface1 },
  panelHeader: { minHeight: 58, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface3 },
  panelIcon: { width: 32, height: 32, borderRadius: radii.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { color: colors.textPrimary, fontSize: typography.base, fontWeight: '800' },
  panelDetail: { marginTop: 2, color: colors.textMuted, fontSize: typography.xs },
  closeButton: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  panelScroll: { maxHeight: 410 },
  panelScrollFullscreen: { flex: 1, maxHeight: undefined },
  panelScrollContent: { paddingBottom: spacing.md },
  panelError: { color: colors.error, fontSize: typography.xs, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  panelBody: { padding: spacing.md, gap: spacing.sm },
  createBlock: { borderRadius: radii.lg, backgroundColor: colors.surface3, padding: spacing.sm, gap: spacing.xs },
  creationNotice: { color: colors.textSecondary, fontSize: typography.xs, lineHeight: 18 },
  createFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  scopeRow: { flex: 1, flexDirection: 'row', gap: 4 },
  scopeChip: { minHeight: 44, paddingHorizontal: spacing.xs, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  scopeChipActive: { backgroundColor: colors.accentSoft },
  scopeChipText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  scopeChipTextActive: { color: colors.accent },
  textInput: { minHeight: 44, maxHeight: 92, borderRadius: radii.md, backgroundColor: colors.surface2, color: colors.textPrimary, fontSize: typography.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  card: { borderRadius: radii.lg, backgroundColor: colors.surface3, padding: spacing.sm, gap: spacing.xs },
  chatGitSummary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardHeaderCopy: { flex: 1, minWidth: 0 },
  cardTitle: { marginTop: 3, color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700', lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  metaAccent: { color: colors.accent, fontSize: 10, fontWeight: '700' },
  metaMuted: { color: colors.textMuted, fontSize: 10 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  detailBlock: { gap: spacing.xs, paddingTop: spacing.xxs },
  itemRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  itemText: { flex: 1, color: colors.textSecondary, fontSize: typography.sm, lineHeight: 18 },
  itemSkipped: { textDecorationLine: 'line-through', color: colors.textMuted },
  inlineIcon: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  inlineInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  inlineInput: { minHeight: 40, flex: 1, minWidth: 0, borderRadius: radii.md, backgroundColor: colors.surface2, color: colors.textPrimary, fontSize: typography.sm, paddingHorizontal: spacing.sm },
  inlineActionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flexInput: { flex: 1 },
  empty: { color: colors.textMuted, fontSize: typography.sm, lineHeight: 19, paddingVertical: spacing.sm },
  errorText: { color: colors.error, fontSize: typography.xs, lineHeight: 17 },
  gitSummary: { borderRadius: radii.lg, backgroundColor: colors.surface3, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gitBranch: { marginTop: 3, color: colors.textPrimary, fontSize: typography.base, fontWeight: '700', fontFamily: 'monospace' },
  warningBlock: { borderRadius: radii.lg, backgroundColor: colors.errorSoft, padding: spacing.sm, gap: 3 },
  warningTitle: { color: colors.error, fontSize: typography.sm, fontWeight: '700' },
  branchStrip: { gap: spacing.xs, paddingVertical: spacing.xs },
  branchChip: { maxWidth: 220, minHeight: 46, borderRadius: radii.md, backgroundColor: colors.surface2, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, justifyContent: 'center' },
  branchChipActive: { backgroundColor: colors.accentSoft },
  branchChipText: { color: colors.textSecondary, fontSize: typography.xs, fontFamily: 'monospace' },
  branchChipTextActive: { color: colors.accent },
  branchActions: { flexDirection: 'row', gap: spacing.xs, marginTop: 4 },
  miniTextButton: { minWidth: 44, minHeight: 44, borderRadius: radii.sm, paddingHorizontal: spacing.xs, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  miniText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  gitFileRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  gitFileCopy: { flex: 1, minWidth: 0 },
  gitFilePath: { color: colors.textSecondary, fontSize: typography.xs, fontFamily: 'monospace' },
  gitLink: { color: colors.accent, fontSize: typography.xs, fontWeight: '700' },
  gitFileMeta: { marginTop: 3, color: colors.textMuted, fontSize: 10 },
  diffBlock: { maxHeight: 220, borderRadius: radii.md, backgroundColor: colors.surface1, padding: spacing.sm, gap: spacing.xs },
  diffTitle: { flex: 1, color: colors.textSecondary, fontSize: typography.xs, fontFamily: 'monospace' },
  diffText: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, fontFamily: 'monospace' },
  worktreeRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  worktreeResolution: { paddingTop: spacing.xs, gap: 4 },
});
