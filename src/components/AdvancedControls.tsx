import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import {
  Archive,
  Check,
  CheckCircle2,
  Circle,
  CircleStop,
  Clock3,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Workflow,
  X,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import {
  implementationPrompt,
  latestPlanText,
  originalPlanRequest,
  validatePlanReadiness,
} from '../control/planHandoff';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type {
  ComputerAppPermission,
  ComputerCapability,
  ComputerPermission,
  ComputerRole,
  ComputerTarget,
  ComputerTier,
  ComputerUseInspection,
  ComputerUseSettings,
  CommandResult,
  RewindPreview,
  Session,
  TimeTravelEntry,
  TimeTravelState,
  WorkflowDefinition,
  WorkflowsInspection,
} from '../types/control';
import { ActionButton } from './ui';

function ChoiceRow({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.choice, active && styles.choiceActive, disabled && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function FieldLabel({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.fieldLabel}>
      <Text style={styles.fieldTitle}>{title}</Text>
      {detail ? <Text style={styles.fieldDetail}>{detail}</Text> : null}
    </View>
  );
}

function activeSessionOr(snapshot: { sessions: Session[]; activeSessionId: string }, sessionId?: string) {
  return snapshot.sessions.find((session) => session.id === (sessionId || snapshot.activeSessionId));
}

type SendCommand = (name: string, payload?: Record<string, unknown>) => Promise<CommandResult>;

async function requireAccepted(sendCommand: SendCommand, name: string, payload?: Record<string, unknown>) {
  const result = await sendCommand(name, payload);
  if (!result?.accepted) throw new Error('The host did not accept this request. Check its state before retrying.');
  return result;
}

/** A single immediate lock protects all actions on a control screen, including double taps. */
function useGuardedAction() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const run = useCallback(async (label: string, action: () => Promise<unknown>, onAccepted?: () => void) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(label);
    setError('');
    try {
      await action();
      if (mounted.current) onAccepted?.();
      // A successful reply to an unmounted screen must not trigger a follow-up
      // inspection or navigation after a host/chat switch.
      return mounted.current;
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : 'Request not confirmed. Check the host before retrying.');
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy('');
    }
  }, []);
  return { busy, error, run, setError };
}

export function SessionControlsView({ sessionId }: { sessionId?: string }) {
  const { snapshot, sendCommand, modelChoices } = useControl();
  const session = activeSessionOr(snapshot, sessionId);
  const [title, setTitle] = useState(session?.title ?? '');
  const titleDraftRef = useRef(session?.title ?? '');
  const hostTitleRef = useRef({ sessionId: session?.id ?? '', title: session?.title ?? '' });
  const [titleConflict, setTitleConflict] = useState(false);
  const [armed, setArmed] = useState<'archive' | 'delete' | ''>('');
  const { busy, error, run } = useGuardedAction();

  useEffect(() => {
    const previous = hostTitleRef.current;
    const current = { sessionId: session?.id ?? '', title: session?.title ?? '' };
    hostTitleRef.current = current;
    const timer = setTimeout(() => {
      // Live host refreshes must not overwrite a title the user is editing.
      // If both titles changed, require an explicit choice before overwriting.
      if (previous.sessionId !== current.sessionId || titleDraftRef.current === previous.title) {
        titleDraftRef.current = current.title;
        setTitle(current.title);
        setTitleConflict(false);
      } else if (previous.title !== current.title) {
        setTitleConflict(titleDraftRef.current !== current.title);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [session?.id, session?.title]);

  const editTitle = (value: string) => {
    titleDraftRef.current = value;
    setTitle(value);
  };

  if (!session) {
    return <View style={styles.empty}><Text style={styles.muted}>Chat unavailable</Text></View>;
  }

  const manager = snapshot.agents.find((agent) => agent.id === 'kory-manager') ?? snapshot.agents[0];
  const choice = modelChoices[session.id];
  const model = choice?.selection || manager?.model || '';
  const reasoningLevel = choice?.reasoningLevel || '';
  const overrides = session.agentOverrides ?? {};
  const currentPlanText = latestPlanText(snapshot.feed);
  const planReadiness = validatePlanReadiness(currentPlanText);

  const updateControls = async (patch: Record<string, unknown>) => {
    await run('controls', () => requireAccepted(sendCommand, 'session.update_controls', { sessionId: session.id, ...patch }));
  };

  const updateOverride = (key: string, value: unknown) =>
    updateControls({ agentOverrides: { ...overrides, [key]: value } });

  const saveTitle = async () => {
    const next = title.trim();
    if (!next || next === session.title || titleConflict) return;
    await run('rename', () => requireAccepted(sendCommand, 'session.rename', { sessionId: session.id, title: next }));
  };

  const lifecycle = async (action: 'archive' | 'delete') => {
    if (busy) return;
    if (armed !== action) {
      setArmed(action);
      return;
    }
    await run(action, () => requireAccepted(sendCommand, `session.${action}`, { sessionId: session.id }), () => {
      setArmed('');
      router.replace('/workspace');
    });
  };

  const approvePlan = async () => {
    if (!planReadiness.ready || !currentPlanText || busy) return;
    await run('approve-plan', async () => {
      await requireAccepted(sendCommand, 'session.update_controls', {
        sessionId: session.id,
        interactionMode: 'act',
      });
      const objective = originalPlanRequest(snapshot.feed, session.title);
      try {
        await requireAccepted(sendCommand, 'session.send_message', {
          sessionId: session.id,
          body: implementationPrompt(objective, currentPlanText),
          ...(model ? { model } : {}),
          ...(reasoningLevel ? { reasoningLevel } : {}),
        });
      } catch {
        throw new Error('Mode change was accepted, but the implementation request was not confirmed. Check this chat before retrying to avoid duplicate work.');
      }
    }, () => router.replace('/workspace'));
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.card}>
        <FieldLabel title="Name" />
        <View style={styles.inputRow}>
          <TextInput
            value={title}
            onChangeText={editTitle}
            onSubmitEditing={() => void saveTitle()}
            editable={!busy}
            accessibilityLabel="Chat name"
            returnKeyType="done"
            style={styles.input}
          />
          <ActionButton
            label="Save"
            icon={Save}
            disabled={!!busy || titleConflict || !title.trim() || title.trim() === session.title}
            loading={busy === 'rename'}
            onPress={() => void saveTitle()}
          />
        </View>
        {titleConflict ? (
          <View>
            <Text accessibilityRole="alert" style={styles.warning}>
              Chat name changed on the desktop while you were editing. Choose which name to use before saving.
            </Text>
            <View style={styles.actionWrap}>
              <ActionButton label="Keep my title" disabled={!!busy} onPress={() => setTitleConflict(false)} />
              <ActionButton label="Use desktop title" disabled={!!busy} onPress={() => {
                editTitle(session.title);
                setTitleConflict(false);
              }} />
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <FieldLabel title="Mode" detail="Plan limits the chat to planning. Act allows execution." />
        <ChoiceRow
          value={session.interactionMode ?? 'act'}
          disabled={!!busy}
          options={[{ value: 'act', label: 'Act' }, { value: 'plan', label: 'Plan' }]}
          onChange={(interactionMode) => void updateControls({ interactionMode })}
        />
        {session.interactionMode === 'plan' ? (
          <ActionButton
            label={planReadiness.ready ? 'Approve plan & implement' : 'Plan not ready to implement'}
            icon={Play}
            primary={planReadiness.ready}
            disabled={!planReadiness.ready || !!busy}
            loading={busy === 'approve-plan'}
            onPress={() => void approvePlan()}
          />
        ) : null}

        <FieldLabel title="Permission preset" />
        <ChoiceRow
          value={overrides.permissionMode ?? 'guarded'}
          disabled={!!busy}
          options={['guarded', 'ask', 'edits', 'yolo', 'plan', 'custom'].map((value) => ({
            value,
            label: value === 'edits' ? 'Edits' : value === 'yolo' ? 'YOLO' : value[0].toUpperCase() + value.slice(1),
          }))}
          onChange={(value) => void updateOverride('permissionMode', value)}
        />

        <FieldLabel title="Agent execution" />
        <ChoiceRow
          value={overrides.agentExecutionMode ?? 'auto'}
          disabled={!!busy}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'single', label: 'Single' },
            { value: 'multi', label: 'Multi' },
          ]}
          onChange={(value) => void updateOverride('agentExecutionMode', value)}
        />

        <FieldLabel title="Critic gate" />
        <ChoiceRow
          value={overrides.criticGateEnabled === false ? 'off' : 'on'}
          disabled={!!busy}
          options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
          onChange={(value) => void updateOverride('criticGateEnabled', value === 'on')}
        />
        {busy === 'controls' ? <Text style={styles.muted}>Saving…</Text> : null}
      </View>

      <View style={styles.card}>
        <FieldLabel title="Context" detail="Compact the current chat with the selected model." />
        <ActionButton
          label="Compact now"
          icon={RefreshCw}
          disabled={!model || !!busy}
          loading={busy === 'compact'}
          onPress={() => {
            void run('compact', () => requireAccepted(sendCommand, 'session.compact', {
              sessionId: session.id,
              model,
              ...(reasoningLevel ? { reasoningLevel } : {}),
            }));
          }}
        />
      </View>

      <View style={styles.card}>
        <FieldLabel title="Chat" />
        <View style={styles.actionWrap}>
          <ActionButton
            label={armed === 'archive' ? 'Tap again to archive' : 'Archive'}
            icon={Archive}
            disabled={!!busy}
            loading={busy === 'archive'}
            onPress={() => void lifecycle('archive')}
          />
          <ActionButton
            label={armed === 'delete' ? 'Tap again to delete' : 'Delete'}
            icon={Trash2}
            danger
            disabled={!!busy}
            loading={busy === 'delete'}
            onPress={() => void lifecycle('delete')}
          />
        </View>
        {armed ? <Text style={styles.warning}>{armed === 'delete' ? 'This permanently deletes the selected chat.' : 'This archives the selected chat.'} Tap again to confirm.</Text> : null}
      </View>
    </ScrollView>
  );
}

export function WorkflowsView() {
  const { snapshot, inspect, sendCommand } = useControl();
  const [data, setData] = useState<WorkflowsInspection | null>(null);
  const [task, setTask] = useState('');
  const [evidence, setEvidence] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { busy, error: commandError, run: runAction } = useGuardedAction();
  const performing = useRef(false);

  const refresh = useCallback(async (): Promise<WorkflowsInspection | null> => {
    if (!snapshot.activeSessionId) return null;
    setLoading(true);
    setError('');
    try {
      const next = await inspect<WorkflowsInspection>('workflows.inspect');
      setData(next);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load workflows');
      return null;
    } finally {
      setLoading(false);
    }
  }, [inspect, snapshot.activeSessionId]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const run = data?.runs.find((item) => item.status === 'running' || item.status === 'blocked');
  const definition = run ? data?.definitions.find((item) => item.id === run.workflowId) : undefined;
  const stage = run && definition ? definition.stages[run.stageIndex] : undefined;

  const perform = async (name: string, payload: Record<string, unknown>) => {
    if (loading || performing.current) return;
    performing.current = true;
    try {
      const accepted = await runAction(name, () => requireAccepted(sendCommand, name, payload));
      if (!accepted) return;

      const next = await refresh();
      if (!next) {
        setError('The host accepted the workflow request, but its latest state was not confirmed. Keep your text and check the desktop before retrying.');
        return;
      }

      // A command acknowledgement does not prove the host advanced the workflow.
      // Retain typed text until inspection shows the specific effect.
      const previous = data?.runs.find((item) => item.id === payload.runId);
      const updated = next.runs.find((item) => item.id === payload.runId);
      const confirmed = name === 'workflow.start'
        ? next.runs.some((item) => item.sessionId === payload.sessionId && item.task === payload.task
          && !data?.runs.some((old) => old.id === item.id))
        : name === 'workflow.advance'
          ? !!previous && !!updated && updated.evidence.some((item) => item.value === payload.evidence
            && !previous.evidence.some((old) => old.stageId === item.stageId && old.value === item.value))
          : name === 'workflow.stop'
            ? !!updated && updated.status === 'stopped'
            : name === 'workflow.activate_draft'
              ? next.drafts.some((item) => item.id === payload.draftId
                && item.status === 'activated' && item.activatedScope === payload.scope)
              : false;

      if (!confirmed) {
        setError('The host accepted the request, but the workflow change is not yet confirmed. Check desktop state before retrying; your draft is retained.');
        return;
      }

      if (name === 'workflow.advance') setEvidence('');
      if (name === 'workflow.start') setTask('');
    } finally {
      performing.current = false;
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ActionButton
        label="Refresh workflows"
        icon={RefreshCw}
        disabled={loading || !!busy || !snapshot.activeSessionId}
        loading={loading}
        onPress={() => void refresh()}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {commandError ? <Text accessibilityRole="alert" style={styles.error}>{commandError}</Text> : null}
      {run ? (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardTitleCopy}>
              <Text style={styles.cardTitle}>{definition?.name ?? run.workflowId}</Text>
              <Text style={styles.muted}>{run.task}</Text>
            </View>
            <ActionButton
              label="Stop"
              icon={CircleStop}
              danger
              disabled={loading || !!busy}
              loading={busy === 'workflow.stop'}
              onPress={() => void perform('workflow.stop', { runId: run.id })}
            />
          </View>

          <View style={styles.stageList}>
            {(definition?.stages ?? []).map((item, index) => (
              <View key={item.id} style={styles.stageRow}>
                {index < run.stageIndex ? (
                  <CheckCircle2 size={16} color={colors.success} />
                ) : index === run.stageIndex ? (
                  <Circle size={16} color={colors.accent} />
                ) : (
                  <Circle size={16} color={colors.textMuted} />
                )}
                <View style={styles.stageCopy}>
                  <Text style={[styles.stageTitle, index === run.stageIndex && styles.stageTitleActive]}>{item.label}</Text>
                  {index === run.stageIndex ? <Text style={styles.muted}>{item.description}</Text> : null}
                </View>
              </View>
            ))}
          </View>

          {run.blocker ? <Text style={styles.warning}>Blocked: {run.blocker}</Text> : null}
          {stage && run.status === 'running' ? (
            <>
              <TextInput
                value={evidence}
                onChangeText={setEvidence}
                editable={!loading && !busy}
                multiline
                placeholder={`Evidence for ${stage.label}`}
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.textArea]}
              />
              <View style={styles.actionWrap}>
                <ActionButton
                  label="Report blocker"
                  disabled={!evidence.trim() || loading || !!busy}
                  onPress={() => void perform('workflow.advance', { runId: run.id, evidence: evidence.trim(), block: true })}
                />
                <ActionButton
                  label="Record and continue"
                  icon={Check}
                  primary
                  disabled={!evidence.trim() || loading || !!busy}
                  onPress={() => void perform('workflow.advance', { runId: run.id, evidence: evidence.trim() })}
                />
              </View>
            </>
          ) : null}
        </View>
      ) : (
        <View style={styles.card}>
          <FieldLabel title="Start workflow" />
          <TextInput
            value={task}
            onChangeText={setTask}
            editable={!loading && !busy}
            multiline
            placeholder="What should Koryphaios accomplish?"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.textArea]}
          />
          <ActionButton
            label="Start"
            icon={Play}
            primary
            disabled={!task.trim() || loading || !!busy || !snapshot.activeSessionId}
            loading={busy === 'workflow.start'}
            onPress={() => void perform('workflow.start', { sessionId: snapshot.activeSessionId, task: task.trim() })}
          />
        </View>
      )}

      {data?.definitions.length ? (
        <View style={styles.card}>
          <FieldLabel title="Available workflows" />
          {data.definitions.map((item) => <WorkflowDefinitionRow key={item.id} definition={item} />)}
        </View>
      ) : null}

      {data?.drafts.length ? (
        <View style={styles.card}>
          <FieldLabel title="Workflow drafts" />
          {data.drafts.map((draft) => (
            <View key={draft.id} style={styles.listRow}>
              <Workflow size={17} color={draft.status === 'activated' ? colors.success : colors.textMuted} />
              <View style={styles.listCopy}>
                <Text style={styles.listTitle}>{draft.name}</Text>
                <Text numberOfLines={2} style={styles.muted}>{draft.description}</Text>
              </View>
              {draft.status === 'draft' ? (
                <View style={styles.actionWrap}>
                  <ActionButton
                    label="Project"
                    disabled={loading || !!busy}
                    loading={busy === 'workflow.activate_draft'}
                    onPress={() => void perform('workflow.activate_draft', {
                      draftId: draft.id,
                      scope: 'project',
                    })}
                  />
                  <ActionButton
                    label="Personal"
                    disabled={loading || !!busy}
                    loading={busy === 'workflow.activate_draft'}
                    onPress={() => void perform('workflow.activate_draft', {
                      draftId: draft.id,
                      scope: 'personal',
                    })}
                  />
                </View>
              ) : (
                <Text style={styles.count}>{draft.activatedScope ?? 'active'}</Text>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function WorkflowDefinitionRow({ definition }: { definition: WorkflowDefinition }) {
  return (
    <View style={styles.listRow}>
      <Workflow size={17} color={colors.textMuted} />
      <View style={styles.listCopy}>
        <Text style={styles.listTitle}>{definition.name}</Text>
        <Text style={styles.muted}>{definition.description}</Text>
      </View>
      <Text style={styles.count}>{definition.stages.length}</Text>
    </View>
  );
}

export function TimeTravelView() {
  const { snapshot, inspect, sendCommand } = useControl();
  const [state, setState] = useState<TimeTravelState | null>(null);
  const [preview, setPreview] = useState<RewindPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { busy, error: commandError, run: runAction } = useGuardedAction();

  const refresh = useCallback(async () => {
    if (!snapshot.activeSessionId) return;
    setLoading(true);
    setError('');
    try {
      setState(await inspect<TimeTravelState>('timetravel.inspect'));
      setPreview(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load recorded states');
    } finally {
      setLoading(false);
    }
  }, [inspect, snapshot.activeSessionId]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const choose = async (entry: TimeTravelEntry) => {
    if (loading || busy || !entry.recoverable || entry.hash === state?.currentHash) return;
    setLoading(true);
    setError('');
    try {
      setPreview(await inspect<RewindPreview>('timetravel.preview', { hash: entry.hash }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview this state');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (loading || busy || !preview?.canTravel || !state?.currentHash || !snapshot.activeSessionId) return;
    await runAction('rewind', () => requireAccepted(sendCommand, 'timetravel.apply', {
        sessionId: snapshot.activeSessionId,
        hash: preview.targetHash,
        expectedCurrentHash: state.currentHash,
      }), () => router.replace('/workspace'));
  };

  if (preview) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        {commandError ? <Text accessibilityRole="alert" style={styles.error}>{commandError}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.card}>
          <FieldLabel title="Review rewind" detail={preview.description || preview.message} />
          {preview.filesChanged?.length ? (
            <Text style={styles.muted}>{preview.filesChanged.length} file{preview.filesChanged.length === 1 ? '' : 's'} changed</Text>
          ) : null}
          {preview.diff ? <Text selectable style={styles.code}>{preview.diff}</Text> : null}
          {preview.message ? <Text style={styles.warning}>{preview.message}</Text> : null}
          <View style={styles.actionWrap}>
            <ActionButton label="Keep current" icon={X} disabled={!!busy} onPress={() => setPreview(null)} />
            <ActionButton
              label="Rewind"
              icon={RotateCcw}
              primary
              disabled={!preview.canTravel || loading || !!busy}
              loading={busy === 'rewind'}
              onPress={() => void apply()}
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {commandError ? <Text accessibilityRole="alert" style={styles.error}>{commandError}</Text> : null}
      {state ? (
        <View style={styles.statRow}>
          <View style={styles.stat}><Text style={styles.statValue}>{state.stats.totalStates}</Text><Text style={styles.muted}>States</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>${state.stats.totalCost.toFixed(2)}</Text><Text style={styles.muted}>Recorded cost</Text></View>
        </View>
      ) : null}
      <View style={styles.card}>
        <FieldLabel title="Recorded states" detail="Open a state to inspect it before anything changes." />
        {state?.timeline.map((entry) => {
          const current = entry.hash === state.currentHash;
          return (
            <Pressable
              key={entry.hash}
              disabled={current || !entry.recoverable || loading || !!busy}
              onPress={() => void choose(entry)}
              style={({ pressed }) => [styles.timelineRow, current && styles.timelineCurrent, pressed && styles.pressed]}
            >
              {current ? <CheckCircle2 size={17} color={colors.success} /> : <Clock3 size={17} color={colors.textMuted} />}
              <View style={styles.listCopy}>
                <Text numberOfLines={2} style={styles.listTitle}>{entry.summary || entry.description}</Text>
                <Text style={styles.muted}>{new Date(entry.timestamp).toLocaleString()}{entry.model ? `  ${entry.model}` : ''}</Text>
              </View>
              {current ? <Text style={styles.currentLabel}>Current</Text> : null}
            </Pressable>
          );
        })}
        {!loading && !state?.timeline.length ? <Text style={styles.muted}>No recorded states yet</Text> : null}
        {loading && !state ? <Text style={styles.muted}>Loading…</Text> : null}
      </View>
    </ScrollView>
  );
}

const capabilities: ComputerCapability[] = [
  'discover',
  'observe',
  'interact',
  'manageWindows',
  'clipboardRead',
  'clipboardWrite',
  'transfer',
  'sensitive',
];
const capabilityNames: Record<ComputerCapability, string> = {
  discover: 'Discover apps',
  observe: 'Observe windows',
  interact: 'Click, type, keys and scroll',
  manageWindows: 'Focus windows',
  clipboardRead: 'Read clipboard',
  clipboardWrite: 'Write clipboard',
  transfer: 'Transfer files',
  sensitive: 'Sensitive actions',
};
const reservedCapabilities = new Set<ComputerCapability>(['clipboardRead', 'clipboardWrite', 'transfer', 'sensitive']);

function PermissionControl({
  value,
  disabled,
  onChange,
}: {
  value: ComputerPermission;
  disabled?: boolean;
  onChange: (value: ComputerPermission) => void;
}) {
  return (
    <View style={[styles.permissionRow, disabled && styles.disabled]}>
      {(['block', 'ask', 'allow'] as ComputerPermission[]).map((option) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{ selected: value === option, disabled }}
          disabled={disabled}
          onPress={() => onChange(option)}
          style={({ pressed }) => [styles.permissionChoice, value === option && styles.permissionChoiceActive, pressed && styles.pressed]}
        >
          <Text style={[styles.permissionText, value === option && styles.permissionTextActive]}>{option[0].toUpperCase() + option.slice(1)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ComputerUseView() {
  const { inspect, sendCommand } = useControl();
  const [data, setData] = useState<ComputerUseInspection | null>(null);
  const [tier, setTier] = useState<ComputerTier>('guarded');
  const [role, setRole] = useState<ComputerRole>('worker');
  const [selectedApp, setSelectedApp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { busy, error: commandError, run: runAction } = useGuardedAction();

  const load = useCallback(async (discover = false) => {
    setLoading(true);
    setError('');
    try {
      const next = await inspect<ComputerUseInspection>('computer.inspect', { discover });
      setData((current) => ({ ...next, targets: discover ? next.targets : current?.targets }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load computer controls');
    } finally {
      setLoading(false);
    }
  }, [inspect]);
  useEffect(() => {
    const timer = setTimeout(() => void load(false), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const save = async (settings: ComputerUseSettings, onAccepted?: () => void) => {
    if (!data || loading) return;
    // The previously optimistic update showed a permission as granted even
    // when the desktop rejected the request. Show only inspected host state.
    const accepted = await runAction('save', () => requireAccepted(sendCommand, 'computer.update', { settings }), onAccepted);
    if (accepted) await load(false);
  };

  const setTierPermission = (capability: ComputerCapability, permission: ComputerPermission) => {
    if (!data) return;
    void save({
      ...data.settings,
      byTier: {
        ...data.settings.byTier,
        [tier]: { ...data.settings.byTier[tier], [capability]: permission },
      },
    });
  };
  const setRolePermission = (capability: ComputerCapability, permission: ComputerPermission) => {
    if (!data) return;
    void save({
      ...data.settings,
      byRole: {
        ...data.settings.byRole,
        [role]: { ...data.settings.byRole[role], [capability]: permission },
      },
    });
  };
  const setAppPermission = (appId: string, capability: ComputerCapability, permission: ComputerPermission) => {
    if (!data) return;
    void save({
      ...data.settings,
      apps: data.settings.apps.map((app) => app.appId === appId
        ? { ...app, capabilities: { ...app.capabilities, [capability]: permission } }
        : app),
    });
  };

  const uniqueTargets = useMemo(() => {
    const map = new Map<string, ComputerTarget>();
    for (const target of data?.targets ?? []) if (!map.has(target.appId)) map.set(target.appId, target);
    return [...map.values()];
  }, [data?.targets]);

  const addApp = (target: ComputerTarget) => {
    if (!data || data.settings.apps.some((app) => app.appId === target.appId)) return;
    void save({
      ...data.settings,
      apps: [...data.settings.apps, { appId: target.appId, label: target.appId, capabilities: {} }],
    }, () => setSelectedApp(target.appId));
  };
  const removeApp = (app: ComputerAppPermission) => {
    if (!data) return;
    void save({ ...data.settings, apps: data.settings.apps.filter((item) => item.appId !== app.appId) }, () => {
      if (selectedApp === app.appId) setSelectedApp('');
    });
  };

  if (!data) {
    return <View style={styles.empty}><Text style={error || commandError ? styles.error : styles.muted}>{error || commandError || 'Loading…'}</Text></View>;
  }

  const app = data.settings.apps.find((item) => item.appId === selectedApp);
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {commandError ? <Text accessibilityRole="alert" style={styles.error}>{commandError}</Text> : null}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <View style={styles.cardTitleCopy}>
            <Text style={styles.cardTitle}>Computer use</Text>
            <Text style={styles.muted}>
              {data.status
                ? `${data.status.platform}  ${data.status.available ? 'Available' : 'Unavailable'}`
                : 'Platform status unavailable'}
            </Text>
          </View>
          <ChoiceRow
            value={data.settings.enabled ? 'on' : 'off'}
            disabled={loading || !!busy}
            options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
            onChange={(value) => void save({ ...data.settings, enabled: value === 'on' })}
          />
        </View>
        {data.status?.limitations?.map((item) => <Text key={item} style={styles.muted}>{item}</Text>)}
        <View style={styles.actionWrap}>
          <ActionButton label="Refresh status" icon={RefreshCw} disabled={!!busy} loading={loading} onPress={() => void load(false)} />
          <ActionButton label="Discover apps" icon={Monitor} disabled={!!busy} loading={loading} onPress={() => void load(true)} />
          {data.settings.enabled || (data.status?.pending ?? 0) > 0 ? (
            <ActionButton
              label="Stop computer actions"
              icon={CircleStop}
              danger
              disabled={loading || !!busy}
              loading={busy === 'stop'}
              onPress={() => {
                void (async () => {
                  const accepted = await runAction('stop', () => requireAccepted(sendCommand, 'computer.stop'));
                  if (accepted) await load(false);
                })();
              }}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <FieldLabel title="Permission preset policy" />
        <ChoiceRow
          value={tier}
          disabled={loading || !!busy}
          options={(['plan', 'ask', 'edits', 'guarded', 'yolo', 'custom'] as ComputerTier[]).map((value) => ({ value, label: value === 'yolo' ? 'YOLO' : value[0].toUpperCase() + value.slice(1) }))}
          onChange={(value) => setTier(value as ComputerTier)}
        />
        {capabilities.map((capability) => (
          <View key={capability} style={styles.policyRow}>
            <Text style={styles.policyLabel}>{capabilityNames[capability]}</Text>
            <PermissionControl
              value={reservedCapabilities.has(capability) ? 'block' : data.settings.byTier[tier][capability]}
              disabled={reservedCapabilities.has(capability) || loading || !!busy}
              onChange={(permission) => setTierPermission(capability, permission)}
            />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <FieldLabel title="Agent role policy" />
        <ChoiceRow
          value={role}
          disabled={loading || !!busy}
          options={(['manager', 'worker', 'critic'] as ComputerRole[]).map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
          onChange={(value) => setRole(value as ComputerRole)}
        />
        {capabilities.map((capability) => (
          <View key={capability} style={styles.policyRow}>
            <Text style={styles.policyLabel}>{capabilityNames[capability]}</Text>
            <PermissionControl
              value={reservedCapabilities.has(capability) ? 'block' : data.settings.byRole[role][capability]}
              disabled={reservedCapabilities.has(capability) || loading || !!busy}
              onChange={(permission) => setRolePermission(capability, permission)}
            />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <FieldLabel title="Apps" detail="Discover a running app, add it, then grant only the capabilities it needs." />
        {uniqueTargets.map((target) => {
          const added = data.settings.apps.some((item) => item.appId === target.appId);
          return (
            <View key={target.appId} style={styles.listRow}>
              <View style={styles.listCopy}>
                <Text numberOfLines={1} style={styles.listTitle}>{target.appId}</Text>
                <Text numberOfLines={1} style={styles.muted}>{target.title}</Text>
              </View>
              <ActionButton label={added ? 'Added' : 'Add'} icon={Plus} disabled={added || loading || !!busy} onPress={() => addApp(target)} />
            </View>
          );
        })}
        {data.settings.apps.map((item) => (
          <Pressable
            key={item.appId}
            onPress={() => setSelectedApp(selectedApp === item.appId ? '' : item.appId)}
            style={({ pressed }) => [styles.appRow, selectedApp === item.appId && styles.appRowActive, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={styles.listTitle}>{item.label || item.appId}</Text>
            <Text style={styles.muted}>{selectedApp === item.appId ? 'Hide' : 'Permissions'}</Text>
          </Pressable>
        ))}
        {app ? (
          <View style={styles.appPolicy}>
            {capabilities.map((capability) => (
              <View key={capability} style={styles.policyRow}>
                <Text style={styles.policyLabel}>{capabilityNames[capability]}</Text>
                <PermissionControl
                  value={reservedCapabilities.has(capability) ? 'block' : app.capabilities[capability] ?? 'block'}
                  disabled={reservedCapabilities.has(capability) || loading || !!busy}
                  onChange={(permission) => setAppPermission(app.appId, capability, permission)}
                />
              </View>
            ))}
            <ActionButton label="Remove app" icon={Trash2} danger disabled={loading || !!busy} onPress={() => removeApp(app)} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.md,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    padding: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: { gap: 3 },
  fieldTitle: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' },
  fieldDetail: { color: colors.textMuted, fontSize: typography.xs, lineHeight: 17 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    fontSize: typography.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  choiceRow: { gap: spacing.xs, alignItems: 'center' },
  choice: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: 18,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceActive: { backgroundColor: colors.accentSoft },
  choiceText: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '600' },
  choiceTextActive: { color: colors.accent, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: typography.xs, lineHeight: 17 },
  error: { color: colors.error, fontSize: typography.sm, lineHeight: 18 },
  warning: { color: colors.warning, fontSize: typography.xs, lineHeight: 17 },
  actionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitleCopy: { flex: 1, minWidth: 0, gap: 3 },
  cardTitle: { color: colors.textPrimary, fontSize: typography.base, fontWeight: '800' },
  stageList: { gap: spacing.xs },
  stageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 4 },
  stageCopy: { flex: 1, minWidth: 0, gap: 2 },
  stageTitle: { color: colors.textMuted, fontSize: typography.sm, fontWeight: '600' },
  stageTitleActive: { color: colors.textPrimary },
  listRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  listCopy: { flex: 1, minWidth: 0, gap: 2 },
  listTitle: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '700' },
  count: { color: colors.textMuted, fontSize: typography.xs, fontVariant: ['tabular-nums'] },
  statRow: { flexDirection: 'row', gap: spacing.xs },
  stat: { flex: 1, minHeight: 72, borderRadius: radii.lg, backgroundColor: colors.surface2, padding: spacing.md, justifyContent: 'center' },
  statValue: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timelineRow: { minHeight: 62, borderRadius: radii.lg, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timelineCurrent: { backgroundColor: colors.surface3 },
  currentLabel: { color: colors.success, fontSize: 10, fontWeight: '800' },
  code: { color: colors.textSecondary, backgroundColor: colors.surface0, borderRadius: radii.lg, padding: spacing.sm, fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
  permissionRow: { flexDirection: 'row', gap: 3 },
  permissionChoice: { minHeight: 32, minWidth: 54, paddingHorizontal: 7, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface3 },
  permissionChoiceActive: { backgroundColor: colors.accentSoft },
  permissionText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  permissionTextActive: { color: colors.accent },
  policyRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  policyLabel: { flex: 1, minWidth: 0, color: colors.textSecondary, fontSize: typography.xs, fontWeight: '600' },
  appRow: { minHeight: 50, borderRadius: radii.lg, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  appRowActive: { backgroundColor: colors.surface3 },
  appPolicy: { paddingTop: spacing.xs, gap: spacing.xs },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.65 },
});
