// Native UI mocks must stay in a child process to avoid changing unrelated suites.
import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_ADVANCED_SAFETY_CHILD !== '1') {
  test('advanced controls: preserve work until the desktop state is verified', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_ADVANCED_SAFETY_CHILD: '1' },
      encoding: 'utf8', timeout: 25_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Advanced controls tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 30_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.module('react-native', () => ({
    Appearance: { getColorScheme: () => 'dark' },
    View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable',
    ScrollView: 'ScrollView', StyleSheet: { create: (s: unknown) => s },
  }));
  const routes: string[] = [];
  mock.module('expo-router', () => ({
    router: { replace: (path: string) => routes.push(path) },
  }));
  mock.module('lucide-react-native', () => Object.fromEntries([
    'Archive', 'Check', 'CheckCircle2', 'Circle', 'CircleStop', 'Clock3', 'Monitor',
    'Play', 'Plus', 'RefreshCw', 'RotateCcw', 'Save', 'Trash2', 'Workflow', 'X',
  ].map((name) => [name, name])));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
  }));

  type Ack = { accepted: boolean };
  type Command = { name: string; payload?: Record<string, unknown>; resolve: (ack: Ack) => void };
  const commands: Command[] = [];
  let inspectFailure = false;
  let inspected: Record<string, any> = {};
  const inspectCalls: string[] = [];
  const initialRun = {
    id: 'run-1', workflowId: 'wf-1', sessionId: 'chat-1',
    task: 'Build safely', status: 'running' as const, stageIndex: 0, evidence: [],
  };
  const definition = {
    id: 'wf-1', name: 'Build', description: 'Perform work',
    autoStartSafe: false, stages: [
      { id: 'stage-1', label: 'Review', description: 'Verify output', requiresEvidence: true },
      { id: 'stage-2', label: 'Ship', description: 'Publish output', requiresEvidence: true },
    ],
  };
  const emptyWorkflows = { definitions: [definition], drafts: [], runs: [] };
  const withRun = { ...emptyWorkflows, runs: [initialRun] };
  const control = {
    snapshot: {
      machine: { id: 'host-1' },
      activeProjectId: 'project-1', activeSessionId: 'chat-1',
      sessions: [{ id: 'chat-1', title: 'Chat', interactionMode: 'plan' }],
      agents: [], feed: [] as any[],
    },
    modelChoices: {},
    inspect: async <T,>(name: string): Promise<T> => {
      inspectCalls.push(name);
      if (inspectFailure) throw new Error('Host refresh failed');
      return (inspected[name] ?? {}) as T;
    },
    sendCommand: (name: string, payload?: Record<string, unknown>) => new Promise<Ack>((resolve) => {
      commands.push({ name, payload, resolve });
    }),
  };
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  const { WorkflowsView, SessionControlsView } = await import('../src/components/AdvancedControls');
  let tree: TestRenderer.ReactTestRenderer | null = null;
  const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  const mount = async (view: React.ReactElement) => {
    await act(async () => {
      if (tree) tree.update(view);
      else tree = TestRenderer.create(view);
      await flush();
    });
    await act(async () => { await tick(); await flush(); });
  };
  const textOf = (node: TestRenderer.ReactTestInstance): string =>
    node.children.map((child) => typeof child === 'string' ? child : textOf(child)).join('');
  const screenText = () => tree!.root.findAllByType('Text' as any).map(textOf).join(' ');
  const action = (label: string) => tree!.root.findAllByType('ActionButton' as any).find((node) => node.props.label === label);
  const input = (placeholder: string) => tree!.root.findAllByType('TextInput' as any).find((node) => node.props.placeholder === placeholder);
  const inputByLabel = (label: string) => tree!.root.findAllByType('TextInput' as any).find((node) => node.props.accessibilityLabel === label);
  const type = async (placeholder: string, value: string) => {
    await act(async () => { input(placeholder)!.props.onChangeText(value); await flush(); });
  };
  const typeByLabel = async (label: string, value: string) => {
    await act(async () => { inputByLabel(label)!.props.onChangeText(value); await flush(); });
  };
  const press = async (label: string) => {
    expect(action(label)).toBeDefined();
    await act(async () => { action(label)!.props.onPress(); await flush(); });
  };
  const acknowledge = async (index: number, accepted: boolean) => {
    await act(async () => { commands[index]!.resolve({ accepted }); await flush(); });
  };

  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = null;
    commands.length = routes.length = inspectCalls.length = 0;
    inspectFailure = false;
    inspected = {};
    control.snapshot.feed = [];
    control.snapshot.sessions = [{ id: 'chat-1', title: 'Chat', interactionMode: 'plan' }];
  });

  test('unsaved chat rename survives a newer desktop title while editing', async () => {
    await mount(<SessionControlsView />);
    await typeByLabel('Chat name', 'Local unsaved title');
    control.snapshot.sessions = [{ id: 'chat-1', title: 'Renamed on desktop', interactionMode: 'plan' }];
    await mount(<SessionControlsView />);
    expect(inputByLabel('Chat name')?.props.value).toBe('Local unsaved title');
    expect(screenText()).toContain('Chat name changed on the desktop');
    expect(action('Save')?.props.disabled).toBe(true);
    await press('Keep my title');
    expect(action('Save')?.props.disabled).toBe(false);
    expect(inputByLabel('Chat name')?.props.value).toBe('Local unsaved title');
  });

  test('untouched chat rename field tracks an external desktop title change', async () => {
    await mount(<SessionControlsView />);
    control.snapshot.sessions = [{ id: 'chat-1', title: 'New host title', interactionMode: 'plan' }];
    await mount(<SessionControlsView />);
    expect(inputByLabel('Chat name')?.props.value).toBe('New host title');
  });

  test('rename acknowledgement followed by a new edit survives delayed host echo', async () => {
    await mount(<SessionControlsView />);
    await typeByLabel('Chat name', 'First rename');
    await press('Save');
    expect(commands).toHaveLength(1);
    await acknowledge(0, true);
    await typeByLabel('Chat name', 'Second rename');
    control.snapshot.sessions = [{ id: 'chat-1', title: 'First rename', interactionMode: 'plan' }];
    await mount(<SessionControlsView />);
    expect(inputByLabel('Chat name')?.props.value).toBe('Second rename');
    expect(action('Save')?.props.disabled).toBe(true);
    await press('Use desktop title');
    expect(inputByLabel('Chat name')?.props.value).toBe('First rename');
    expect(action('Save')?.props.disabled).toBe(true);
  });

  test('accepted workflow start preserves the task when refresh fails', async () => {
    inspected['workflows.inspect'] = emptyWorkflows;
    await mount(<WorkflowsView />);
    await type('What should Koryphaios accomplish?', 'Prepare release');
    await press('Start');
    expect(commands).toHaveLength(1);
    expect(commands[0].payload?.task).toBe('Prepare release');
    inspectFailure = true;
    await acknowledge(0, true);
    expect(input('What should Koryphaios accomplish?')?.props.value).toBe('Prepare release');
    expect(screenText()).toContain('accepted');
    expect(screenText()).toContain('not confirmed');
  });

  test('accepted workflow advance preserves evidence until refreshed run progresses', async () => {
    inspected['workflows.inspect'] = withRun;
    await mount(<WorkflowsView />);
    await type('Evidence for Review', 'Tests passed');
    await press('Record and continue');
    expect(commands[0].name).toBe('workflow.advance');
    await acknowledge(0, true);
    expect(input('Evidence for Review')?.props.value).toBe('Tests passed');
    expect(screenText()).toContain('not yet confirmed');
  });

  test('accepted workflow start with unchanged host state retains the original task', async () => {
    inspected['workflows.inspect'] = emptyWorkflows;
    await mount(<WorkflowsView />);
    await type('What should Koryphaios accomplish?', 'Prepare release');
    await press('Start');
    await acknowledge(0, true);
    expect(input('What should Koryphaios accomplish?')?.props.value).toBe('Prepare release');
    expect(screenText()).toContain('not yet confirmed');
  });

  test('confirmed workflow transition clears saved stage evidence', async () => {
    inspected['workflows.inspect'] = withRun;
    await mount(<WorkflowsView />);
    await type('Evidence for Review', 'Tests passed');
    await press('Record and continue');
    inspected['workflows.inspect'] = {
      ...emptyWorkflows, runs: [{ ...initialRun, stageIndex: 1, evidence: [
        { stageId: 'stage-1', value: 'Tests passed', createdAt: 3 },
      ] }],
    };
    await acknowledge(0, true);
    expect(input('Evidence for Ship')?.props.value).toBe('');
    expect(screenText()).not.toContain('not yet confirmed');
  });

  test('late acknowledgement after unmount does not inspect an obsolete host', async () => {
    inspected['workflows.inspect'] = emptyWorkflows;
    await mount(<WorkflowsView />);
    await type('What should Koryphaios accomplish?', 'Prepare release');
    await press('Start');
    await act(async () => { tree!.unmount(); tree = null; });
    await acknowledge(0, true);
    expect(inspectCalls).toEqual(['workflows.inspect']);
  });

  test('negative workflow acknowledgement retains task and does not refresh', async () => {
    inspected['workflows.inspect'] = emptyWorkflows;
    await mount(<WorkflowsView />);
    await type('What should Koryphaios accomplish?', 'Prepare release');
    await press('Start');
    await acknowledge(0, false);
    expect(input('What should Koryphaios accomplish?')?.props.value).toBe('Prepare release');
    expect(inspectCalls).toHaveLength(1);
  });

  test('plan mode accepted but implementation rejected identifies the partial command outcome', async () => {
    control.snapshot.feed = [{
      id: 'plan-1', kind: 'assistant', author: 'Koryphaios', createdAt: '2026-10-10T12:00:00Z',
      body: [
        '# Decision summary', 'Proceed carefully.',
        '# Current-state evidence', 'Workspace inspected.',
        '# Detailed implementation plan', '1. Verify dependencies.', '2. Implement and test.',
        '# User journey and failure states', 'Keep input on failure.',
        '# Risks and alternatives', 'Avoid duplicates.',
        '# Acceptance criteria', 'No lost work.',
        '# Verification plan', 'Run tests.',
        '# Remaining assumptions', 'Controlled host available.',
        '<!-- KORY_PLAN_READY -->',
      ].join('\n'),
    }];
    await mount(<SessionControlsView />);
    expect(action('Approve plan & implement')).toBeDefined();
    await press('Approve plan & implement');
    expect(commands[0].name).toBe('session.update_controls');
    await acknowledge(0, true);
    expect(commands[1].name).toBe('session.send_message');
    await acknowledge(1, false);
    expect(routes).toHaveLength(0);
    expect(screenText()).toContain('Mode change was accepted');
    expect(screenText()).toContain('implementation request');
  });
}
