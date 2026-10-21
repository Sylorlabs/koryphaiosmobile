import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_CONTEXT_POPOVER_TEST_CHILD !== '1') {
  test('context visibility is accessible and cannot repeat an in-flight edit', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_CONTEXT_POPOVER_TEST_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Context visibility checks failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.module('react-native', () => ({
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
    Appearance: { getColorScheme: () => 'dark' },
    useWindowDimensions: () => ({ width: 393, height: 852 }),
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {}, hairlineWidth: 1 },
  }));
  mock.module('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
  }));
  const Icon = () => React.createElement('Icon');
  mock.module('lucide-react-native', () => ({
    ChevronDown: Icon, ChevronUp: Icon, Eye: Icon, EyeOff: Icon,
  }));
  mock.module('../src/components/MobileSurface', () => ({
    buildContextSegments: () => [], CONTEXT_SEGMENT_DEFINITIONS: [],
    formatTokens: String, MobileContextRing: () => React.createElement('Ring'),
  }));

  function deferred() {
    let resolve!: (value: { accepted: boolean }) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<{ accepted: boolean }>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  }
  const pending: ReturnType<typeof deferred>[] = [];
  const calls: { name: string; payload?: Record<string, unknown> }[] = [];
  let selectedHost = 'host-a';
  let selectedSession = 'chat-a';
  let hidden = false;
  const sendCommand = (name: string, payload?: Record<string, unknown>) => {
    calls.push({ name, payload });
    const operation = deferred();
    pending.push(operation);
    return operation.promise;
  };
  mock.module('../src/control/ControlProvider', () => ({
    useControl: () => ({
      snapshot: {
        machine: { id: selectedHost }, activeSessionId: selectedSession,
        context: {
          used: 10, limit: 100, cached: 0,
          archive: [{ id: 'entry-a', label: 'Command output', kind: 'tool',
            content: 'Sample response', prunedForAgent: hidden }],
        },
      }, sendCommand,
    }),
  }));
  const { MobileContextPopover } = await import('../src/components/MobileContextPopover');
  let tree: TestRenderer.ReactTestRenderer;

  const button = (name: string) => tree.root.findAllByType('Pressable').find(
    (node) => node.props.accessibilityLabel === name,
  );
  const visibility = () => button(hidden
    ? 'Show this context to the agent' : 'Hide this context from the agent');

  await act(async () => {
    tree = TestRenderer.create(<MobileContextPopover visible onClose={() => {}} />);
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  await act(async () => { button('Expand context details')!.props.onPress(); });
  await act(async () => { button('Expand context activity')!.props.onPress(); });

  const initial = visibility()!;
  expect(initial).toBeDefined();
  const rawStyle = typeof initial.props.style === 'function'
    ? initial.props.style({ pressed: false }) : initial.props.style;
  const style = Array.isArray(rawStyle) ? Object.assign({}, ...rawStyle.filter(Boolean)) : rawStyle;
  expect(style.width).toBeGreaterThanOrEqual(44);
  expect(style.height).toBeGreaterThanOrEqual(44);

  await act(async () => {
    initial.props.onPress();
    initial.props.onPress();
  });
  expect(calls).toEqual([{ name: 'context.visibility', payload: {
    sessionId: 'chat-a', archiveId: 'entry-a', hiddenFromAgent: true,
  } }]);
  expect(visibility()!.props.disabled).toBe(true);
  expect(visibility()!.props.accessibilityState).toEqual({ disabled: true, busy: true });

  await act(async () => { pending[0].reject(new Error('Host unavailable')); });
  expect(visibility()!.props.disabled).toBe(false);
  await act(async () => { visibility()!.props.onPress(); });
  expect(calls).toHaveLength(2);

  await act(async () => {
    selectedHost = 'host-b';
    tree.update(<MobileContextPopover visible onClose={() => {}} />);
  });
  expect(visibility()!.props.disabled).toBe(false);
  await act(async () => { visibility()!.props.onPress(); });
  expect(calls).toHaveLength(3);

  await act(async () => {
    hidden = true;
    tree.update(<MobileContextPopover visible onClose={() => {}} />);
    pending[1].resolve({ accepted: true });
    pending[2].resolve({ accepted: true });
  });
  expect(visibility()!.props.disabled).toBe(false);
  expect(visibility()!.props.accessibilityLabel).toContain('Show this context');
  await act(async () => { tree.unmount(); });
}
