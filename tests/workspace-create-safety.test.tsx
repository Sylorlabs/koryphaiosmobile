import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_WORKSPACE_CREATE_CHILD !== '1') {
  test('Workspace Goal and Checklist creation retains drafts and prevents uncertain duplicate requests', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_WORKSPACE_CREATE_CHILD: '1' },
      encoding: 'utf8', timeout: 30_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Workspace create checks failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
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

  const saved = new Map<string, { label: string }>();
  let failRead = false;
  let failSave = false;
  let failClear = false;
  let deferredSave: Promise<void> | null = null;
  mock.module('../src/control/workspaceCreationReviewStorage', () => ({
    workspaceCreationReviewStorage: {
      load: async (key: string) => {
        if (failRead) throw new Error('secure read unavailable');
        return saved.get(key) ?? null;
      },
      save: async (key: string, item: { label: string }) => {
        if (failSave) throw new Error('secure write unavailable');
        if (deferredSave) await deferredSave;
        saved.set(key, item);
      },
      clear: async (key: string) => {
        if (failClear) throw new Error('secure clear unavailable');
        saved.delete(key);
      },
    },
  }));

  type Sent = {
    command: string;
    payload?: Record<string, unknown>;
    resolve: (result: { accepted: boolean; data?: { id?: string } }) => void;
    reject: (error: Error) => void;
  };
  const sent: Sent[] = [];
  let counter = 0;
  const snapshot = {
    machine: { id: 'host-0', status: 'online' },
    activeProjectId: 'project-a', activeSessionId: 'session-a',
    goals: [] as any[], checklists: [] as any[], agents: [],
    git: { isRepo: false },
  };
  const control = {
    snapshot, error: '',
    sendCommand: (command: string, payload?: Record<string, unknown>) => new Promise<{ accepted: boolean; data?: { id?: string } }>((resolve, reject) => {
      sent.push({ command, payload, resolve, reject });
    }),
  };
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));

  const { WorkspaceControlPanel } = await import('../src/components/WorkspaceControls');
  let tree: TestRenderer.ReactTestRenderer | null = null;
  const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
  const render = async (kind: 'goals' | 'checklists') => {
    await act(async () => {
      const view = <WorkspaceControlPanel kind={kind} onClose={() => {}} />;
      if (tree) tree.update(view);
      else tree = TestRenderer.create(view);
      await flush();
    });
  };
  const input = (placeholder: string) => tree!.root.findAll((node) =>
    node.type === 'TextInput' && node.props.placeholder === placeholder)[0];
  const action = (label: string) => tree!.root.findAll((node) =>
    node.type === 'ActionButton' && node.props.label === label)[0];
  const textOf = (node: TestRenderer.ReactTestInstance): string =>
    node.children.map((child) => typeof child === 'string' ? child : textOf(child)).join('');
  const screenText = () => tree!.root.findAllByType('Text' as any).map(textOf).join(' ');
  const typeText = async (placeholder: string, text: string) => {
    await act(async () => { input(placeholder).props.onChangeText(text); await flush(); });
  };
  const press = async (label: string) => {
    expect(action(label)).toBeDefined();
    await act(async () => { action(label).props.onPress(); await flush(); });
  };
  const settle = async (index: number, result?: { accepted: boolean; data?: { id?: string } }, error?: Error) => {
    await act(async () => {
      if (error) sent[index].reject(error);
      else sent[index].resolve(result ?? { accepted: true });
      await flush();
    });
  };
  const newHost = () => {
    snapshot.machine.id = `host-${++counter}`;
    snapshot.activeProjectId = 'project-a';
    snapshot.activeSessionId = 'session-a';
    snapshot.goals = [];
    snapshot.checklists = [];
  };
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = null;
    sent.length = 0;
    failRead = failSave = failClear = false;
    deferredSave = null;
    newHost();
  });

  test('a lost Goal creation result retains its text, immediately blocks duplicates, and survives screen remount', async () => {
    await render('goals');
    await typeText('New goal objective', 'Audit each connection');
    await press('Create');
    await press('Create');
    expect(sent).toHaveLength(1);
    expect(input('New goal objective').props.value).toBe('Audit each connection');
    await settle(0, undefined, new Error('Network reply lost'));
    expect(screenText()).toContain('desktop');
    expect(action('Create')?.props.disabled).toBe(true);
    await act(async () => { tree!.unmount(); tree = null; });
    await render('goals');
    expect(action('Create')?.props.disabled).toBe(true);
    expect(input('New goal objective').props.value).toBe('Audit each connection');
  });

  test('Checklist requires exact created ID in a host snapshot before clearing the draft or unlocking another create', async () => {
    await render('checklists');
    await typeText('Checklist title', 'Launch checklist');
    await press('Create');
    expect(input('Checklist title').props.value).toBe('Launch checklist');
    await settle(0, { accepted: true, data: { id: 'new-list' } });
    expect(action('Create')?.props.disabled).toBe(true);
    expect(input('Checklist title').props.value).toBe('Launch checklist');
    snapshot.checklists = [{ id: 'wrong-list', title: 'Launch checklist', scope: 'session', sessionId: 'session-a', items: [], updatedAt: 1 }];
    await render('checklists');
    expect(action('Create')?.props.disabled).toBe(true);
    snapshot.checklists = [{ id: 'new-list', title: 'Launch checklist', scope: 'session', sessionId: 'session-a', items: [], updatedAt: 2 }];
    await render('checklists');
    expect(input('Checklist title').props.value).toBe('');
    expect(action('Create')?.props.disabled).toBe(true); // no new text
    await typeText('Checklist title', 'Follow-up checklist');
    expect(action('Create')?.props.disabled).toBe(false);
  });

  test('accepted creation without an ID stays review-locked; a user can deliberately unlock after desktop review', async () => {
    await render('goals');
    await typeText('New goal objective', 'Plan architecture');
    await press('Create');
    await settle(0, { accepted: true });
    expect(input('New goal objective').props.value).toBe('Plan architecture');
    expect(action('Create')?.props.disabled).toBe(true);
    await press('Reviewed desktop — allow another');
    expect(action('Create')?.props.disabled).toBe(false);
    expect(input('New goal objective').props.value).toBe('Plan architecture');
  });

  test('changing hosts never sends an old pending Goal to the new host, or unlocks the original host', async () => {
    await render('goals');
    await typeText('New goal objective', 'Host A goal');
    await press('Create');
    expect(sent).toHaveLength(1);
    snapshot.machine.id = 'host-B';
    await render('goals');
    await typeText('New goal objective', 'Host B goal');
    await press('Create');
    expect(sent).toHaveLength(2);
    expect(sent[1].payload).toEqual({ objective: 'Host B goal', scope: 'session' });
    await settle(0, { accepted: true, data: { id: 'a-goal' } });
    expect(input('New goal objective').props.value).toBe('Host B goal');
    snapshot.machine.id = `host-${counter}`;
    await render('goals');
    expect(action('Create')?.props.disabled).toBe(true);
    expect(input('New goal objective').props.value).toBe('Host A goal');
    await settle(1, undefined, new Error('Dropped host B acknowledgement'));
  });

  test('secure storage failures fail closed before any remote create command', async () => {
    failRead = true;
    await render('checklists');
    await typeText('Checklist title', 'Storage unavailable');
    expect(action('Create')?.props.disabled).toBe(true);
    expect(sent).toHaveLength(0);
  });

  test('pending secure review write reserves the Create button before any host command', async () => {
    let finishSave!: () => void;
    deferredSave = new Promise<void>((resolve) => { finishSave = resolve; });
    await render('goals');
    await typeText('New goal objective', 'Preserve this goal');
    await press('Create');
    expect(sent).toHaveLength(0);
    expect(action('Create')?.props.disabled).toBe(true);
    await act(async () => { finishSave(); await flush(); });
    expect(sent).toHaveLength(1);
    await settle(0, undefined, new Error('Reply timed out'));
  });

  test('an edit made after sending a Goal remains untouched when the original creation is verified', async () => {
    await render('goals');
    await typeText('New goal objective', 'Original goal');
    await press('Create');
    await typeText('New goal objective', 'Next goal draft');
    await settle(0, { accepted: true, data: { id: 'goal-original' } });
    snapshot.goals = [{
      id: 'goal-original', objective: 'Original goal', scope: 'session', sessionId: 'session-a',
      status: 'queued', priority: 1, checklist: [],
    }];
    await render('goals');
    expect(input('New goal objective').props.value).toBe('Next goal draft');
    expect(action('Create')?.props.disabled).toBe(false);
  });

  test('slow Keychain write followed by a chat switch cannot dispatch in the wrong chat', async () => {
    let finishSave!: () => void;
    deferredSave = new Promise<void>((resolve) => { finishSave = resolve; });
    await render('checklists');
    await typeText('Checklist title', 'Scoped checklist');
    await press('Create');
    snapshot.activeSessionId = 'session-b';
    await render('checklists');
    await act(async () => { finishSave(); await flush(); });
    expect(sent).toHaveLength(0);
    expect(action('Create')?.props.disabled).toBe(true);
    expect(input('Checklist title').props.value).toBe('Scoped checklist');
  });

  test('failed secure write never sends Goal creation and keeps its review lock', async () => {
    failSave = true;
    await render('goals');
    await typeText('New goal objective', 'Never send unprotected');
    await press('Create');
    expect(sent).toHaveLength(0);
    expect(input('New goal objective').props.value).toBe('Never send unprotected');
    expect(action('Create')?.props.disabled).toBe(true);
  });

  test('previously saved review restores the draft after a cold-start-like remount', async () => {
    saved.set(`workspace-create\u0000${snapshot.machine.id}\u0000goal`, { label: 'Create goal: Unsure if created' });
    await render('goals');
    expect(input('New goal objective').props.value).toBe('Unsure if created');
    expect(action('Create')?.props.disabled).toBe(true);
    failClear = true;
    await press('Reviewed desktop — allow another');
    expect(action('Create')?.props.disabled).toBe(true);
    expect(screenText()).toContain('Could not clear');
  });
}
