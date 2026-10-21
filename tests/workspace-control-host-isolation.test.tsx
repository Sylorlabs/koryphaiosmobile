import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_WORKSPACE_HOST_CHILD !== '1') {
  test('Goals, Checklists and Git controls isolate confirmations across hosts and chats', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_WORKSPACE_HOST_CHILD: '1' },
      encoding: 'utf8', timeout: 25_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Workspace host isolation failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 30_000);
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
    workspaceCreationReviewStorage: {
      load: async () => null, save: async () => {}, clear: async () => {},
    },
  }));
  mock.module('../src/control/workspaceDeletionReviewStorage', () => ({
    workspaceDeletionReviewStorage: {
      load: async () => null, save: async () => {}, clear: async () => {},
    },
  }));

  const sent: { command: string; data?: Record<string, unknown> }[] = [];
  const goal = {
    id: 'same-goal', scope: 'workspace', status: 'queued', priority: 1,
    objective: 'Shared identifier', checklist: [],
  };
  const checklist = {
    id: 'same-list', title: 'Shared identifier', scope: 'workspace', updatedAt: 1,
    items: [],
  };
  const git = {
    isRepo: true, writeReady: true, branch: 'main', branches: ['main'],
    ahead: 0, behind: 0, remote: 'https://example.invalid/source.git', conflicts: [],
    status: [{ path: 'src/common.ts', status: 'modified', staged: false }],
    worktrees: {
      active: [], availableSlots: 1, maxAllowed: 1,
      pendingResolutions: [{ taskId: 'task-1', taskName: 'Fix', reason: 'needs review', branchName: 'agent-1', conflicts: [] }],
    },
  };
  const snapshot = {
    machine: { id: 'host-A', status: 'online' }, activeProjectId: 'project-1', activeSessionId: 'chat-1',
    goals: [goal], checklists: [checklist], agents: [], git,
  };
  const control = {
    snapshot, pairing: { machineId: 'host-A', baseUrl: 'https://host-A.invalid' }, error: '',
    sendCommand: async (command: string, data?: Record<string, unknown>) => {
      sent.push({ command, data });
      return { accepted: true };
    },
    inspect: async () => ({}),
  };
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));

  const { WorkspaceControlPanel } = await import('../src/components/WorkspaceControls');
  let tree: TestRenderer.ReactTestRenderer | null = null;
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const render = async (kind: 'goals' | 'checklists' | 'git') => {
    await act(async () => {
      const next = <WorkspaceControlPanel kind={kind} onClose={() => {}} />;
      if (tree) tree.update(next);
      else tree = TestRenderer.create(next);
      await flush();
    });
  };
  const action = (label: string) => tree!.root.findAll((node) =>
    node.type === 'ActionButton' && node.props.label === label)[0];
  const press = async (label: string) => {
    expect(action(label)).toBeDefined();
    await act(async () => { action(label).props.onPress(); await flush(); });
  };
  const input = (placeholder: string) => tree!.root.findAll((node) =>
    node.type === 'TextInput' && node.props.placeholder === placeholder)[0];
  const textOf = (node: TestRenderer.ReactTestInstance): string =>
    node.children.map((child) => typeof child === 'string' ? child : textOf(child)).join('');
  const changeHost = async (name: string, kind: 'goals' | 'checklists' | 'git', session = 'chat-1') => {
    snapshot.machine.id = name;
    control.pairing.machineId = name;
    control.pairing.baseUrl = `https://${name}.invalid`;
    snapshot.activeSessionId = session;
    await render(kind);
  };
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = null;
    sent.length = 0;
    snapshot.machine.id = 'host-A';
    control.pairing.machineId = 'host-A';
    control.pairing.baseUrl = 'https://host-A.invalid';
    snapshot.activeSessionId = 'chat-1';
  });

  test('Goal delete confirmation armed on A never confirms on B, or when switching back to A', async () => {
    await render('goals');
    await press('Delete');
    expect(action('Confirm delete')).toBeDefined();
    await changeHost('host-B', 'goals');
    expect(Boolean(action('Confirm delete'))).toBe(false);
    await press('Delete');
    expect(sent).toHaveLength(0);
    await changeHost('host-A', 'goals');
    expect(Boolean(action('Confirm delete'))).toBe(false);
  });

  test('Checklist delete confirmation is scoped to the current host and chat', async () => {
    await render('checklists');
    await press('Delete');
    expect(action('Confirm delete')).toBeDefined();
    await changeHost('host-B', 'checklists');
    expect(Boolean(action('Confirm delete'))).toBe(false);
    await press('Delete');
    expect(sent).toHaveLength(0);
    await changeHost('host-A', 'checklists', 'chat-2');
    expect(Boolean(action('Confirm delete'))).toBe(false);
  });

  test('Git restore and discard confirmations never carry across a host or chat selection', async () => {
    await render('git');
    await press('Restore');
    expect(action('Confirm')).toBeDefined();
    await press('Discard');
    expect(action('Confirm discard')).toBeDefined();
    await changeHost('host-B', 'git');
    expect(Boolean(action('Confirm'))).toBe(false);
    expect(Boolean(action('Confirm discard'))).toBe(false);
    await press('Restore');
    await press('Discard');
    expect(sent).toHaveLength(0);
    await changeHost('host-A', 'git', 'chat-2');
    expect(Boolean(action('Confirm'))).toBe(false);
    expect(Boolean(action('Confirm discard'))).toBe(false);
  });

  test('pending Git remote URL draft is never copied into another host', async () => {
    await render('git');
    await act(async () => { input('https://github.com/owner/repo.git').props.onChangeText('https://example.invalid/A.git'); });
    await changeHost('host-B', 'git');
    expect(input('https://github.com/owner/repo.git').props.value).toBe(git.remote);
    await changeHost('host-A', 'git');
    expect(input('https://github.com/owner/repo.git').props.value).toBe('https://example.invalid/A.git');
    expect(sent).toHaveLength(0);
  });

  test('unsent Goal checklist text stays tied to its originating host and goal', async () => {
    await render('goals');
    const expand = async () => {
      const node = tree!.root.findAll((entry) => entry.type === 'Pressable' &&
        entry.props.accessibilityLabel === 'Expand goal: Shared identifier')[0];
      expect(node).toBeDefined();
      await act(async () => { node.props.onPress(); await flush(); });
    };
    await expand();
    await act(async () => { input('Add a check').props.onChangeText('Review A goal'); });
    await changeHost('host-B', 'goals');
    await expand();
    expect(input('Add a check').props.value).toBe('');
    await changeHost('host-A', 'goals');
    await expand();
    expect(input('Add a check').props.value).toBe('Review A goal');
    expect(sent).toHaveLength(0);
  });

  test('an unsubmitted Checklist title and item return to the original host', async () => {
    await render('checklists');
    const originalTitle = tree!.root.findAll((node) => node.type === 'TextInput' &&
      node.props.value === checklist.title)[0];
    await act(async () => { originalTitle.props.onChangeText('Changed on A'); });
    await act(async () => { input('Add an item').props.onChangeText('Draft on A'); });
    await changeHost('host-B', 'checklists');
    expect(input('Add an item').props.value).toBe('');
    expect(tree!.root.findAll((node) => node.type === 'TextInput' && node.props.value === 'Changed on A')).toHaveLength(0);
    await changeHost('host-A', 'checklists');
    const restoredTitle = tree!.root.findAll((node) => node.type === 'TextInput' &&
      node.props.value === 'Changed on A')[0];
    expect(restoredTitle).toBeDefined();
    expect(input('Add an item').props.value).toBe('Draft on A');
  });
}
