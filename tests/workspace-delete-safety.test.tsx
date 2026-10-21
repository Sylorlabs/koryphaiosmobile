import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

// Keep mocks of native modules isolated from other test files.
if (process.env.KORY_WORKSPACE_DELETE_CHILD !== '1') {
  test('Goal and Checklist deletion survives uncertain replies, host switches, and restart', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_WORKSPACE_DELETE_CHILD: '1' },
      encoding: 'utf8', timeout: 30_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Workspace deletion safety failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 35_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.module('react-native', () => ({
    Appearance: { getColorScheme: () => 'dark' },
    Linking: { openURL: async () => {} },
    Pressable: 'Pressable', Text: 'Text', View: 'View', TextInput: 'TextInput', ScrollView: 'ScrollView',
    StyleSheet: { create: (styles: unknown) => styles },
  }));
  mock.module('lucide-react-native', () => Object.fromEntries([
    'Archive', 'ArrowDown', 'ArrowUp', 'Check', 'CheckCircle2', 'Circle',
    'CirclePause', 'CirclePlay', 'GitBranch', 'ListChecks', 'Merge', 'Plus',
    'RefreshCw', 'RotateCcw', 'SkipForward', 'Target', 'Trash2', 'X',
  ].map((name) => [name, name])));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
    Eyebrow: (props: Record<string, unknown>) => React.createElement('Eyebrow', props),
    ProgressBar: () => React.createElement('ProgressBar'),
  }));
  mock.module('../src/control/workspaceCreationReviewStorage', () => ({
    workspaceCreationReviewStorage: { load: async () => null, save: async () => {}, clear: async () => {} },
  }));

  const saved = new Map<string, { label: string }>();
  let failRead = false;
  let failWrite = false;
  let failClear = false;
  let deferredSave: Promise<void> | null = null;
  mock.module('../src/control/workspaceDeletionReviewStorage', () => ({
    workspaceDeletionReviewStorage: {
      load: async (key: string) => {
        if (failRead) throw new Error('Keychain unavailable');
        return saved.get(key) ?? null;
      },
      save: async (key: string, value: { label: string }) => {
        if (failWrite) throw new Error('Keychain write failed');
        if (deferredSave) await deferredSave;
        saved.set(key, value);
      },
      clear: async (key: string) => {
        if (failClear) throw new Error('Keychain clear failed');
        saved.delete(key);
      },
    },
  }));

  const goal = { id: 'item-goal', objective: 'Critical work', status: 'running', scope: 'workspace', priority: 1, checklist: [] };
  const checklist = { id: 'item-checklist', title: 'Launch tasks', scope: 'workspace', items: [], updatedAt: 1 };
  const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
  let testHost = 0;
  let rejection: Error | null = null;
  const control = {
    pairing: { baseUrl: 'https://host-a.invalid', machineId: 'host-A' },
    snapshot: {
      machine: { id: 'host-A', status: 'online' }, activeProjectId: 'project', activeSessionId: 'chat',
      goals: [goal], checklists: [checklist], agents: [], git: {},
    },
    error: '',
    sendCommand: async (command: string, payload?: Record<string, unknown>) => {
      sent.push({ command, payload });
      if (rejection) throw rejection;
      return { accepted: true };
    },
  };
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));

  const { WorkspaceControlPanel } = await import('../src/components/WorkspaceControls');
  let tree: TestRenderer.ReactTestRenderer | null = null;
  const flush = async () => { for (let i = 0; i < 22; i++) await Promise.resolve(); };
  const render = async (kind: 'goals' | 'checklists') => {
    await act(async () => {
      const view = <WorkspaceControlPanel kind={kind} onClose={() => {}} />;
      if (tree) tree.update(view);
      else tree = TestRenderer.create(view);
      await flush();
    });
  };
  const action = (label: string) => tree!.root.findAll((node) =>
    node.type === 'ActionButton' && node.props.label === label)[0];
  const textOf = (node: TestRenderer.ReactTestInstance): string =>
    node.children.map((child) => typeof child === 'string' ? child : textOf(child)).join('');
  const screenText = () => tree!.root.findAll((node) => node.type === 'Text').map(textOf).join(' ');
  const press = async (label: string) => {
    expect(action(label)).toBeDefined();
    await act(async () => { action(label).props.onPress(); await flush(); });
  };
  const switchHost = async (name: string) => {
    control.pairing.machineId = name;
    control.pairing.baseUrl = `https://${name}.invalid`;
    control.snapshot = { ...control.snapshot, machine: { id: name, status: 'online' } };
  };
  const deleteKey = (kind: 'goal' | 'checklist') => JSON.stringify([
    'workspace.delete', control.pairing.baseUrl, control.pairing.machineId, control.snapshot.machine.id, kind,
  ]);
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = null;
    sent.length = 0;
    saved.clear();
    rejection = null;
    failRead = failWrite = failClear = false;
    deferredSave = null;
    // The production registry intentionally survives remounts; give each
    // scenario an isolated machine so uncertain locks cannot cross tests.
    await switchHost(`test-host-${++testHost}`);
    control.snapshot = { ...control.snapshot, goals: [goal], checklists: [checklist], activeSessionId: 'chat' };
  });

  test('an accepted Goal delete without fresh host absence cannot run twice, including after remount', async () => {
    await render('goals');
    await press('Delete');
    await press('Confirm delete');
    expect(sent).toEqual([{ command: 'goal.delete', payload: { goalId: goal.id } }]);
    await act(async () => { tree!.unmount(); tree = null; });
    await render('goals');
    expect(action('Delete')?.props.disabled).toBe(true);
    expect(screenText()).toContain('desktop');
    expect(saved.size).toBe(1);
  });

  test('a lost Checklist deletion reply remains locked and preserves the original item identity', async () => {
    rejection = new Error('Remote response lost after deletion');
    await render('checklists');
    await press('Delete');
    await press('Confirm delete');
    expect(sent).toEqual([{ command: 'checklist.delete', payload: { checklistId: checklist.id } }]);
    expect(action('Delete')?.props.disabled).toBe(true);
    expect(saved.get(deleteKey('checklist'))?.label).toContain(checklist.id);
    await act(async () => { tree!.unmount(); tree = null; });
    await render('checklists');
    expect(action('Delete')?.props.disabled).toBe(true);
    expect(sent).toHaveLength(1);
  });

  test('a fresh online snapshot showing the exact Checklist absent releases the lock', async () => {
    await render('checklists');
    await press('Delete');
    await press('Confirm delete');
    expect(action('Delete')?.props.disabled).toBe(true);
    // A refresh reporting another item under the same name does not prove an exact ID is gone unless the target is absent.
    control.snapshot = { ...control.snapshot, checklists: [checklist] };
    await render('checklists');
    expect(action('Delete')?.props.disabled).toBe(true);
    control.snapshot = { ...control.snapshot, checklists: [] };
    await render('checklists');
    expect(saved.size).toBe(0);
    control.snapshot = { ...control.snapshot, checklists: [{ ...checklist, id: 'new-item' }] };
    await render('checklists');
    expect(action('Delete')?.props.disabled).toBe(false);
  });

  test('offline or different-chat snapshots cannot clear the pending Goal deletion', async () => {
    await render('goals');
    await press('Delete');
    await press('Confirm delete');
    control.snapshot = { ...control.snapshot, machine: { ...control.snapshot.machine, status: 'offline' }, goals: [] };
    await render('goals');
    expect(saved.size).toBe(1);
    control.snapshot = { ...control.snapshot, machine: { ...control.snapshot.machine, status: 'online' }, activeSessionId: 'other-chat' };
    await render('goals');
    expect(saved.size).toBe(1);
    control.snapshot = { ...control.snapshot, activeSessionId: 'chat' };
    await render('goals');
    // A context change remounts the control; the lock remains until the user
    // reviews the host or a still-mounted accepted request is reconciled.
    expect(saved.size).toBe(1);
  });

  test('an old host deletion never dispatches on B, nor becomes replayable upon returning to A', async () => {
    const originalHost = control.snapshot.machine.id;
    await render('goals');
    await press('Delete');
    await press('Confirm delete');
    await switchHost('host-B');
    await render('goals');
    expect(action('Delete')?.props.disabled).toBe(false);
    await switchHost(originalHost);
    await render('goals');
    expect(action('Delete')?.props.disabled).toBe(true);
    expect(sent).toHaveLength(1);
  });

  test('storage read and write failure fail closed before a Checklist delete request', async () => {
    failRead = true;
    await render('checklists');
    expect(action('Delete')?.props.disabled).toBe(true);
    expect(sent).toHaveLength(0);
    await act(async () => { tree!.unmount(); tree = null; });
    failRead = false;
    failWrite = true;
    await render('goals');
    expect(screenText()).toContain('Critical work');
    expect(action('Delete')?.props.disabled).toBe(false);
    await press('Delete');
    await press('Confirm delete');
    expect(sent).toHaveLength(0);
    expect(action('Delete')?.props.disabled).toBe(true);
  });

  test('a pending Keychain write followed by host switch never sends deletion to another host', async () => {
    const originalHost = control.snapshot.machine.id;
    let resume!: () => void;
    deferredSave = new Promise<void>((resolve) => { resume = resolve; });
    await render('checklists');
    await press('Delete');
    await press('Confirm delete');
    expect(sent).toHaveLength(0);
    await switchHost('host-B');
    await render('checklists');
    await act(async () => { resume(); await flush(); });
    expect(sent).toHaveLength(0);
    await switchHost(originalHost);
    await render('checklists');
    expect(action('Delete')?.props.disabled).toBe(true);
  });

  test('a prior saved deletion can be reviewed and unlocked with explicit desktop review', async () => {
    const key = deleteKey('goal');
    saved.set(key, { label: `Delete goal ${goal.id}: Critical work` });
    await render('goals');
    expect(action('Delete')?.props.disabled).toBe(true);
    await press('Reviewed desktop — allow deletes');
    expect(saved.size).toBe(0);
    expect(action('Delete')?.props.disabled).toBe(false);
  });

  test('storage clear failure preserves the irreversible-action lock', async () => {
    const key = deleteKey('checklist');
    saved.set(key, { label: `Delete checklist ${checklist.id}: Launch tasks` });
    await render('checklists');
    failClear = true;
    await press('Reviewed desktop — allow deletes');
    expect(action('Delete')?.props.disabled).toBe(true);
    expect(saved.size).toBe(1);
  });
}
