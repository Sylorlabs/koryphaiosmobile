// Native component isolation prevents React Native mocks leaking into unrelated suites.
import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_WORKSPACE_SAFETY_CHILD !== '1') {
  test('workspace navigation: host selection, rejection and stale-result safety', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_WORKSPACE_SAFETY_CHILD: '1' },
      encoding: 'utf8', timeout: 25_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Workspace safety suite failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 30_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.module('react-native', () => ({
    Appearance: { getColorScheme: () => 'dark' },
    View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView',
    Modal: ({ visible, children, ...props }: any) => visible ? React.createElement('Modal', props, children) : null,
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
  }));
  mock.module('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
  }));
  const routes: string[] = [];
  mock.module('expo-router', () => ({
    router: { replace: (path: string) => routes.push(`replace:${path}`) },
  }));
  mock.module('lucide-react-native', () => Object.fromEntries([
    'Check', 'ChevronDown', 'ChevronRight', 'Folder', 'FolderOpen', 'Search', 'X', 'ArrowLeft',
  ].map((name) => [name, name])));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
  }));

  type Ack = { accepted: boolean; sessionId?: string; data?: unknown };
  type Request = { name: string; payload?: Record<string, unknown>; resolve: (ack: Ack) => void; reject: (error: Error) => void };
  type InspectRequest = { name: string; payload?: Record<string, unknown>; resolve: (result: unknown) => void };
  const commands: Request[] = [];
  const fileRequests: InspectRequest[] = [];
  const inspectCalls: Array<{ name: string; payload?: Record<string, unknown> }> = [];
  const projects = [
    { path: '/work/project-a', name: 'Alpha' },
    { path: '/work/project-b', name: 'Beta' },
  ];
  let hostSelection = '/work/project-a';
  let folderPath = '/work/project-b';
  let directoryFailures = 0;
  let delayDirectory = false;
  let directoryRoots: Array<{ path: string; name: string }> = [];
  const directoryRequests: InspectRequest[] = [];
  let useDelayedFiles = false;
  let closeCount = 0;
  let changedCount = 0;

  function controlFor(host: string, activeProject = '/work/project-a') {
    return {
      pairing: { baseUrl: `http://${host}.local`, machineId: host },
      snapshot: {
        machine: { id: host, name: host }, activeProjectId: activeProject,
        activeSessionId: '', projects: [],
      },
      inspect: <T,>(name: string, payload?: Record<string, unknown>): Promise<T> => {
        inspectCalls.push({ name, payload });
        if (name === 'workspace.inspect') {
          return Promise.resolve({
            workspaceRoot: '/work', selectedProject: hostSelection, projects,
            unavailableWorkspace: null, unavailableProject: null,
          } as T);
        }
        if (name === 'workspace.directories') {
          if (directoryFailures > 0) {
            directoryFailures--;
            return Promise.reject(new Error('Host directory browsing unavailable'));
          }
          if (delayDirectory) {
            return new Promise<T>((resolve) => directoryRequests.push({ name, payload, resolve: resolve as (result: unknown) => void }));
          }
          return Promise.resolve({ path: folderPath, parent: '/work', roots: directoryRoots, directories: [] } as T);
        }
        if (name === 'workspace.files' && useDelayedFiles) {
          return new Promise<T>((resolve) => fileRequests.push({ name, payload, resolve: resolve as (result: unknown) => void }));
        }
        if (name === 'workspace.files') return Promise.resolve({ files: [], query: '' } as T);
        throw new Error(`Unexpected inspection: ${name}`);
      },
      sendCommand: (name: string, payload?: Record<string, unknown>): Promise<Ack> =>
        new Promise((resolve, reject) => commands.push({ name, payload, resolve, reject })),
    };
  }

  let control = controlFor('host-a');
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  const { WorkspaceNavigationView } = await import('../src/components/WorkspaceNavigationView');
  const { HostFolderPicker } = await import('../src/components/HostFolderPicker');
  let tree: TestRenderer.ReactTestRenderer | null = null;
  const flush = async () => { for (let index = 0; index < 15; index++) await Promise.resolve(); };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  const mount = async (view: React.ReactElement) => {
    await act(async () => {
      if (tree) tree.update(view);
      else tree = TestRenderer.create(view);
      await flush();
    });
    // Component effects schedule the first inspection after the initial commit.
    await act(async () => { await tick(); await flush(); });
  };
  const textOf = (node: TestRenderer.ReactTestInstance): string =>
    node.children.map((child) => typeof child === 'string' ? child : textOf(child)).join('');
  const textOnScreen = () => tree!.root.findAllByType('Text' as any).map(textOf).join(' ');
  const findPressable = (label: string) => tree!.root.findAll((node) =>
    node.type === 'Pressable' && (node.props.accessibilityLabel === label || textOf(node) === label))[0];
  const findAction = (label: string) => tree!.root.findAllByType('ActionButton' as any)
    .find((node) => node.props.label === label);
  const press = async (label: string, kind: 'pressable' | 'action' = 'pressable') => {
    const button = kind === 'pressable' ? findPressable(label) : findAction(label);
    expect(button).toBeDefined();
    await act(async () => { button!.props.onPress(); await flush(); });
  };
  const resolveCommand = async (index: number, ack: Ack) => {
    await act(async () => { commands[index]!.resolve(ack); await flush(); });
  };

  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = null;
    control = controlFor('host-a');
    hostSelection = '/work/project-a';
    folderPath = '/work/project-b';
    directoryFailures = 0;
    delayDirectory = false;
    directoryRoots = [];
    useDelayedFiles = false;
    closeCount = changedCount = 0;
    commands.length = fileRequests.length = directoryRequests.length = inspectCalls.length = routes.length = 0;
  });

  test('rejected selection stops before chat creation and explains the refusal', async () => {
    await mount(<WorkspaceNavigationView />);
    await press('Select project Beta');
    expect(commands.map((request) => request.name)).toEqual(['project.select']);
    await resolveCommand(0, { accepted: false });
    expect(commands).toHaveLength(1);
    expect(textOnScreen()).toContain('No new chat was requested');
  });

  test('a mismatched host selection cannot create a chat', async () => {
    await mount(<WorkspaceNavigationView />);
    await press('Select project Beta');
    await resolveCommand(0, { accepted: true });
    expect(commands).toHaveLength(1);
    expect(textOnScreen()).toContain('Could not confirm the selected project');
  });

  test('rapid taps create only one chat after verified selection', async () => {
    await mount(<WorkspaceNavigationView />);
    const button = findPressable('Select project Beta');
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
      await flush();
    });
    expect(commands.map((request) => request.name)).toEqual(['project.select']);
    hostSelection = '/work/project-b';
    await resolveCommand(0, { accepted: true });
    expect(commands.map((request) => request.name)).toEqual(['project.select', 'session.create']);
    expect(commands[1].payload).toEqual({ projectId: '/work/project-b', title: 'Project: Beta' });
    await resolveCommand(1, { accepted: true, sessionId: 'new-chat' });
    expect(textOnScreen()).not.toContain('No new chat was requested');
  });

  test('an old host command cannot create chats after host A → B → A', async () => {
    await mount(<WorkspaceNavigationView />);
    await press('Select project Beta');
    control = controlFor('host-b');
    await mount(<WorkspaceNavigationView />);
    control = controlFor('host-a');
    await mount(<WorkspaceNavigationView />);
    hostSelection = '/work/project-b';
    await resolveCommand(0, { accepted: true });
    expect(commands.map((request) => request.name)).toEqual(['project.select']);
  });

  test('a file listing from another project never appears in the active project', async () => {
    useDelayedFiles = true;
    await mount(<WorkspaceNavigationView />);
    await press('Open file browser');
    expect(fileRequests).toHaveLength(1);
    expect(fileRequests[0].payload?.projectId).toBe('/work/project-a');
    control = controlFor('host-a', '/work/project-b');
    hostSelection = '/work/project-b';
    await mount(<WorkspaceNavigationView />);
    await act(async () => {
      fileRequests[0].resolve({ files: ['top-secret-from-alpha.txt'], query: '' });
      await flush();
    });
    expect(textOnScreen()).not.toContain('top-secret-from-alpha.txt');
  });

  test('folder picker never creates or navigates after rejected selection', async () => {
    await mount(<HostFolderPicker visible mode="open-project" onClose={() => { closeCount++; }}
      onChanged={() => { changedCount++; }} />);
    await press('Open project', 'action');
    await resolveCommand(0, { accepted: false });
    expect(commands.map((request) => request.name)).toEqual(['project.select']);
    expect(routes).toHaveLength(0);
    expect(closeCount).toBe(0);
    expect(changedCount).toBe(0);
    expect(textOnScreen()).toContain('No chat was created');
  });

  test('folder picker requires verified selection and guards duplicate actions', async () => {
    await mount(<HostFolderPicker visible mode="open-project" onClose={() => { closeCount++; }}
      onChanged={() => { changedCount++; }} />);
    const button = findAction('Open project')!;
    await act(async () => { button.props.onPress(); button.props.onPress(); await flush(); });
    expect(commands).toHaveLength(1);
    await resolveCommand(0, { accepted: true });
    expect(commands).toHaveLength(1);
    expect(routes).toHaveLength(0);
    expect(textOnScreen()).toContain('Project selection could not be verified');
  });

  test('closing the folder browser during selection prevents subsequent chat creation', async () => {
    await mount(<HostFolderPicker visible mode="open-project" onClose={() => { closeCount++; }}
      onChanged={() => { changedCount++; }} />);
    await press('Open project', 'action');
    await act(async () => { tree!.unmount(); tree = null; });
    hostSelection = '/work/project-b';
    await resolveCommand(0, { accepted: true });
    expect(commands).toHaveLength(1);
    expect(routes).toHaveLength(0);
  });

  test('tapping Close cancels follow-up commands before the parent removes the picker', async () => {
    await mount(<HostFolderPicker visible mode="open-project" onClose={() => { closeCount++; }}
      onChanged={() => { changedCount++; }} />);
    await press('Open project', 'action');
    expect(commands.map((request) => request.name)).toEqual(['project.select']);

    // Keep the visible prop true to simulate a delayed parent navigation commit.
    await press('Close folder browser');
    expect(closeCount).toBe(1);
    hostSelection = '/work/project-b';
    await resolveCommand(0, { accepted: true });

    expect(commands.map((request) => request.name)).toEqual(['project.select']);
    expect(changedCount).toBe(0);
    expect(routes).toHaveLength(0);
  });

  test('native modal back dismissal cancels project follow-up before an unmount', async () => {
    await mount(<HostFolderPicker visible mode="open-project" onClose={() => { closeCount++; }}
      onChanged={() => { changedCount++; }} />);
    await press('Open project', 'action');
    const modal = tree!.root.findByType('Modal' as any);
    await act(async () => { modal.props.onRequestClose(); await flush(); });
    hostSelection = '/work/project-b';
    await resolveCommand(0, { accepted: true });

    expect(closeCount).toBe(1);
    expect(commands.map((request) => request.name)).toEqual(['project.select']);
    expect(routes).toHaveLength(0);
  });

  test('folder browser explains a slow initial load before any folders are available', async () => {
    delayDirectory = true;
    await mount(<HostFolderPicker visible mode="open-project" onClose={() => { closeCount++; }}
      onChanged={() => { changedCount++; }} />);
    expect(directoryRequests).toHaveLength(1);
    expect(textOnScreen()).toContain('Loading host folders');
    await act(async () => {
      directoryRequests[0].resolve({ path: '/work', parent: null, roots: [], directories: [] });
      await flush();
    });
    expect(textOnScreen()).not.toContain('Loading host folders');
  });

  test('folder browser offers a retry after initial listing failure', async () => {
    directoryFailures = 1;
    await mount(<HostFolderPicker visible mode="open-project" onClose={() => { closeCount++; }}
      onChanged={() => { changedCount++; }} />);
    expect(textOnScreen()).toContain('Host directory browsing unavailable');
    expect(findAction('Retry folder listing')).toBeDefined();
    await press('Retry folder listing', 'action');
    expect(textOnScreen()).not.toContain('Host directory browsing unavailable');
    expect(findAction('Open project')?.props.disabled).toBe(false);
  });

  test('folder roots and close control have accessible 44-point touch targets', async () => {
    directoryRoots = [{ path: '/work', name: 'Workspace' }, { path: '/home', name: 'Home' }];
    await mount(<HostFolderPicker visible mode="open-project" onClose={() => { closeCount++; }}
      onChanged={() => { changedCount++; }} />);
    const root = findPressable('Browse root Home');
    expect(root).toBeDefined();
    expect(root.props.accessibilityRole).toBe('button');
    expect(root.props.style({ pressed: false })[0].minHeight).toBeGreaterThanOrEqual(44);
    const close = findPressable('Close folder browser');
    expect(close).toBeDefined();
    expect(close.props.style({ pressed: false })[0].width).toBeGreaterThanOrEqual(44);
    expect(close.props.style({ pressed: false })[0].height).toBeGreaterThanOrEqual(44);
  });

  test('reopening during a delayed host listing rejects stale results and starts a new listing', async () => {
    delayDirectory = true;
    const props = { onClose: () => { closeCount++; }, onChanged: () => { changedCount++; } };
    await mount(<HostFolderPicker visible mode="open-project" {...props} />);
    expect(directoryRequests).toHaveLength(1);

    await mount(<HostFolderPicker visible={false} mode="open-project" {...props} />);
    control = controlFor('host-b');
    await mount(<HostFolderPicker visible mode="new-workspace" {...props} />);
    expect(directoryRequests).toHaveLength(2);

    await act(async () => {
      directoryRequests[0].resolve({ path: '/host-a/private', parent: null, roots: [], directories: [] });
      await flush();
    });
    expect(textOnScreen()).not.toContain('/host-a/private');
    expect(textOnScreen()).toContain('Loading host folders');

    await act(async () => {
      directoryRequests[1].resolve({ path: '/host-b/work', parent: null, roots: [], directories: [] });
      await flush();
    });
    expect(textOnScreen()).toContain('/host-b/work');
    expect(textOnScreen()).not.toContain('Loading host folders');
  });

  test('switching hosts while the browser is visible drops the previous host listing', async () => {
    delayDirectory = true;
    const props = { onClose: () => { closeCount++; }, onChanged: () => { changedCount++; } };
    await mount(<HostFolderPicker visible mode="open-workspace" {...props} />);
    expect(directoryRequests).toHaveLength(1);

    control = controlFor('host-b');
    await mount(<HostFolderPicker visible mode="open-workspace" {...props} />);
    expect(directoryRequests).toHaveLength(2);
    await act(async () => {
      directoryRequests[0].resolve({ path: '/host-a/private', parent: null, roots: [], directories: [] });
      await flush();
    });
    expect(textOnScreen()).not.toContain('/host-a/private');
    await act(async () => {
      directoryRequests[1].resolve({ path: '/host-b/work', parent: null, roots: [], directories: [] });
      await flush();
    });
    expect(textOnScreen()).toContain('/host-b/work');
  });

  test('dismissed but mounted browser cannot create a chat after an old selection resolves', async () => {
    const props = { onClose: () => { closeCount++; }, onChanged: () => { changedCount++; } };
    await mount(<HostFolderPicker visible mode="open-project" {...props} />);
    await press('Open project', 'action');
    expect(commands.map((request) => request.name)).toEqual(['project.select']);
    await mount(<HostFolderPicker visible={false} mode="open-project" {...props} />);
    hostSelection = '/work/project-b';
    await resolveCommand(0, { accepted: true });
    expect(commands.map((request) => request.name)).toEqual(['project.select']);
    expect(routes).toHaveLength(0);
    expect(changedCount).toBe(0);
  });

  test('switching hosts during project selection prevents a stale follow-up chat', async () => {
    const props = { onClose: () => { closeCount++; }, onChanged: () => { changedCount++; } };
    await mount(<HostFolderPicker visible mode="open-project" {...props} />);
    await press('Open project', 'action');
    expect(commands.map((request) => request.name)).toEqual(['project.select']);

    control = controlFor('host-b');
    await mount(<HostFolderPicker visible mode="open-project" {...props} />);
    hostSelection = '/work/project-b';
    await resolveCommand(0, { accepted: true });
    expect(commands.map((request) => request.name)).toEqual(['project.select']);
    expect(routes).toHaveLength(0);
    expect(changedCount).toBe(0);
  });
}
