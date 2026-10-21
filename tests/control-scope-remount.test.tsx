// Keep native component mocks isolated from unrelated Bun test files.
import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORYPHAIOS_SCOPE_REMOUNT_CHILD !== '1') {
  test('all workspace controls reset when their host, project, or chat changes', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_SCOPE_REMOUNT_CHILD: '1' },
      encoding: 'utf8', timeout: 25_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Control scope tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 30_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.module('react-native', () => ({
    Appearance: { getColorScheme: () => 'dark' },
    StyleSheet: { create: (styles: unknown) => styles },
    View: 'View', Text: 'Text',
  }));

  let nextInstance = 0;
  const tracked = (name: string) => function TrackedControl() {
    const [instance] = React.useState(() => ++nextInstance);
    return React.createElement('Text', { testID: 'control-identity' }, `${name}:${instance}`);
  };
  mock.module('../src/components/MobileSurface', () => ({
    MobileSurface: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  }));
  mock.module('../src/components/AdvancedControls', () => ({
    ComputerUseView: tracked('computer'), SessionControlsView: tracked('session'),
    TimeTravelView: tracked('history'), WorkflowsView: tracked('workflows'),
  }));
  mock.module('../src/components/NativeCommandsView', () => ({ NativeCommandsView: tracked('commands') }));
  mock.module('../src/components/RemoteContentControls', () => ({
    CollaborationControlView: tracked('teams'), MediaControlView: tracked('media'),
    MemoryControlView: tracked('memory'), NotesControlView: tracked('legacyNotes'),
  }));
  mock.module('../src/components/NotesControlView', () => ({ NotesControlView: tracked('notes') }));
  mock.module('../src/components/AgentControlViews', () => ({
    AgentPreferencesView: tracked('preferences'),
    ResponseStyleControlView: tracked('responseStyle'), SkillsControlView: tracked('skills'),
  }));
  mock.module('../src/components/ModelSharingControlView', () => ({ ModelSharingControlView: tracked('modelSharing') }));
  mock.module('../src/components/McpControlView', () => ({ McpControlView: tracked('mcp') }));
  mock.module('../src/components/WorkspaceNavigationView', () => ({ WorkspaceNavigationView: tracked('workspace') }));
  mock.module('../src/components/BillingControlView', () => ({ BillingControlView: tracked('billing') }));
  mock.module('../src/components/WorkspaceControls', () => ({ WorkspaceControlPanel: tracked('workspacePanel') }));

  const scope = (host = 'host-a', project = 'project-a', chat = 'chat-a') => ({
    pairing: { baseUrl: `https://${host}.test`, machineId: host },
    snapshot: {
      machine: { id: host }, activeProjectId: project, activeSessionId: chat,
    },
  });
  let control = scope();
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  const { MobileWorkspaceControlView } = await import('../src/components/MobileWorkspaceControlView');

  let tree: TestRenderer.ReactTestRenderer | null = null;
  const readInstance = () => tree!.root.findByProps({ testID: 'control-identity' }).children.join('');
  const render = async (kind: string, sessionId?: string) => {
    await act(async () => {
      const view = <MobileWorkspaceControlView kind={kind} sessionId={sessionId} />;
      if (tree) tree.update(view);
      else tree = TestRenderer.create(view);
    });
    return readInstance();
  };
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = null;
    control = scope();
  });

  const kinds = [
    'session', 'workflows', 'history', 'computer', 'commands', 'memory',
    'notes', 'teams', 'modelSharing', 'mcp', 'media', 'billing',
    'workspace', 'preferences', 'responseStyle', 'skills', 'goals',
    'checklists', 'git',
  ];

  for (const kind of kinds) {
    test(`${kind}: preserves state only while host, project and chat are unchanged`, async () => {
      const a1 = await render(kind);
      if (kind === 'notes') expect(a1).toStartWith('notes:');
      expect(await render(kind)).toBe(a1);

      control = scope('host-b');
      const b = await render(kind);
      expect(b).not.toBe(a1);
      control = scope();
      const a2 = await render(kind);
      expect(a2).not.toBe(a1);
      expect(a2).not.toBe(b);

      control = scope('host-a', 'project-b');
      const project = await render(kind);
      expect(project).not.toBe(a2);
      control = scope('host-a', 'project-a', 'chat-b');
      const chat = await render(kind);
      expect(chat).not.toBe(project);
    });
  }

  test('changing the explicit route chat resets its mounted control', async () => {
    const chatA = await render('billing', 'chat-a');
    const chatB = await render('billing', 'chat-b');
    expect(chatB).not.toBe(chatA);
  });

  test('changing kind resets controls that share the same component', async () => {
    const goals = await render('goals');
    const checklists = await render('checklists');
    expect(checklists).not.toBe(goals);
    const git = await render('git');
    expect(git).not.toBe(checklists);
  });
}
