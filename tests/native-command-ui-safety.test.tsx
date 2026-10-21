import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

// Isolate React Native and provider mocks from the other integration suites.
if (process.env.KORY_NATIVE_COMMAND_UI_CHILD !== '1') {
  test('native command UI prevents duplicate and unavailable submissions', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_NATIVE_COMMAND_UI_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Native command UI tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let available = true;
  let requests: { name: string; payload: Record<string, unknown>; resolve: (value: { accepted: boolean }) => void; reject: (error: Error) => void }[] = [];
  const snapshot = {
    activeSessionId: 'chat-1',
    activeProjectId: 'project-1',
    agents: [{ id: 'kory-manager', provider: 'codex' }],
    modelCatalog: [{ id: 'model-1', selection: 'codex:model-1', provider: 'codex' }],
    sessions: [{ id: 'chat-1' }, { id: 'chat-2' }],
  };
  const control = {
    snapshot,
    pairing: { baseUrl: 'https://host-a.invalid', machineId: 'host-a' },
    modelChoices: {},
    live: { nativeCommands: {} },
    inspect: async (_name: string, payload: { provider: string }) => ({
      provider: payload.provider, label: 'Codex',
      commands: available ? [{ command: 'status', description: 'Show status' }] : [],
    }),
    sendCommand: (name: string, payload: Record<string, unknown>) => new Promise<{ accepted: boolean }>((resolve, reject) => {
      requests.push({ name, payload, resolve, reject });
    }),
  };

  mock.module('react-native', () => ({
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text',
    TextInput: 'TextInput', View: 'View',
    StyleSheet: { create: (styles: unknown) => styles },
  }));
  mock.module('lucide-react-native', () => ({ Play: 'Play' }));
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  mock.module('../src/theme/tokens', () => ({
    colors: { textMuted: '#888', textPrimary: '#fff', textSecondary: '#ccc', accent: '#f85' },
    radii: { md: 8, lg: 12 }, spacing: { xs: 4, sm: 8, md: 16, huge: 36 },
    type: { xs: 12, sm: 14 },
  }));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
  }));

  const { NativeCommandsView } = await import('../src/components/NativeCommandsView');
  let tree: TestRenderer.ReactTestRenderer;
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const mount = async () => {
    requests = [];
    await act(async () => { tree = TestRenderer.create(<NativeCommandsView />); });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      await flush();
    });
  };
  const input = () => tree.root.findByType('TextInput' as any);
  const runButton = () => tree.root.findByType('ActionButton' as any);
  const setCommand = async (text: string) => {
    await act(async () => { input().props.onChangeText(text); });
  };
  const unmount = async () => { await act(async () => { tree.unmount(); }); };

  test('rapid tap plus keyboard submit sends one command and retains edits made while pending', async () => {
    available = true;
    await mount();
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Insert command /status' })).toHaveLength(1);
    await setCommand('/status');
    await act(async () => {
      runButton().props.onPress();
      input().props.onSubmitEditing();
      await flush();
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe('native_command.run');
    expect(requests[0].payload).toEqual({ sessionId: 'chat-1', command: '/status' });
    await setCommand('/context');
    await act(async () => { requests[0].resolve({ accepted: true }); await flush(); });
    expect(input().props.value).toBe('/context');
    await unmount();
  });

  test('an unavailable command catalog blocks keyboard submission', async () => {
    available = false;
    await mount();
    await setCommand('/status');
    expect(runButton().props.disabled).toBe(true);
    await act(async () => { input().props.onSubmitEditing(); await flush(); });
    expect(requests).toHaveLength(0);
    await unmount();
  });

  test('failed acknowledgement keeps command draft and shows retry guidance', async () => {
    available = true;
    await mount();
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Insert command /status' })).toHaveLength(1);
    await setCommand('/status');
    await act(async () => {
      runButton().props.onPress();
      await flush();
      requests[0].reject(new Error('Host unavailable'));
      await flush();
    });
    expect(input().props.value).toBe('/status');
    const copy = tree.root.findAllByType('Text' as any).map((item) => item.children.join(' ')).join(' ');
    expect(copy).toContain('Check the desktop');
    await unmount();
  });

  test('old host or chat completion cannot erase a new context draft or show its error', async () => {
    available = true;
    await mount();
    await setCommand('/status');
    await act(async () => { runButton().props.onPress(); await flush(); });
    expect(requests).toHaveLength(1);

    snapshot.activeSessionId = 'chat-2';
    control.pairing = { baseUrl: 'https://host-b.invalid', machineId: 'host-b' };
    await act(async () => { tree.update(<NativeCommandsView />); await flush(); });
    await setCommand('/status');
    await act(async () => { requests[0].resolve({ accepted: true }); await flush(); });
    expect(input().props.value).toBe('/status');
    await unmount();

    await mount();
    await setCommand('/status');
    await act(async () => { runButton().props.onPress(); await flush(); });
    snapshot.activeSessionId = 'chat-1';
    await act(async () => { tree.update(<NativeCommandsView />); await flush(); });
    await act(async () => { requests[0].reject(new Error('Old host unavailable')); await flush(); });
    expect(tree.root.findAllByProps({ accessibilityRole: 'alert' })).toHaveLength(0);
    await unmount();

    snapshot.activeSessionId = 'chat-1';
    control.pairing = { baseUrl: 'https://host-a.invalid', machineId: 'host-a' };
  });

  test('edited command restored to the same text is retained after acknowledgement', async () => {
    available = true;
    await mount();
    await setCommand('/status');
    await act(async () => { runButton().props.onPress(); await flush(); });
    await setCommand('/help');
    await setCommand('/status');
    await act(async () => { requests[0].resolve({ accepted: true }); await flush(); });
    expect(input().props.value).toBe('/status');
    await unmount();
  });
}
