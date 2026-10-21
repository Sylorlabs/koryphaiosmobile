import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_ADAPTIVE_SHELL_CHILD !== '1') {
  test('adaptive iPad rail reuses routes and avoids redundant navigation', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_ADAPTIVE_SHELL_CHILD: '1' },
      encoding: 'utf8', timeout: 25_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Adaptive shell failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 30_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let pathname = '/workspace';
  let viewport = { width: 1080, height: 810 };
  const navigation: string[] = [];
  mock.module('expo-router', () => ({
    router: {
      push: (route: string) => navigation.push(`push:${route}`),
      navigate: (route: string) => navigation.push(`navigate:${route}`),
      replace: (route: string) => navigation.push(`replace:${route}`),
      canGoBack: () => false,
    },
    usePathname: () => pathname,
  }));
  mock.module('react-native', () => ({
    Appearance: { getColorScheme: () => 'dark' },
    Platform: { OS: 'ios', isPad: true },
    Dimensions: { get: () => ({ width: 1180, height: 820 }) },
    View: 'View', Image: 'Image', Text: 'Text', Pressable: 'Pressable',
    useWindowDimensions: () => viewport,
    StyleSheet: { create: (styles: unknown) => styles },
  }));
  mock.module('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
  mock.module('../assets/kory-logo.png', () => ({ default: 'mock-kory-logo' }));
  mock.module('lucide-react-native', () => Object.fromEntries(
    ['Activity', 'ArrowLeft', 'Bot', 'House', 'Monitor', 'RefreshCw', 'Settings']
      .map((name) => [name, `Icon${name}`]),
  ));
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => ({
    snapshot: { machine: { id: 'machine-a', name: 'Office Mac', status: 'online' } },
    pairing: { machineId: 'machine-a', baseUrl: 'https://test.invalid' },
    live: { connection: 'connected' }, refreshing: false, refresh: async () => {},
  }) }));
  mock.module('../src/control/connectionPresentation', () => ({
    machineDisplayName: () => 'Office Mac',
    machineLivePresentation: () => ({ label: 'Connected', status: 'online' }),
  }));
  mock.module('../src/components/ui', () => ({
    IconButton: (props: Record<string, unknown>) => React.createElement('IconButton', props),
    StatusDot: 'StatusDot',
  }));
  mock.module('../src/components/CommandFeedback', () => ({ CommandFeedback: () => null }));
  const { AdaptiveShell } = await import('../src/components/AdaptiveShell');
  let tree: TestRenderer.ReactTestRenderer | null = null;
  const render = async (route: string) => {
    pathname = route;
    await act(async () => {
      if (tree) tree.update(<AdaptiveShell title="Agents"><React.Fragment /></AdaptiveShell>);
      else tree = TestRenderer.create(<AdaptiveShell title="Agents"><React.Fragment /></AdaptiveShell>);
    });
  };
  const tap = async (label: string) => {
    const button = tree!.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
    expect(button).toBeDefined();
    await act(async () => { button.props.onPress(); });
  };
  afterEach(async () => {
    if (tree) await act(async () => { tree!.unmount(); });
    tree = null;
    pathname = '/workspace';
    viewport = { width: 1080, height: 810 };
    navigation.length = 0;
  });

  test('repeated taps on the current rail section do not push another copy', async () => {
    await render('/agents');
    const selected = tree!.root.findAll((node) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === 'Agents')[0];
    expect(selected.props.accessibilityState).toEqual({ selected: true });
    await tap('Agents');
    await tap('Agents');
    expect(navigation).toEqual([]);
  });

  test('switching sections navigates to an existing root instead of always pushing', async () => {
    await render('/workspace');
    await tap('Agents');
    expect(navigation).toEqual(['navigate:/agents']);
  });

  test('tapping an active section from a nested page returns to its root', async () => {
    await render('/agents/worker-a');
    await tap('Agents');
    expect(navigation).toEqual(['navigate:/agents']);
  });

  test('compact iPhone and resizable iPad windows use Back instead of an unreachable rail', async () => {
    viewport = { width: 393, height: 852 };
    await render('/settings');
    expect(tree!.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Agents')).toHaveLength(0);
    await tap('Back');
    expect(navigation).toEqual(['replace:/workspace']);

    viewport = { width: 780, height: 620 };
    await render('/settings');
    expect(tree!.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Agents')).toHaveLength(0);
    expect(tree!.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Back')).toHaveLength(1);

    viewport = { width: 960, height: 800 };
    await render('/settings');
    expect(tree!.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Agents')).toHaveLength(1);
    expect(tree!.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Back')).toHaveLength(0);
  });

  test('the root slash alias does not add a second workspace stack entry', async () => {
    await render('/');
    await tap('Workspace');
    expect(navigation).toEqual([]);
  });
}
