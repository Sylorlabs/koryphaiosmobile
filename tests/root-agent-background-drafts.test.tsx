import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

// Mock the native shell in a child so its module overrides cannot affect other UI tests.
if (process.env.KORYPHAIOS_ROOT_DRAFTS_CHILD !== '1') {
  test('root lifecycle saves agent drafts when iOS suspends the app', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_ROOT_DRAFTS_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Root draft lifecycle failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const handlers = new Set<(state: string) => void>();
  let flushCount = 0;
  let failNext = false;

  mock.module('react-native', () => ({
    AppState: {
      addEventListener: (event: string, listener: (state: string) => void) => {
        expect(event).toBe('change');
        handlers.add(listener);
        return { remove: () => { handlers.delete(listener); } };
      },
    },
  }));
  const Stack = Object.assign(
    ({ children }: { children: React.ReactNode }) => React.createElement('Stack', null, children),
    { Screen: () => null },
  );
  mock.module('expo-router', () => ({ Stack }));
  mock.module('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
  mock.module('expo-system-ui', () => ({ setBackgroundColorAsync: async () => {} }));
  mock.module('react-native-safe-area-context', () => ({
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    initialWindowMetrics: null,
  }));
  mock.module('react-native-keyboard-controller', () => ({
    KeyboardProvider: ({ children }: { children: React.ReactNode }) => children,
  }));
  mock.module('../src/control/ControlProvider', () => ({
    ControlProvider: ({ children }: { children: React.ReactNode }) => children,
    useControl: () => ({}),
  }));
  mock.module('../src/control/LinkedDeviceProvider', () => ({
    LinkedDeviceProvider: ({ children }: { children: React.ReactNode }) => children,
  }));
  mock.module('../src/control/agentMessageDrafts', () => ({
    agentMessageDrafts: {
      flush: async () => {
        flushCount++;
        if (failNext) { failNext = false; throw new Error('Device storage unavailable'); }
      },
    },
  }));
  mock.module('../src/theme/tokens', () => ({
    colors: { surface1: '#111111' }, isLightTheme: () => false,
  }));

  const { default: RootLayout } = await import('../src/app/_layout');
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(<RootLayout />); });
  expect(handlers.size).toBe(1);
  const notify = async (state: string) => {
    await act(async () => {
      for (const listener of handlers) listener(state);
      await Promise.resolve();
    });
  };

  test('inactive and background flush immediately; foreground does not', async () => {
    await notify('active');
    expect(flushCount).toBe(0);
    await notify('inactive');
    expect(flushCount).toBe(1);
    await notify('background');
    expect(flushCount).toBe(2);
  });

  test('a failed flush does not stop later saves; unmount removes the listener', async () => {
    failNext = true;
    await notify('background');
    expect(flushCount).toBe(3);
    await notify('inactive');
    expect(flushCount).toBe(4);
    await act(async () => { tree.unmount(); });
    expect(handlers.size).toBe(0);
    await notify('background');
    expect(flushCount).toBe(4);
  });
}
