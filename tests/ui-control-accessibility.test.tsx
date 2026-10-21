import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_UI_A11Y_TEST_CHILD !== '1') {
  test('shared buttons expose disabled and loading state to assistive technology', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_UI_A11Y_TEST_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Shared button checks failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.module('react-native', () => ({
    ActivityIndicator: 'ActivityIndicator', Appearance: { getColorScheme: () => 'dark' },
    Pressable: 'Pressable', Text: 'Text', View: 'View',
    StyleSheet: { create: (styles: unknown) => styles },
  }));

  const { ActionButton, IconButton } = await import('../src/components/ui');
  const Icon = () => React.createElement('Icon');
  const onPress = () => {};
  let tree: TestRenderer.ReactTestRenderer;

  await act(async () => {
    tree = TestRenderer.create(<ActionButton label="Restart agent" onPress={onPress} />);
  });
  const button = () => tree.root.findByType('Pressable');
  expect(button().props.accessibilityLabel).toBe('Restart agent');
  expect(button().props.accessibilityState).toEqual({ disabled: false, busy: false });

  await act(async () => {
    tree.update(<ActionButton label="Restart agent" onPress={onPress} loading />);
  });
  expect(button().props.disabled).toBe(true);
  expect(button().props.accessibilityState).toEqual({ disabled: true, busy: true });

  await act(async () => {
    tree.update(<ActionButton label="Restart agent" onPress={onPress} disabled />);
  });
  expect(button().props.accessibilityState).toEqual({ disabled: true, busy: false });

  await act(async () => {
    tree.update(<IconButton icon={Icon} label="Refresh remote state" onPress={onPress} disabled />);
  });
  expect(button().props.accessibilityLabel).toBe('Refresh remote state');
  expect(button().props.accessibilityState).toEqual({ disabled: true });

  await act(async () => {
    tree.update(<IconButton icon={Icon} label="Refresh remote state" onPress={onPress} />);
  });
  expect(button().props.accessibilityState).toEqual({ disabled: false });
  await act(async () => { tree.unmount(); });
}
