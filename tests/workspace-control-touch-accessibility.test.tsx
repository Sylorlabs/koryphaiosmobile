import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_WORKSPACE_TOUCH_CHILD !== '1') {
  test('workspace goal, checklist and Git actions are accessible on compact iPhone and iPad', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_WORKSPACE_TOUCH_CHILD: '1' },
      encoding: 'utf8', timeout: 25_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Workspace touch accessibility failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
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

  const sent: { command: string; data?: Record<string, unknown> }[] = [];
  const goal = {
    id: 'g-1', scope: 'session', sessionId: 'chat-1', status: 'pending', priority: 1,
    objective: 'Review build', checklist: [{ id: 'gcheck-1', title: 'Check dependencies', status: 'pending', dependsOn: [] }],
  };
  const checklist = {
    id: 'list-1', title: 'Launch checklist', scope: 'session', sessionId: 'chat-1', updatedAt: 1,
    items: [{ id: 'item-1', title: 'Publish binaries', status: 'pending' }],
  };
  const git = {
    isRepo: true, writeReady: true, branch: 'main', branches: ['main', 'feature/a11y'],
    ahead: 0, behind: 0, remote: '', conflicts: [], status: [
      { path: 'source.ts', status: 'modified', staged: false },
    ],
    worktrees: { availableSlots: 2, maxAllowed: 2, active: [], pendingResolutions: [] },
  };
  const snapshot = {
    machine: { id: 'unpaired' },
    activeProjectId: 'project-1', activeSessionId: 'chat-1', goals: [goal], checklists: [checklist],
    agents: [], git,
  };
  const control = {
    snapshot, error: '',
    inspect: async (command: string) => command === 'git.inspect_file'
      ? { file: 'source.ts', diff: '+new code' } : {},
    sendCommand: async (command: string, data?: Record<string, unknown>) => {
      sent.push({ command, data });
      return { accepted: true };
    },
  };
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));

  const { WorkspaceControlPanel } = await import('../src/components/WorkspaceControls');
  let tree: TestRenderer.ReactTestRenderer | null = null;
  const render = async (kind: 'goals' | 'checklists' | 'git') => {
    await act(async () => {
      if (tree) tree.update(<WorkspaceControlPanel kind={kind} onClose={() => sent.push({ command: 'close' })} />);
      else tree = TestRenderer.create(<WorkspaceControlPanel kind={kind} onClose={() => sent.push({ command: 'close' })} />);
    });
  };
  const button = (label: string) => tree!.root.findAll((node) =>
    node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
  const textOf = (node: TestRenderer.ReactTestInstance): string =>
    node.children.map((child) => typeof child === 'string' ? child : textOf(child)).join('');
  const tap = async (node: TestRenderer.ReactTestInstance) => {
    await act(async () => { node.props.onPress(); });
  };
  const target = (label: string) => {
    const node = button(label);
    expect(node).toBeDefined();
    expect(node.props.accessibilityRole).toBe('button');
    const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style;
    expect(style.width ?? style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.height ?? style.minHeight).toBeGreaterThanOrEqual(44);
    return node;
  };

  afterEach(async () => {
    if (tree) await act(async () => { tree!.unmount(); });
    tree = null;
    sent.length = 0;
  });

  test('goal and checklist icon actions describe their effect and retain their command contract', async () => {
    await render('goals');
    const goalHeading = tree!.root.findAll((node) => node.type === 'Pressable' &&
      textOf(node).includes('Review build'))[0];
    await tap(goalHeading);
    await tap(target('Remove goal check: Check dependencies'));
    expect(sent).toEqual([{ command: 'goal.checklist.update', data: { goalId: 'g-1', items: [] } }]);

    await render('checklists');
    await tap(target('Mark Publish binaries done'));
    await tap(target('Skip Publish binaries'));
    await tap(target('Remove checklist item: Publish binaries'));
    expect(sent.slice(1)).toEqual([
      { command: 'checklist.item_status', data: { checklistId: 'list-1', itemId: 'item-1', status: 'done' } },
      { command: 'checklist.item_status', data: { checklistId: 'list-1', itemId: 'item-1', status: 'skipped' } },
      { command: 'checklist.replace_items', data: { checklistId: 'list-1', items: [] } },
    ]);
  });

  test('Git branch controls speak full branch names, are reachable, and keep distinct actions', async () => {
    await render('git');
    await tap(target('Switch to branch feature/a11y'));
    await tap(target('Merge branch feature/a11y into main'));
    expect(sent).toEqual([
      { command: 'git.action', data: { action: 'checkout', branch: 'feature/a11y' } },
      { command: 'git.action', data: { action: 'merge', branch: 'feature/a11y' } },
    ]);
  });

  test('diff and panel close controls are accessible and keep their independent behaviors', async () => {
    await render('git');
    const fileRow = tree!.root.findAll((node) => node.type === 'Pressable' && textOf(node).includes('source.ts'))[0];
    await tap(fileRow);
    await tap(target('Close diff for source.ts'));
    expect(button('Close diff for source.ts')).toBeUndefined();
    await tap(target('Close Git'));
    expect(sent).toEqual([{ command: 'close' }]);
  });

  test('scope choices expose selection and minimum 44pt height', async () => {
    await render('checklists');
    const options = ['Chat', 'Project', 'Workspace'];
    for (const [index, text] of options.entries()) {
      const chip = tree!.root.findAll((node) => node.type === 'Pressable' && textOf(node) === text)[0];
      expect(chip).toBeDefined();
      expect(chip.props.accessibilityRole).toBe('button');
      expect(chip.props.accessibilityState).toEqual({ selected: index === 0 });
      const style = typeof chip.props.style === 'function' ? chip.props.style({ pressed: false }) : chip.props.style;
      expect(style.some((entry: { minHeight?: number }) => entry?.minHeight >= 44)).toBe(true);
    }
  });
}
