// Keep native component mocks isolated from the other Bun tests.
import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_CONTROL_HUB_SAFETY_CHILD !== '1') {
  test('Controls new chat stays scoped to its host and project', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_CONTROL_HUB_SAFETY_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Controls safety failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.module('react-native', () => ({
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
    StyleSheet: { create: (styles: unknown) => styles },
  }));
  const routes: string[] = [];
  mock.module('expo-router', () => ({
    router: { back: () => routes.push('back'), replace: (path: string) => routes.push(`replace:${path}`) },
  }));
  const icons = [
    'Activity', 'Bot', 'BookOpen', 'Boxes', 'CircleDollarSign', 'ChevronRight',
    'FileText', 'Folders', 'GitBranch', 'History', 'Images', 'Laptop',
    'ListChecks', 'MemoryStick', 'MessageSquarePlus', 'MessagesSquare',
    'Monitor', 'Palette', 'Plug', 'Settings', 'Share2', 'SlidersHorizontal',
    'Sparkles', 'Target', 'Terminal', 'Users', 'Workflow',
  ];
  mock.module('lucide-react-native', () => Object.fromEntries(icons.map((icon) => [icon, icon])));
  mock.module('../src/components/MobileSurface', () => ({
    MobileSurface: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  }));
  mock.module('../src/theme/tokens', () => ({
    colors: { accent: '#5af', onAccent: '#000', accentSoft: '#222', textMuted: '#aaa',
      textSecondary: '#ccc', textPrimary: '#fff', surface1: '#111', warning: '#fa0' },
    radii: { lg: 12 }, spacing: { xs: 4, sm: 8, md: 16, xl: 28 }, type: { sm: 14 },
  }));

  type Request = { command: string; payload: unknown; resolve: (value: { accepted: boolean; sessionId?: string }) => void };
  const requests: Request[] = [];
  const makeControl = (host: string, project: string) => ({
    pairing: { baseUrl: `https://${host}.example`, machineId: host },
    snapshot: { activeProjectId: project, activeSessionId: 'chat-a' },
    sendCommand: (command: string, payload: unknown) => new Promise<{ accepted: boolean; sessionId?: string }>((resolve) => {
      requests.push({ command, payload, resolve });
    }),
  });
  let control = makeControl('host-a', 'project-a');
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  const { MobileControlHub } = await import('../src/components/MobileControlHub');
  let tree: TestRenderer.ReactTestRenderer | null = null;
  const flush = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };
  const render = async () => {
    await act(async () => {
      if (tree) tree.update(<MobileControlHub />);
      else tree = TestRenderer.create(<MobileControlHub />);
      await flush();
    });
  };
  const newChat = () => tree!.root.findAllByType('Pressable' as any)
    .find((node) => node.props.accessibilityLabel === 'New chat')!;
  const press = async () => {
    await act(async () => { newChat().props.onPress(); await flush(); });
  };
  const resolve = async (index: number, accepted = true, sessionId = 'new-chat') => {
    await act(async () => { requests[index].resolve({ accepted, sessionId }); await flush(); });
  };
  const observeChat = async (sessionId: string) => {
    control = { ...control, snapshot: { ...control.snapshot, activeSessionId: sessionId } };
    await render();
  };
  const copy = () => tree!.root.findAllByType('Text' as any)
    .map((node) => node.children.join(' ')).join(' ');

  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = null;
    requests.length = routes.length = 0;
    control = makeControl('host-a', 'project-a');
  });

  test('a pending request from host A cannot close the sheet after A → B → A', async () => {
    await render();
    await press();
    await press();
    expect(requests).toHaveLength(1);
    expect(requests[0].payload).toEqual({ projectId: 'project-a' });

    control = makeControl('host-b', 'project-b');
    await render();
    expect(newChat().props.disabled).toBe(false);
    await press();
    expect(requests).toHaveLength(2);
    expect(requests[1].payload).toEqual({ projectId: 'project-b' });

    control = makeControl('host-a', 'project-a');
    await render();
    await resolve(0);
    await resolve(1);
    expect(routes).toEqual([]);
    await press();
    expect(requests).toHaveLength(3);
    await resolve(2);
    expect(routes).toEqual([]);
    await observeChat('new-chat');
    expect(routes).toEqual(['back']);
  });

  test('changing projects on the same host invalidates a late success', async () => {
    await render();
    await press();
    control = makeControl('host-a', 'project-b');
    await render();
    await press();
    await resolve(0);
    expect(routes).toEqual([]);
    await resolve(1);
    expect(routes).toEqual([]);
    await observeChat('new-chat');
    expect(routes).toEqual(['back']);
  });

  test('a rejected create leaves the sheet open and shows safe retry guidance', async () => {
    await render();
    await press();
    expect(newChat().props.accessibilityState.busy).toBe(true);
    await resolve(0, false);
    expect(routes).toEqual([]);
    expect(copy()).toContain('new chat was not confirmed');
    expect(newChat().props.disabled).toBe(false);
    await press();
    expect(requests).toHaveLength(2);
  });

  test('accepted creation waits for matching chat in host snapshot and prevents a duplicate', async () => {
    await render();
    await press();
    await resolve(0, true, 'new-chat');
    expect(routes).toEqual([]);
    expect(newChat().props.disabled).toBe(true);
    expect(copy()).toContain('Waiting');
    await observeChat('other-chat');
    expect(routes).toEqual([]);
    await press();
    expect(requests).toHaveLength(1);
    await observeChat('new-chat');
    expect(routes).toEqual(['back']);
  });

  test('accepted creation without a chat identity does not close Controls', async () => {
    await render();
    await press();
    await resolve(0, true, '');
    expect(routes).toEqual([]);
    expect(newChat().props.disabled).toBe(true);
    expect(copy()).toContain('Check Chats');
  });
}
