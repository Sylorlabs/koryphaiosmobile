// Isolate native component mocks from the rest of the Bun suite.
import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORYPHAIOS_CHATS_SAFETY_CHILD !== '1') {
  test('chat navigation and destructive scope: native component callbacks', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_CHATS_SAFETY_CHILD: '1' },
      encoding: 'utf8', timeout: 25_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Chats safety tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 30_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.module('react-native', () => ({
    Appearance: { getColorScheme: () => 'dark' },
    View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
    Modal: ({ visible, children }: any) => visible ? React.createElement('Modal', null, children) : null,
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
  }));
  mock.module('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
  }));
  const routes: string[] = [];
  mock.module('expo-router', () => ({
    router: {
      push: (path: string) => routes.push(`push:${path}`),
      back: () => routes.push('back'),
      replace: (path: string) => routes.push(`replace:${path}`),
    },
  }));
  mock.module('lucide-react-native', () => ({
    FolderOpen: 'FolderOpen', MoreHorizontal: 'MoreHorizontal', Plus: 'Plus', Trash2: 'Trash2',
  }));
  mock.module('../src/components/ui', () => ({ StatusDot: 'StatusDot' }));
  mock.module('../src/components/MobileSurface', () => ({
    MobileSurface: ({ right, children }: { right?: React.ReactNode; children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, right, children),
  }));
  const savedReviews = new Map<string, { label: string }>();
  let failRead = false;
  let failWrite = false;
  let failClear = false;
  let pendingSave: Promise<void> | null = null;
  mock.module('../src/control/settingActionReviewStorage', () => ({
    settingActionReviewStorage: {
      load: async (key: string) => {
        if (failRead) throw new Error('saved reviews unavailable');
        return savedReviews.get(key) ?? null;
      },
      save: async (key: string, record: { label: string }) => {
        await pendingSave;
        if (failWrite) throw new Error('save refused');
        savedReviews.set(key, record);
      },
      clear: async (key: string) => {
        if (failClear) throw new Error('clear refused');
        savedReviews.delete(key);
      },
    },
  }));

  type Request = {
    command: string;
    payload?: unknown;
    resolve: (result: { accepted: boolean; sessionId?: string }) => void;
    reject: (reason: Error) => void;
  };
  const requests: Request[] = [];
  let refreshes = 0;
  let testScope = 0;
  const hostControl = (machineId: string) => ({
    pairing: { machineId, baseUrl: `http://${machineId}.${testScope}.local:3001` },
    snapshot: {
      machine: { id: machineId, name: machineId, status: 'online' },
      activeProjectId: 'project-a', activeSessionId: '', projects: [], sessions: [],
    },
    live: { connection: 'connected' }, attentionSessionIds: [],
    refresh: async () => { refreshes++; },
    sendCommand: (command: string, payload?: unknown) => new Promise<{ accepted: boolean; sessionId?: string }>((resolve, reject) => {
      requests.push({ command, payload, resolve, reject });
    }),
  });
  let control: ReturnType<typeof hostControl> = hostControl('host-a');
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  const { MobileChatsView } = await import('../src/components/MobileChatsView');
  let tree: TestRenderer.ReactTestRenderer | null = null;
  const flush = async () => { for (let index = 0; index < 15; index++) await Promise.resolve(); };
  const render = async () => {
    await act(async () => {
      if (tree) tree.update(<MobileChatsView />);
      else tree = TestRenderer.create(<MobileChatsView />);
      await flush();
    });
  };
  const textOf = (node: TestRenderer.ReactTestInstance): string =>
    node.children.map((child) => typeof child === 'string' ? child : textOf(child)).join('');
  const findButton = (label: string) => tree!.root.findAll((node) =>
    node.type === 'Pressable' && (node.props.accessibilityLabel === label || textOf(node) === label))[0];
  const press = async (label: string) => {
    const target = findButton(label);
    expect(target).toBeDefined();
    await act(async () => { target.props.onPress(); await flush(); });
  };
  const screenText = () => tree!.root.findAllByType('Text' as any).map(textOf).join(' ');
  const observeCreatedChat = async (id: string) => {
    control = { ...control, snapshot: {
      ...control.snapshot,
      activeSessionId: id,
      sessions: [{ id, projectId: control.snapshot.activeProjectId, title: 'New chat', updatedAt: '' }],
    } };
    await render();
  };

  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = null;
    requests.length = routes.length = 0;
    refreshes = 0;
    savedReviews.clear();
    failRead = failWrite = failClear = false;
    pendingSave = null;
    testScope++;
    control = hostControl('host-a');
  });

  test('rejecting a created chat keeps the user on Chats with recovery guidance', async () => {
    await render();
    await press('New chat');
    expect(requests).toHaveLength(1);
    await act(async () => { requests[0].resolve({ accepted: false }); await flush(); });
    expect(routes).toHaveLength(0);
    expect(screenText()).toContain('A new chat was not confirmed');
    expect(findButton('New chat').props.disabled).toBe(false);
  });

  test('chat creation must save a host-scoped review lock before sending to the desktop', async () => {
    let allowSave!: () => void;
    pendingSave = new Promise<void>((resolve) => { allowSave = resolve; });
    await render();
    await press('New chat');
    expect(requests).toHaveLength(0);
    expect(findButton('New chat').props.disabled).toBe(true);
    await act(async () => { allowSave(); await flush(); });
    expect(requests).toHaveLength(1);
    expect(savedReviews.size).toBe(1);
    await press('New chat');
    expect(requests).toHaveLength(1);
  });

  test('an uncertain chat creation stays locked after remount and across host selection', async () => {
    await render();
    await press('New chat');
    await act(async () => { requests[0].reject(new Error('response lost')); await flush(); });
    expect(savedReviews.size).toBe(1);
    await act(async () => { tree!.unmount(); tree = null; });
    await render();
    expect(findButton('New chat').props.disabled).toBe(true);
    await press('New chat');
    expect(requests).toHaveLength(1);
    control = hostControl('host-b');
    await render();
    expect(findButton('New chat').props.disabled).toBe(false);
    control = hostControl('host-a');
    await render();
    expect(findButton('New chat').props.disabled).toBe(true);
    expect(screenText()).toContain('Check the chat list');
  });

  test('a failed saved review read or write blocks creation instead of risking duplicate requests', async () => {
    failRead = true;
    await render();
    expect(findButton('New chat').props.disabled).toBe(true);
    await press('New chat');
    expect(requests).toHaveLength(0);
    expect(screenText()).toContain('Saved chat status');
    failRead = false;
    control = hostControl('host-b');
    await render();
    failWrite = true;
    await press('New chat');
    expect(requests).toHaveLength(0);
    expect(findButton('New chat').props.disabled).toBe(true);
  });

  test('confirmed new chat waits for saved lock clearance before navigating', async () => {
    await render();
    await press('New chat');
    await act(async () => { requests[0].resolve({ accepted: true, sessionId: 'created-chat' }); await flush(); });
    failClear = true;
    await observeCreatedChat('created-chat');
    expect(routes).toEqual([]);
    expect(findButton('New chat').props.disabled).toBe(true);
    expect(screenText()).toContain('Could not clear');
    expect(savedReviews.size).toBe(1);
  });

  test('accepted creation cannot navigate until the exact new chat appears selected in the desktop snapshot', async () => {
    await render();
    await press('New chat');
    await act(async () => { requests[0].resolve({ accepted: true, sessionId: 'created-chat' }); await flush(); });
    expect(routes).toEqual([]);
    expect(findButton('New chat').props.disabled).toBe(true);
    expect(screenText()).toContain('Waiting');
    await press('New chat');
    expect(requests).toHaveLength(1);

    control = { ...control, snapshot: { ...control.snapshot, activeSessionId: 'created-chat' } };
    await render();
    expect(routes).toEqual([]); // selected ID alone is insufficient without the chat in this project
    control = { ...control, snapshot: {
      ...control.snapshot,
      sessions: [{ id: 'created-chat', projectId: 'project-a', title: 'New chat', updatedAt: '' }],
    } };
    await render();
    expect(routes).toEqual(['back']);
  });

  test('accepted creation without an ID cannot submit another chat silently', async () => {
    await render();
    await press('New chat');
    await act(async () => { requests[0].resolve({ accepted: true }); await flush(); });
    expect(routes).toEqual([]);
    expect(findButton('New chat').props.disabled).toBe(true);
    await press('New chat');
    expect(requests).toHaveLength(1);
    expect(screenText()).toContain('Check the chat list');
    await press('Reviewed chat list, allow another chat');
    expect(findButton('New chat').props.disabled).toBe(false);
    await press('New chat');
    expect(requests).toHaveLength(2);
  });

  test('accepted Open chat stays on Chats until the exact existing chat is selected in the current project', async () => {
    control = { ...control, snapshot: {
      ...control.snapshot,
      sessions: [
        { id: 'chat-one', projectId: 'project-a', title: 'Chat One', updatedAt: '' },
        { id: 'chat-two', projectId: 'project-a', title: 'Chat Two', updatedAt: '' },
      ],
    } };
    await render();
    await press('Open chat Chat One');
    expect(requests[0]).toMatchObject({ command: 'session.select', payload: { sessionId: 'chat-one' } });
    await act(async () => { requests[0].resolve({ accepted: true }); await flush(); });
    expect(routes).toEqual([]);
    expect(screenText()).toContain('Waiting for Chat One to be selected');
    await press('Refresh chat list');
    expect(refreshes).toBe(1);
    expect(routes).toEqual([]);
    control = { ...control, snapshot: { ...control.snapshot, activeSessionId: 'chat-two' } };
    await render();
    expect(routes).toEqual([]);
    control = { ...control, snapshot: { ...control.snapshot, activeSessionId: 'chat-one' } };
    await render();
    expect(routes).toEqual(['back']);
  });

  test('a rejected or unmounted chat selection never returns to the wrong conversation', async () => {
    control = { ...control, snapshot: {
      ...control.snapshot,
      sessions: [{ id: 'chat-one', projectId: 'project-a', title: 'Chat One', updatedAt: '' }],
    } };
    await render();
    await press('Open chat Chat One');
    await act(async () => { requests[0].resolve({ accepted: false }); await flush(); });
    expect(routes).toEqual([]);
    expect(screenText()).toContain('did not confirm the chat selection');
    await press('Open chat Chat One');
    await act(async () => { tree!.unmount(); tree = null; });
    await act(async () => { requests[1].resolve({ accepted: true }); await flush(); });
    expect(routes).toEqual([]);
  });

  test('an old host response cannot navigate, even after switching A → B → A', async () => {
    await render();
    await press('New chat');
    control = hostControl('host-b');
    await render();
    expect(findButton('New chat').props.disabled).toBe(false);
    await press('New chat');
    control = hostControl('host-a');
    await render();
    await act(async () => { requests[0].resolve({ accepted: true }); await flush(); });
    await act(async () => { requests[1].resolve({ accepted: true }); await flush(); });
    expect(routes).toHaveLength(0);
    expect(findButton('New chat').props.disabled).toBe(true);
    await press('New chat');
    expect(requests).toHaveLength(2);
  });

  test('a late create response cannot navigate after project A → B → A', async () => {
    await render();
    await press('New chat');
    expect(requests[0].payload).toEqual({ projectId: 'project-a' });
    control = hostControl('host-a');
    control.snapshot.activeProjectId = 'project-b';
    await render();
    await press('New chat');
    expect(requests[1].payload).toEqual({ projectId: 'project-b' });
    control = hostControl('host-a');
    await render();
    await act(async () => {
      requests[0].resolve({ accepted: true });
      requests[1].resolve({ accepted: true });
      await flush();
    });
    expect(routes).toHaveLength(0);
    expect(findButton('New chat').props.disabled).toBe(true);
    await press('New chat');
    expect(requests).toHaveLength(2);
  });

  test('late response after leaving Chats does not navigate', async () => {
    await render();
    await press('New chat');
    await act(async () => { tree!.unmount(); tree = null; });
    await act(async () => { requests[0].resolve({ accepted: true }); await flush(); });
    expect(routes).toHaveLength(0);
  });

  test('delete-all warns about every project and archive before allowing confirmation', async () => {
    await render();
    await press('More chat controls');
    await press('Delete all desktop chats');
    expect(screenText()).toContain('including archived chats, across ALL projects');
    await press('Confirm permanent deletion of every desktop chat');
    expect(requests).toHaveLength(1);
    expect(requests[0].command).toBe('session.delete_all');
    await act(async () => { requests[0].resolve({ accepted: false }); await flush(); });
    expect(routes).toHaveLength(0);
    expect(screenText()).toContain('Chat deletion was not confirmed');
  });

  test('accepted delete-all remains on Chats and retains its host-wide review lock after remount', async () => {
    await render();
    await press('More chat controls');
    await press('Delete all desktop chats');
    await press('Confirm permanent deletion of every desktop chat');
    expect(requests).toHaveLength(1);
    expect(savedReviews.size).toBe(1);
    await act(async () => { requests[0].resolve({ accepted: true }); await flush(); });
    expect(routes).toEqual([]);
    expect(screenText()).toContain('Check active and archived chats on the desktop');
    await act(async () => { tree!.unmount(); tree = null; });
    await render();
    control = { ...control, snapshot: { ...control.snapshot, activeProjectId: 'project-b' } };
    await render();
    await press('More chat controls');
    expect(findButton('Delete all desktop chats').props.disabled).toBe(true);
    expect(requests).toHaveLength(1);
    await press('I checked active and archived chats on desktop');
    expect(savedReviews.size).toBe(0);
    expect(findButton('Delete all desktop chats').props.disabled).toBe(false);
  });

  test('lost delete-all response blocks a second mutation across A → B → A hosts', async () => {
    await render();
    await press('More chat controls');
    await press('Delete all desktop chats');
    await press('Confirm permanent deletion of every desktop chat');
    await act(async () => { requests[0].reject(new Error('response lost')); await flush(); });
    expect(savedReviews.size).toBe(1);
    expect(routes).toHaveLength(0);
    control = hostControl('host-b');
    await render();
    await press('More chat controls');
    expect(findButton('Delete all desktop chats').props.disabled).toBe(false);
    control = hostControl('host-a');
    await render();
    await press('More chat controls');
    expect(findButton('Delete all desktop chats').props.disabled).toBe(true);
    expect(requests).toHaveLength(1);
  });

  test('the reopened chat menu explains why another desktop deletion is disabled', async () => {
    await render();
    await press('More chat controls');
    await press('Delete all desktop chats');
    await press('Confirm permanent deletion of every desktop chat');
    await act(async () => { requests[0].resolve({ accepted: true }); await flush(); });
    await press('More chat controls');
    expect(findButton('Delete all desktop chats').props.disabled).toBe(true);
    expect(screenText()).toContain('Close this menu to review the earlier deletion');
  });

  test('saved deletion review read and clear failures never unlock another delete', async () => {
    failRead = true;
    await render();
    await press('More chat controls');
    expect(findButton('Delete all desktop chats').props.disabled).toBe(true);
    expect(screenText()).toContain('Saved deletion status could not be read');
    await press('Close chat controls');
    failRead = false;
    await press('Retry saved deletion status');
    await press('More chat controls');
    await press('Delete all desktop chats');
    await press('Confirm permanent deletion of every desktop chat');
    await act(async () => { requests[0].resolve({ accepted: true }); await flush(); });
    failClear = true;
    await press('I checked active and archived chats on desktop');
    expect(screenText()).toContain('Could not clear the saved deletion status');
    await press('More chat controls');
    expect(findButton('Delete all desktop chats').props.disabled).toBe(true);
    expect(requests).toHaveLength(1);
  });

  test('failed durable delete review write never sends a destructive command', async () => {
    failWrite = true;
    await render();
    await press('More chat controls');
    await press('Delete all desktop chats');
    await press('Confirm permanent deletion of every desktop chat');
    expect(requests).toHaveLength(0);
    expect(findButton('Delete all desktop chats').props.disabled).toBe(true);
    expect(routes).toHaveLength(0);
  });

  test('an explicitly rejected delete-all clears its review lock for a deliberate retry', async () => {
    await render();
    await press('More chat controls');
    await press('Delete all desktop chats');
    await press('Confirm permanent deletion of every desktop chat');
    expect(savedReviews.size).toBe(1);
    await act(async () => { requests[0].resolve({ accepted: false }); await flush(); });
    expect(savedReviews.size).toBe(0);
    expect(findButton('Delete all desktop chats').props.disabled).toBe(false);
    expect(routes).toEqual([]);
  });
}
