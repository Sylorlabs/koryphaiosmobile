import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORYPHAIOS_FEEDBACK_TEST_CHILD !== '1') {
  test('pairing feedback only appears on the relevant screen', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_FEEDBACK_TEST_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Feedback tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let pathname = '/machines';
  const control = {
    commandStatuses: [],
    dismissCommandStatus: () => {},
    error: 'Could not reach a desktop',
    pairing: null,
    refreshing: false,
    refresh: () => {},
  };
  mock.module('react-native', () => ({
    AccessibilityInfo: { announceForAccessibility: () => {} },
    ActivityIndicator: 'ActivityIndicator',
    Appearance: { getColorScheme: () => 'dark' },
    Pressable: 'Pressable',
    StyleSheet: { create: (styles: unknown) => styles },
    Text: 'Text', View: 'View',
  }));
  mock.module('expo-router', () => ({
    router: { push: () => {} },
    useFocusEffect: (callback: () => void) => React.useEffect(callback, []),
    usePathname: () => pathname,
  }));
  mock.module('lucide-react-native', () => Object.fromEntries([
    'CheckCircle2', 'CircleAlert', 'CircleDot', 'RefreshCw', 'X',
  ].map((name) => [name, `Icon${name}`])));
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  const { CommandFeedback } = await import('../src/components/CommandFeedback');
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(<CommandFeedback />); });
  expect(tree!.toJSON()).toBeNull();
  pathname = '/link-device';
  await act(async () => { tree.update(<CommandFeedback />); });
  expect(tree!.toJSON()).toBeNull();
  pathname = '/workspace';
  await act(async () => { tree.update(<CommandFeedback />); });
  expect(tree!.root.findAllByProps({ testID: 'command-feedback' }).length).toBe(1);
  await act(async () => { tree.unmount(); });
}
